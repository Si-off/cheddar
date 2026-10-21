import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import type {
  CreateFeatureGroupDto,
  CreateProjectDto,
  CreateScreenDto,
  FeatureGroupDto,
  MemoDto,
  ProjectDto,
  ProjectListDto,
  ScreenDto,
  TemplateDto,
  UpdateFeatureGroupDto,
  UpdateProjectDto,
  UpdateScreenDto,
} from "../contracts/project.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  accounts,
  featureGroups,
  projectMemos,
  projects,
  projectTemplates,
  screenStructureItems,
} from "../database/schema";
import { defaultColumns, validateTemplate } from "./template";

const groupFields = {
  id: featureGroups.id,
  name: featureGroups.name,
  description: featureGroups.description,
};
const screenFields = {
  id: screenStructureItems.id,
  screenId: screenStructureItems.screenId,
  name: screenStructureItems.name,
  parentId: screenStructureItems.parentId,
  description: screenStructureItems.description,
};
const conflict = (code: string, message: string) =>
  new ApiError(409, code, message);
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  private async project(id: string, db: IdentityDatabase = this.database.db) {
    const [row] = await db.select().from(projects).where(eq(projects.id, id));
    if (!row) throw notFound();
    return row;
  }
  // 같은 프로젝트의 설정 변경을 직렬화해 순서와 화면의 부모 관계를 지킨다.
  private mutate<T>(
    projectId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!row) throw notFound();
      return work(tx);
    });
  }
  async detail(
    id: string,
    accountId: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<ProjectDto> {
    const access = this.authorization.projectAccess(
      await this.authorization.effective(accountId, db),
      id,
    );
    if (!access.canView) throw notFound();
    const row = await this.project(id, db);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      canManage: access.canManage,
    };
  }
  private async assertView(id: string, accountId: string) {
    if (!(await this.authorization.canViewProject(accountId, id)))
      throw notFound();
    await this.project(id);
  }
  async list(accountId: string): Promise<ProjectListDto> {
    const grants = await this.authorization.effective(accountId);
    const rows = await this.database.db
      .select()
      .from(projects)
      .orderBy(projects.name, projects.id);
    const items = await Promise.all(
      rows
        .filter(
          (row) => this.authorization.projectAccess(grants, row.id).canView,
        )
        .map(async (row) => {
          const [template] = await this.database.db
            .select()
            .from(projectTemplates)
            .where(eq(projectTemplates.projectId, row.id));
          const screens = await this.database.db
            .select({ id: screenStructureItems.id })
            .from(screenStructureItems)
            .where(eq(screenStructureItems.projectId, row.id));
          return {
            id: row.id,
            name: row.name,
            description: row.description,
            columnCount: template?.columns.length ?? 0,
            screenCount: screens.length,
            canManage: this.authorization.projectAccess(grants, row.id)
              .canManage,
          };
        }),
    );
    return { items };
  }
  async create(accountId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({
          name: dto.name.trim(),
          description: (dto.description ?? "").trim(),
          createdBy: accountId,
        })
        .returning();
      await tx
        .insert(projectTemplates)
        .values({ projectId: row.id, columns: defaultColumns() });
      await tx
        .insert(projectMemos)
        .values({ projectId: row.id, authorId: accountId, body: "" });
      const access = this.authorization.projectAccess(
        await this.authorization.effective(accountId, tx),
        row.id,
      );
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        canManage: access.canManage,
      };
    });
  }
  async update(id: string, accountId: string, dto: UpdateProjectDto) {
    return this.mutate(id, async (tx) => {
      await tx
        .update(projects)
        .set({
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.description === undefined
            ? {}
            : { description: dto.description.trim() }),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id));
      return this.detail(id, accountId, tx);
    });
  }
  async template(projectId: string, accountId: string): Promise<TemplateDto> {
    await this.assertView(projectId, accountId);
    const [row] = await this.database.db
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.projectId, projectId));
    if (!row) throw notFound();
    return { revision: row.revision, columns: row.columns };
  }
  async saveTemplate(projectId: string, input: unknown): Promise<TemplateDto> {
    const dto = validateTemplate(input);
    return this.mutate(projectId, async (tx) => {
      const [row] = await tx
        .update(projectTemplates)
        .set({
          columns: dto.columns,
          revision: dto.revision + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectTemplates.projectId, projectId),
            eq(projectTemplates.revision, dto.revision),
          ),
        )
        .returning();
      if (!row)
        throw conflict("TEMPLATE_CONFLICT", "다른 사람이 먼저 저장했습니다.");
      return { revision: row.revision, columns: row.columns };
    });
  }
  private groups(projectId: string, db: IdentityDatabase = this.database.db) {
    return db
      .select(groupFields)
      .from(featureGroups)
      .where(eq(featureGroups.projectId, projectId))
      .orderBy(featureGroups.position, featureGroups.id);
  }
  async listGroups(projectId: string, accountId: string) {
    await this.assertView(projectId, accountId);
    return { items: await this.groups(projectId) };
  }
  async saveGroup(
    projectId: string,
    dto: CreateFeatureGroupDto | UpdateFeatureGroupDto,
    id?: string,
  ): Promise<FeatureGroupDto> {
    return this.mutate(projectId, async (tx) => {
      const all = await tx
        .select()
        .from(featureGroups)
        .where(eq(featureGroups.projectId, projectId));
      const current = id ? all.find((row) => row.id === id) : undefined;
      if (id && !current) throw notFound();
      const name = dto.name?.trim() ?? current?.name ?? "";
      if (all.some((row) => row.name === name && row.id !== id))
        throw conflict("DUPLICATE_NAME", "같은 이름의 기능 그룹이 있습니다.");
      const values = {
        name,
        description: dto.description?.trim() ?? current?.description ?? "",
      };
      const [row] = id
        ? await tx
            .update(featureGroups)
            .set(values)
            .where(
              and(
                eq(featureGroups.projectId, projectId),
                eq(featureGroups.id, id),
              ),
            )
            .returning(groupFields)
        : await tx
            .insert(featureGroups)
            .values({
              ...values,
              projectId,
              position: Math.max(-1, ...all.map((row) => row.position)) + 1,
            })
            .returning(groupFields);
      return row;
    });
  }
  async removeGroup(projectId: string, id: string) {
    return this.mutate(projectId, async (tx) => {
      const rows = await tx
        .delete(featureGroups)
        .where(
          and(eq(featureGroups.projectId, projectId), eq(featureGroups.id, id)),
        )
        .returning({ id: featureGroups.id });
      if (!rows.length) throw notFound();
    });
  }
  async orderGroups(projectId: string, ids: string[]) {
    return this.mutate(projectId, async (tx) => {
      const all = await this.groups(projectId, tx);
      const normalized = ids.map((id) => id.toLowerCase());
      if (
        normalized.length !== all.length ||
        new Set(normalized).size !== all.length ||
        normalized.some((id) => !all.some((row) => row.id === id))
      )
        throw conflict(
          "STALE_ORDER",
          "기능 그룹 목록이 바뀌었습니다. 새로 고친 뒤 다시 정렬하세요.",
        );
      for (const [position, id] of normalized.entries())
        await tx
          .update(featureGroups)
          .set({ position })
          .where(
            and(
              eq(featureGroups.projectId, projectId),
              eq(featureGroups.id, id),
            ),
          );
      return { items: await this.groups(projectId, tx) };
    });
  }
  async listScreens(projectId: string, accountId: string) {
    await this.assertView(projectId, accountId);
    const all = await this.database.db
      .select(screenFields)
      .from(screenStructureItems)
      .where(eq(screenStructureItems.projectId, projectId))
      .orderBy(screenStructureItems.position, screenStructureItems.id);
    const children = new Map<string | null, ScreenDto[]>();
    for (const row of all)
      children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
    const items: ScreenDto[] = [];
    const pending = [...(children.get(null) ?? [])].reverse();
    while (pending.length) {
      const row = pending.pop();
      if (!row) break;
      items.push(row);
      pending.push(...[...(children.get(row.id) ?? [])].reverse());
    }
    return { items };
  }
  async saveScreen(
    projectId: string,
    dto: CreateScreenDto | UpdateScreenDto,
    id?: string,
  ): Promise<ScreenDto> {
    return this.mutate(projectId, async (tx) => {
      const all = await tx
        .select()
        .from(screenStructureItems)
        .where(eq(screenStructureItems.projectId, projectId));
      const current = id ? all.find((row) => row.id === id) : undefined;
      if (id && !current) throw notFound();
      const parentId =
        dto.parentId === undefined
          ? (current?.parentId ?? null)
          : (dto.parentId?.toLowerCase() ?? null);
      if (parentId && !all.some((row) => row.id === parentId)) throw notFound();
      const visited = new Set<string>();
      let ancestor = parentId;
      while (ancestor) {
        if (ancestor === id || visited.has(ancestor))
          throw conflict(
            "SCREEN_CYCLE",
            "하위 화면을 상위 화면으로 지정할 수 없습니다.",
          );
        visited.add(ancestor);
        ancestor = all.find((row) => row.id === ancestor)?.parentId ?? null;
      }
      const screenId = dto.screenId?.trim() ?? current?.screenId ?? "";
      if (all.some((row) => row.screenId === screenId && row.id !== id))
        throw conflict("DUPLICATE_SCREEN_ID", "같은 화면 ID가 있습니다.");
      const position =
        current && current.parentId === parentId
          ? current.position
          : Math.max(
              -1,
              ...all
                .filter((row) => row.parentId === parentId && row.id !== id)
                .map((row) => row.position),
            ) + 1;
      const values = {
        screenId,
        name: dto.name?.trim() ?? current?.name ?? "",
        description: dto.description?.trim() ?? current?.description ?? "",
        parentId,
        position,
      };
      const [row] = id
        ? await tx
            .update(screenStructureItems)
            .set(values)
            .where(
              and(
                eq(screenStructureItems.projectId, projectId),
                eq(screenStructureItems.id, id),
              ),
            )
            .returning(screenFields)
        : await tx
            .insert(screenStructureItems)
            .values({ ...values, projectId })
            .returning(screenFields);
      return row;
    });
  }
  async removeScreen(projectId: string, id: string) {
    return this.mutate(projectId, async (tx) => {
      const [current] = await tx
        .select()
        .from(screenStructureItems)
        .where(
          and(
            eq(screenStructureItems.projectId, projectId),
            eq(screenStructureItems.id, id),
          ),
        );
      if (!current) throw notFound();
      const [child] = await tx
        .select({ id: screenStructureItems.id })
        .from(screenStructureItems)
        .where(
          and(
            eq(screenStructureItems.projectId, projectId),
            eq(screenStructureItems.parentId, id),
          ),
        )
        .limit(1);
      if (child)
        throw conflict(
          "SCREEN_HAS_CHILDREN",
          "하위 화면이 있어 삭제할 수 없습니다.",
        );
      await tx
        .delete(screenStructureItems)
        .where(
          and(
            eq(screenStructureItems.projectId, projectId),
            eq(screenStructureItems.id, id),
          ),
        );
    });
  }
  private async memoRow(
    projectId: string,
    db: IdentityDatabase,
  ): Promise<MemoDto> {
    const [row] = await db
      .select({
        body: projectMemos.body,
        updatedAt: projectMemos.updatedAt,
        id: accounts.id,
        name: accounts.name,
      })
      .from(projectMemos)
      .innerJoin(accounts, eq(accounts.id, projectMemos.authorId))
      .where(eq(projectMemos.projectId, projectId));
    return row
      ? {
          body: row.body,
          updatedAt: row.updatedAt.toISOString(),
          updatedBy: { id: row.id, name: row.name },
        }
      : { body: "", updatedAt: null, updatedBy: null };
  }
  async memo(projectId: string, accountId: string) {
    await this.assertView(projectId, accountId);
    return this.memoRow(projectId, this.database.db);
  }
  async saveMemo(projectId: string, accountId: string, body: string) {
    return this.mutate(projectId, async (tx) => {
      await tx
        .insert(projectMemos)
        .values({ projectId, authorId: accountId, body: body.trim() })
        .onConflictDoUpdate({
          target: projectMemos.projectId,
          set: {
            authorId: accountId,
            body: body.trim(),
            updatedAt: new Date(),
          },
        });
      return this.memoRow(projectId, tx);
    });
  }
}
