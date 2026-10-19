import type { Actor } from "@cheddar/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { hashToken } from "../auth/credentials";
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
  accounts,
  rolePermissions,
  roles,
  testCases,
  testCaseValues,
  testSetColumns,
  testSetMembers,
  testSets,
  visitorSessions,
} from "../database/schema";
import { LiveEvents } from "../live/live-events";
import { visitorName } from "../sharing/visitor-names";

export type SharedSubject = {
  linkToken: string;
  accountId?: string;
  visitorToken?: string;
  visitorId?: string;
};
export type SetSubject = string | SharedSubject;
export const linkNotFound = () =>
  new ApiError(404, "LINK_NOT_FOUND", "열 수 없는 링크입니다.");

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
    @Inject(LiveEvents) readonly events: LiveEvents,
  ) {}
  async visible(
    id: string,
    accountId: SetSubject,
    db: IdentityDatabase = this.database.db,
    lock = false,
  ) {
    if (typeof accountId !== "string") return this.shared(accountId, db, lock);
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
    const [account] = await db
      .select({ name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    if (!account) throw notFound();
    return {
      row,
      access,
      actor: { kind: "account", id: accountId, name: account.name } as Actor,
    };
  }
  async shared(
    subject: SharedSubject,
    db: IdentityDatabase = this.database.db,
    lock = false,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(subject.linkToken)) throw linkNotFound();
    const query = db
      .select()
      .from(testSets)
      .where(
        and(
          eq(testSets.linkToken, subject.linkToken),
          eq(testSets.visibility, "public"),
        ),
      );
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw linkNotFound();
    const linkExport = async () =>
      (
        await db
          .select({ id: roles.id })
          .from(roles)
          .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
          .where(
            and(
              eq(roles.systemKey, "link_visitor"),
              eq(rolePermissions.permission, "test_set.export"),
            ),
          )
          .limit(1)
      ).length > 0;
    if (subject.accountId) {
      const [member] = await db
        .select()
        .from(testSetMembers)
        .where(
          and(
            eq(testSetMembers.testSetId, row.id),
            eq(testSetMembers.accountId, subject.accountId),
          ),
        );
      const own = setAccess(
        row,
        subject.accountId,
        member?.access,
        await this.authorization.effective(subject.accountId, db),
      );
      const [account] = await db
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, subject.accountId));
      if (!account) throw linkNotFound();
      const { canView: _canView, ...access } = own;
      return {
        row,
        access: {
          ...access,
          canEdit: own.canEdit || row.linkAccess === "edit",
          canExport: own.canView ? own.canExport : await linkExport(),
        },
        actor: {
          kind: "account",
          id: subject.accountId,
          name: account.name,
        } as Actor,
      };
    }
    if (
      !subject.visitorToken ||
      !/^[A-Za-z0-9_-]{43}$/.test(subject.visitorToken)
    )
      throw linkNotFound();
    const browserTokenHash = hashToken(subject.visitorToken);
    let [visitor] = await db
      .select()
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.testSetId, row.id),
          eq(visitorSessions.browserTokenHash, browserTokenHash),
        ),
      );
    if (subject.visitorId && visitor?.id !== subject.visitorId)
      throw linkNotFound();
    if (!visitor) {
      const names = await db
        .select({ name: visitorSessions.name })
        .from(visitorSessions)
        .where(eq(visitorSessions.testSetId, row.id));
      [visitor] = await db
        .insert(visitorSessions)
        .values({
          testSetId: row.id,
          browserTokenHash,
          name: visitorName(new Set(names.map((v) => v.name))),
        })
        .returning();
    }
    return {
      row,
      actor: { kind: "visitor", id: visitor.id, name: visitor.name } as Actor,
      access: {
        canEdit: row.linkAccess === "edit",
        canRename: false,
        canDelete: false,
        canExport: await linkExport(),
      },
    };
  }
  async mutate<T>(
    id: string,
    accountId: SetSubject,
    action: "canEdit" | "canRename" | "canDelete" | null,
    work: (
      tx: DatabaseTransaction,
      row: SetRow,
      access: TestSetAccessDto,
    ) => Promise<T>,
  ) {
    const result = await this.database.db.transaction(async (tx) => {
      const { row, access } = await this.visible(id, accountId, tx, true);
      if (action && !access[action]) throw forbidden();
      return work(tx, row, access);
    });
    await this.events.publish({ type: "resync", testSetId: id });
    return result;
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
