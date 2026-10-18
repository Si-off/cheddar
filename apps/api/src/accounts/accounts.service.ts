import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, gt, ilike, isNull, lte, or, sql } from "drizzle-orm";
import { hashToken, newToken } from "../auth/credentials";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  AccountDto,
  AccountQueryDto,
  AssignmentDto,
  CreateAccountDto,
  UpdateAccountDto,
} from "../contracts/identity.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  accounts,
  affiliations,
  authTokens,
  projects,
  roleAssignmentProjects,
  roleAssignments,
  roles,
  sessions,
  testSets,
} from "../database/schema";

export const accountState = (row: {
  status: "invited" | "active" | "inactive";
  expiresAt: Date | null;
}): AccountDto["status"] =>
  row.status === "active" &&
  row.expiresAt &&
  row.expiresAt.getTime() <= Date.now()
    ? "expired"
    : row.status;
const cleanName = (value: string) => {
  const name = value.trim();
  if (!name) throw invalid();
  return name;
};
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async row(id: string, db: IdentityDatabase = this.database.db) {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!row) throw notFound();
    return row;
  }
  async detail(
    id: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<AccountDto> {
    const row = await this.row(id, db);
    const [affiliation] = await db
      .select({ id: affiliations.id, name: affiliations.name })
      .from(affiliations)
      .where(eq(affiliations.id, row.affiliationId));
    const assignments = await db
      .select({
        id: roleAssignments.id,
        roleId: roles.id,
        scope: roleAssignments.scope,
        requiresExpiry: roles.requiresExpiry,
        defaultExpiryDays: roles.defaultExpiryDays,
      })
      .from(roleAssignments)
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(eq(roleAssignments.accountId, id))
      .orderBy(roleAssignments.id);
    const result: AssignmentDto[] = [];
    for (const assignment of assignments) {
      const linked = await db
        .select({ id: roleAssignmentProjects.projectId })
        .from(roleAssignmentProjects)
        .where(eq(roleAssignmentProjects.assignmentId, assignment.id))
        .orderBy(roleAssignmentProjects.projectId);
      result.push({
        roleId: assignment.roleId,
        scope: assignment.scope,
        projectIds: linked.map((p) => p.id),
      });
    }
    const periods = assignments
      .filter((a) => a.requiresExpiry && a.defaultExpiryDays !== null)
      .map((a) => a.defaultExpiryDays as number);
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      affiliation,
      status: accountState(row),
      expiresAt: row.expiresAt?.toISOString() ?? null,
      assignments: result,
      defaultExpiryDays: periods.length ? Math.min(...periods) : null,
    };
  }
  async list(query: AccountQueryDto) {
    const search = query.search?.replace(/[\\%_]/g, "\\$&");
    const where = and(
      search
        ? or(
            ilike(accounts.name, `%${search}%`),
            ilike(accounts.email, `%${search}%`),
          )
        : undefined,
      query.affiliationId
        ? eq(accounts.affiliationId, query.affiliationId)
        : undefined,
      query.roleId
        ? sql`EXISTS (SELECT 1 FROM ${roleAssignments} WHERE ${roleAssignments.accountId} = ${accounts.id} AND ${roleAssignments.roleId} = ${query.roleId})`
        : undefined,
      query.status === "expired"
        ? and(
            eq(accounts.status, "active"),
            lte(accounts.expiresAt, sql`now()`),
          )
        : query.status === "active"
          ? and(
              eq(accounts.status, "active"),
              or(
                isNull(accounts.expiresAt),
                gt(accounts.expiresAt, sql`now()`),
              ),
            )
          : query.status
            ? eq(accounts.status, query.status)
            : undefined,
    );
    return this.database.db.transaction(
      async (tx) => {
        const [total] = await tx
          .select({ value: count() })
          .from(accounts)
          .where(where);
        const ids = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(where)
          .orderBy(accounts.name, accounts.id)
          .limit(query.limit)
          .offset(query.offset);
        return {
          total: total.value,
          items: await Promise.all(ids.map((row) => this.detail(row.id, tx))),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  private async affiliation(id: string, tx: DatabaseTransaction) {
    if (
      !(
        await tx
          .select({ id: affiliations.id })
          .from(affiliations)
          .where(eq(affiliations.id, id))
      ).length
    )
      throw invalid([{ field: "affiliationId", code: "notFound" }]);
  }
  async assign(
    accountId: string,
    assignments: AssignmentDto[],
    tx: DatabaseTransaction,
  ) {
    for (const assignment of assignments) {
      const [role] = await tx
        .select()
        .from(roles)
        .where(eq(roles.id, assignment.roleId));
      if (!role || role.fixed)
        throw invalid([{ field: "assignments", code: "unassignableRole" }]);
      if (
        (assignment.scope === "global" && assignment.projectIds.length !== 0) ||
        (assignment.scope === "projects" && assignment.projectIds.length === 0)
      )
        throw invalid([{ field: "assignments", code: "invalidScope" }]);
      for (const projectId of assignment.projectIds) {
        if (
          !(
            await tx
              .select({ id: projects.id })
              .from(projects)
              .where(eq(projects.id, projectId))
          ).length
        )
          throw invalid([{ field: "projectIds", code: "notFound" }]);
      }
    }
    await tx
      .delete(roleAssignments)
      .where(eq(roleAssignments.accountId, accountId));
    for (const assignment of assignments) {
      const [saved] = await tx
        .insert(roleAssignments)
        .values({
          accountId,
          roleId: assignment.roleId,
          scope: assignment.scope,
        })
        .returning();
      if (assignment.projectIds.length)
        await tx.insert(roleAssignmentProjects).values(
          assignment.projectIds.map((projectId) => ({
            assignmentId: saved.id,
            projectId,
          })),
        );
    }
  }
  async issueToken(
    accountId: string,
    purpose: "invite" | "reset",
    tx: DatabaseTransaction,
  ) {
    const token = newToken();
    const [record] = await tx
      .insert(authTokens)
      .values({
        accountId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: sql`now() + interval '7 days'`,
      })
      .returning();
    // Reissuing a link immediately invalidates every older link for the same purpose.
    await tx
      .delete(authTokens)
      .where(
        and(
          eq(authTokens.accountId, accountId),
          eq(authTokens.purpose, purpose),
          sql`${authTokens.id} <> ${record.id}`,
        ),
      );
    return { token, expiresAt: record.expiresAt.toISOString() };
  }
  async create(dto: CreateAccountDto) {
    return this.authorization.mutate(async (tx) => {
      await this.affiliation(dto.affiliationId, tx);
      const [account] = await tx
        .insert(accounts)
        .values({
          name: cleanName(dto.name),
          email: dto.email.trim().toLowerCase(),
          affiliationId: dto.affiliationId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        })
        .returning();
      await this.assign(account.id, dto.assignments, tx);
      await this.authorization.validateExpiry(tx, account.id);
      const token = await this.issueToken(account.id, "invite", tx);
      return { ...token, account: await this.detail(account.id, tx) };
    });
  }
  async update(id: string, dto: UpdateAccountDto) {
    return this.authorization.mutate(async (tx) => {
      await this.row(id, tx);
      if (dto.affiliationId !== undefined)
        await this.affiliation(dto.affiliationId, tx);
      await tx
        .update(accounts)
        .set({
          ...(dto.name === undefined ? {} : { name: cleanName(dto.name) }),
          ...(dto.email === undefined
            ? {}
            : { email: dto.email.trim().toLowerCase() }),
          ...(dto.affiliationId === undefined
            ? {}
            : { affiliationId: dto.affiliationId }),
          ...(dto.expiresAt === undefined
            ? {}
            : { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, id));
      if (dto.assignments !== undefined)
        await this.assign(id, dto.assignments, tx);
      await this.authorization.validateExpiry(tx, id);
      const current = await this.row(id, tx);
      if (accountState(current) !== "active")
        await tx.delete(sessions).where(eq(sessions.accountId, id));
      return this.detail(id, tx);
    });
  }
  async setActive(id: string, active: boolean) {
    return this.authorization.mutate(async (tx) => {
      const account = await this.row(id, tx);
      await tx
        .update(accounts)
        .set({
          status: active
            ? account.passwordHash
              ? "active"
              : "invited"
            : "inactive",
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, id));
      if (!active) {
        await tx.delete(sessions).where(eq(sessions.accountId, id));
        await tx.delete(authTokens).where(eq(authTokens.accountId, id));
      }
      await this.authorization.validateExpiry(tx, id);
      return this.detail(id, tx);
    });
  }
  async issue(id: string, purpose: "invite" | "reset") {
    return this.authorization.mutate(async (tx) => {
      const account = await this.row(id, tx);
      if (
        (purpose === "invite" && account.status !== "invited") ||
        (purpose === "reset" && accountState(account) !== "active")
      )
        throw new ApiError(409, "ACCOUNT_STATE", "계정 상태를 확인해주세요.");
      return this.issueToken(id, purpose, tx);
    });
  }
  async transferOwnership(fromId: string, toId: string) {
    return this.authorization.mutate(async (tx) => {
      if (
        (await this.row(fromId, tx)).status !== "inactive" ||
        accountState(await this.row(toId, tx)) !== "active"
      )
        throw new ApiError(
          409,
          "OWNERSHIP_ACCOUNT_STATE",
          "소유권을 넘길 계정 상태를 확인해주세요.",
        );
      const changed = await tx
        .update(testSets)
        .set({ ownerId: toId, updatedAt: new Date() })
        .where(eq(testSets.ownerId, fromId))
        .returning({ id: testSets.id });
      return changed.length;
    });
  }
}
