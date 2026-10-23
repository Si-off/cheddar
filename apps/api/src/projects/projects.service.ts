import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import type {
  CreateFeatureGroupDto,
  CreateProjectDto,
  CreateScreenDto,
  CreateScreenIdRuleDto,
  FeatureGroupDto,
  MemoDto,
  ProjectDto,
  ProjectListDto,
  ScreenDto,
  TemplateDto,
  UpdateFeatureGroupDto,
  UpdateProjectDto,
  UpdateScreenDto,
  UpdateScreenIdRuleDto,
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
  screenIdRules,
  screenStructureItems,
  testSets,
} from "../database/schema";
import { LiveEvents } from "../live/live-events";
import { example, matches, nextScreenId } from "./screen-id-rules";
import { readScreens } from "./screens-import";
import { defaultColumns, validateTemplate } from "./template";

const groupFields = {
  id: featureGroups.id,
  name: featureGroups.name,
  description: featureGroups.description,
};
const screenFields = {
  id: screenStructureItems.id,
  screenId: screenStructureItems.screenId,
  type: screenStructureItems.type,
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
    @Inject(LiveEvents) private readonly events: LiveEvents,
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
    await this.authorization.active(accountId, db);
    const row = await this.project(id, db);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      canManage: true,
    };
  }
  private async assertView(id: string, accountId: string) {
    await this.authorization.active(accountId);
    await this.project(id);
  }
  async list(accountId: string): Promise<ProjectListDto> {
    await this.authorization.active(accountId);
    const rows = await this.database.db
      .select()
      .from(projects)
      .orderBy(projects.name, projects.id);
    const items = await Promise.all(
      rows.map(async (row) => {
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
          canManage: true,
        };
      }),
    );
    return { items };
  }
  async create(accountId: string, dto: CreateProjectDto): Promise<ProjectDto> {
    return this.database.db.transaction(async (tx) => {
      await this.authorization.active(accountId, tx);
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
      return {
        id: row.id,
        name: row.name,
        description: row.description,
        canManage: true,
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
    return {
      revision: row.revision,
      columns: row.columns.map((c) => ({ ...c, colors: c.colors ?? {} })),
    };
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
      return {
        revision: row.revision,
        columns: row.columns.map((c) => ({ ...c, colors: c.colors ?? {} })),
      };
    });
  }
  private rules(projectId: string, db: IdentityDatabase = this.database.db) {
    return db
      .select({
        id: screenIdRules.id,
        name: screenIdRules.name,
        separator: screenIdRules.separator,
        parts: screenIdRules.parts,
      })
      .from(screenIdRules)
      .where(eq(screenIdRules.projectId, projectId))
      .orderBy(screenIdRules.position, screenIdRules.id);
  }
  async listRules(projectId: string, accountId: string) {
    await this.assertView(projectId, accountId);
    return {
      items: (await this.rules(projectId)).map((rule) => ({
        ...rule,
        example: example(rule),
      })),
    };
  }
  async saveRule(
    projectId: string,
    dto: CreateScreenIdRuleDto | UpdateScreenIdRuleDto,
    id?: string,
  ) {
    return this.mutate(projectId, async (tx) => {
      const all = await tx
        .select()
        .from(screenIdRules)
        .where(eq(screenIdRules.projectId, projectId));
      const current = id ? all.find((row) => row.id === id) : undefined;
      if (id && !current) throw notFound();
      const name = dto.name?.trim() ?? current?.name ?? "";
      if (all.some((row) => row.name === name && row.id !== id))
        throw conflict(
          "DUPLICATE_NAME",
          "같은 이름의 화면 ID 규칙이 있습니다.",
        );
      const values = {
        name,
        separator: dto.separator ?? current?.separator ?? "_",
        parts: dto.parts ?? current?.parts ?? [],
        updatedAt: new Date(),
      };
      for (const part of values.parts) {
        if (
          (part.kind === "list" && part.codes.length === 0) ||
          (part.kind === "fixed"
            ? part.value.length === 0
            : part.value !== "") ||
          (part.kind === "number" ? part.digits < 1 : part.digits !== 0)
        )
          throw new ApiError(
            400,
            "VALIDATION_ERROR",
            "화면 ID 규칙의 부분 값을 확인하세요.",
          );
      }
      const [row] = id
        ? await tx
            .update(screenIdRules)
            .set(values)
            .where(
              and(
                eq(screenIdRules.projectId, projectId),
                eq(screenIdRules.id, id),
              ),
            )
            .returning({
              id: screenIdRules.id,
              name: screenIdRules.name,
              separator: screenIdRules.separator,
              parts: screenIdRules.parts,
            })
        : await tx
            .insert(screenIdRules)
            .values({
              ...values,
              projectId,
              position: Math.max(-1, ...all.map((row) => row.position)) + 1,
            })
            .returning({
              id: screenIdRules.id,
              name: screenIdRules.name,
              separator: screenIdRules.separator,
              parts: screenIdRules.parts,
            });
      return { ...row, example: example(row) };
    });
  }
  async removeRule(projectId: string, id: string) {
    return this.mutate(projectId, async (tx) => {
      const rows = await tx
        .delete(screenIdRules)
        .where(
          and(eq(screenIdRules.projectId, projectId), eq(screenIdRules.id, id)),
        )
        .returning({ id: screenIdRules.id });
      if (!rows.length) throw notFound();
    });
  }
  async orderRules(projectId: string, ids: string[]) {
    return this.mutate(projectId, async (tx) => {
      const all = await this.rules(projectId, tx);
      const normalized = ids.map((id) => id.toLowerCase());
      if (
        normalized.length !== all.length ||
        new Set(normalized).size !== all.length ||
        normalized.some((id) => !all.some((row) => row.id === id))
      )
        throw conflict(
          "STALE_ORDER",
          "화면 ID 규칙 목록이 바뀌었습니다. 새로 고친 뒤 다시 정렬하세요.",
        );
      for (const [position, id] of normalized.entries())
        await tx
          .update(screenIdRules)
          .set({ position })
          .where(
            and(
              eq(screenIdRules.projectId, projectId),
              eq(screenIdRules.id, id),
            ),
          );
      return {
        items: (await this.rules(projectId, tx)).map((rule) => ({
          ...rule,
          example: example(rule),
        })),
      };
    });
  }
  private groups(projectId: string, db: IdentityDatabase = this.database.db) {
    return db
      .select(groupFields)
      .from(featureGroups)
      .where(eq(featureGroups.projectId, projectId))
      .orderBy(featureGroups.position, featureGroups.id);
  }
  private async mutateGroups<T>(
    projectId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const { result, sets } = await this.mutate(projectId, async (tx) => {
      // 케이스 편집과 같은 순서로 세트를 먼저 잠근 뒤 FK 삭제를 반영한다.
      const sets = await tx
        .update(testSets)
        .set({
          version: sql`${testSets.version} + 1`,
          updatedAt: sql`greatest(clock_timestamp(), ${testSets.updatedAt} + interval '1 millisecond')`,
        })
        .where(eq(testSets.projectId, projectId))
        .returning({ id: testSets.id });
      return { result: await work(tx), sets };
    });
    await Promise.all(
      sets.map(({ id }) =>
        this.events.publish({ type: "resync", testSetId: id }),
      ),
    );
    return result;
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
    return this.mutateGroups(projectId, async (tx) => {
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
    return this.mutateGroups(projectId, async (tx) => {
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
    return this.mutateGroups(projectId, async (tx) => {
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
    const rules = await this.rules(projectId);
    const children = new Map<string | null, ScreenDto[]>();
    for (const item of all) {
      const row = {
        ...item,
        ruleMismatch:
          rules.length > 0 &&
          !rules.some((rule) => matches(rule, item.screenId)),
      };
      children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
    }
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
        type: dto.type ?? current?.type ?? "page",
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
      const rules = await this.rules(projectId, tx);
      return {
        ...row,
        ruleMismatch:
          rules.length > 0 &&
          !rules.some((rule) => matches(rule, row.screenId)),
      };
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
  async nextRuleId(
    projectId: string,
    accountId: string,
    ruleId: string,
    prefix: string,
  ) {
    await this.assertView(projectId, accountId);
    const rule = (await this.rules(projectId)).find(
      (row) => row.id === ruleId.toLowerCase(),
    );
    if (!rule) throw notFound();
    const ids = await this.database.db
      .select({ screenId: screenStructureItems.screenId })
      .from(screenStructureItems)
      .where(eq(screenStructureItems.projectId, projectId));
    return {
      screenId: nextScreenId(
        rule,
        prefix === "" ? [] : prefix.split(","),
        ids.map((row) => row.screenId),
      ),
    };
  }
  async importScreens(projectId: string, file?: Express.Multer.File) {
    if (!file?.originalname.toLowerCase().endsWith(".xlsx"))
      throw new ApiError(400, "VALIDATION_FAILED", "XLSX 파일을 선택하세요.");
    if (file.size > 5 * 1024 * 1024)
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "파일은 5MB 이하여야 합니다.",
      );
    const parsed = await readScreens(file.buffer);
    return this.mutate(projectId, async (tx) => {
      const existing = await tx
        .select()
        .from(screenStructureItems)
        .where(eq(screenStructureItems.projectId, projectId));
      const seen = new Set(existing.map((row) => row.screenId));
      const rows = parsed.rows.filter((row) => {
        if (seen.has(row.screenId)) return false;
        seen.add(row.screenId);
        return true;
      });
      for (const row of rows)
        if (
          row.screenId.length > 100 ||
          !row.name ||
          row.name.length > 200 ||
          row.description.length > 2000
        )
          throw new ApiError(
            400,
            "VALIDATION_FAILED",
            "화면 ID, 이름 또는 설명을 확인하세요.",
          );
      const position = Math.max(-1, ...existing.map((row) => row.position)) + 1;
      // 먼저 모두 삽입해 파일에서 부모보다 먼저 나온 자식도 연결한다.
      for (const [index, row] of rows.entries())
        await tx.insert(screenStructureItems).values({
          id: row.id,
          projectId,
          screenId: row.screenId,
          name: row.name,
          type: row.type,
          description: row.description,
          position: position + index,
        });
      for (const row of rows) {
        const parent = rows.find(
          (candidate) =>
            candidate.id !== row.id &&
            candidate.name === row.parentName &&
            candidate.depth < row.depth,
        );
        if (parent)
          await tx
            .update(screenStructureItems)
            .set({ parentId: parent.id })
            .where(eq(screenStructureItems.id, row.id));
      }
      return {
        created: rows.length,
        skipped: parsed.skipped + parsed.rows.length - rows.length,
      };
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
