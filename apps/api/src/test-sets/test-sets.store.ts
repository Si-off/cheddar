import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import type { Permission } from "../authorization/permissions";
import { ApiError, notFound } from "../common/errors";
import type { EffectivePermissionDto } from "../contracts/identity.dto";
import type { TemplateColumnDto } from "../contracts/project.dto";
import type { CaseDto, TestSetAccessDto } from "../contracts/test-set.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  testCases,
  testCaseValues,
  testSetColumns,
  testSetMembers,
  testSets,
} from "../database/schema";

export const hasGrant = (
  grants: EffectivePermissionDto[],
  permission: Permission,
  projectId: string,
) =>
  grants.some(
    (g) =>
      g.permission === permission &&
      (g.scope === "global" || g.projectIds.includes(projectId.toLowerCase())),
  );
export const forbidden = () =>
  new ApiError(403, "FORBIDDEN", "이 작업을 할 권한이 없습니다.");
type SetRow = typeof testSets.$inferSelect;
export function setAccess(
  row: SetRow,
  accountId: string,
  member: "view" | "edit" | undefined,
  grants: EffectivePermissionDto[],
): TestSetAccessDto & { canView: boolean } {
  const owner = row.ownerId === accountId.toLowerCase();
  const canView =
    owner || !!member || hasGrant(grants, "test_set.view_all", row.projectId);
  const canEdit = owner || member === "edit";
  return {
    canView,
    canEdit,
    canRename: canEdit,
    canDelete: owner,
    canExport: canView && hasGrant(grants, "test_set.export", row.projectId),
  };
}
@Injectable()
export class TestSetsStore {
  constructor(
    @Inject(DatabaseService) readonly database: DatabaseService,
    @Inject(AuthorizationService) readonly authorization: AuthorizationService,
  ) {}
  async visible(
    id: string,
    accountId: string,
    db: IdentityDatabase = this.database.db,
    lock = false,
  ) {
    const query = db.select().from(testSets).where(eq(testSets.id, id));
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw notFound();
    const [member] = await db
      .select()
      .from(testSetMembers)
      .where(
        and(
          eq(testSetMembers.testSetId, id),
          eq(testSetMembers.accountId, accountId),
        ),
      );
    const { canView, ...access } = setAccess(
      row,
      accountId,
      member?.access,
      await this.authorization.effective(accountId, db),
    );
    if (!canView) throw notFound();
    return { row, access };
  }
  mutate<T>(
    id: string,
    accountId: string,
    action: "canEdit" | "canRename" | "canDelete" | null,
    work: (
      tx: DatabaseTransaction,
      row: SetRow,
      access: TestSetAccessDto,
    ) => Promise<T>,
  ) {
    return this.database.db.transaction(async (tx) => {
      const { row, access } = await this.visible(id, accountId, tx, true);
      if (action && !access[action]) throw forbidden();
      return work(tx, row, access);
    });
  }
  async columns(
    id: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<TemplateColumnDto[]> {
    const rows = await db
      .select()
      .from(testSetColumns)
      .where(eq(testSetColumns.testSetId, id))
      .orderBy(testSetColumns.position, testSetColumns.id);
    return rows.map(({ id, systemKey, name, type, description, options }) => ({
      id,
      systemKey: systemKey as TemplateColumnDto["systemKey"],
      name,
      type,
      description,
      options,
    }));
  }
  async cases(
    id: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<CaseDto[]> {
    const rows = await db
      .select()
      .from(testCases)
      .where(eq(testCases.testSetId, id))
      .orderBy(testCases.position, testCases.id);
    const values = await db
      .select()
      .from(testCaseValues)
      .where(eq(testCaseValues.testSetId, id));
    const byCase = new Map(
      rows.map((row) => [
        row.id,
        [] as [string, typeof testCaseValues.$inferSelect.value][],
      ]),
    );
    for (const value of values)
      byCase.get(value.caseId)?.push([value.columnId, value.value]);
    return rows.map((row) => ({
      id: row.id,
      values: Object.fromEntries(byCase.get(row.id) ?? []),
    }));
  }
  async bump(id: string, tx: DatabaseTransaction, testIdCounter?: string) {
    const [row] = await tx
      .update(testSets)
      .set({
        version: sql`${testSets.version} + 1`,
        updatedAt: sql`greatest(clock_timestamp(), ${testSets.updatedAt} + interval '1 millisecond')`,
        ...(testIdCounter === undefined ? {} : { testIdCounter }),
      })
      .where(eq(testSets.id, id))
      .returning();
    return row.version;
  }
}
