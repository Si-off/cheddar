import { Inject, Injectable } from "@nestjs/common";
import type { Actor } from "@workspace/contracts";
import { and, eq, sql } from "drizzle-orm";
import { hashToken } from "../auth/credentials";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import type {
  CaseDto,
  TestSetAccessDto,
  TestSetColumnDto,
} from "../contracts/test-set.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  type accounts,
  testCases,
  testCaseValues,
  testSetColumns,
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

export const forbidden = () =>
  new ApiError(403, "FORBIDDEN", "이 작업을 할 권한이 없습니다.");
type SetRow = typeof testSets.$inferSelect;
export function setAccess(
  row: SetRow,
  account: typeof accounts.$inferSelect,
): TestSetAccessDto {
  return {
    canEdit: true,
    canRename: true,
    canDelete: row.ownerId === account.id || account.role === "admin",
    canExport: true,
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
    const account = await this.authorization.active(accountId, db);
    const access = setAccess(row, account);
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
    if (subject.accountId) {
      const account = await this.authorization.active(subject.accountId, db);
      return {
        row,
        access: setAccess(row, account),
        actor: { kind: "account", id: account.id, name: account.name } as Actor,
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
        canExport: true,
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
  ): Promise<TestSetColumnDto[]> {
    const rows = await db
      .select()
      .from(testSetColumns)
      .where(eq(testSetColumns.testSetId, id))
      .orderBy(testSetColumns.position, testSetColumns.id);
    return rows.map(
      ({
        id,
        systemKey,
        presetKey,
        name,
        type,
        description,
        options,
        colors,
      }) => ({
        id,
        presetKey,
        systemKey: systemKey as TestSetColumnDto["systemKey"],
        name,
        type,
        description,
        options,
        colors: colors ?? {},
      }),
    );
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
      featureGroupId: row.featureGroupId,
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
