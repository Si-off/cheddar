import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";
import { ApiError, invalid } from "../common/errors";
import type { EffectivePermissionDto } from "../contracts/identity.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  accounts,
  roleAssignmentProjects,
  roleAssignments,
  rolePermissions,
  roles,
} from "../database/schema";
import { GLOBAL_ONLY, type Permission } from "./permissions";

export type IdentityDatabase = DatabaseService["db"] | DatabaseTransaction;
export const activeAccount = () =>
  and(
    eq(accounts.status, "active"),
    or(isNull(accounts.expiresAt), gt(accounts.expiresAt, sql`now()`)),
  );
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async effective(
    accountId: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<EffectivePermissionDto[]> {
    const rows = await db
      .select({
        permission: rolePermissions.permission,
        scope: roleAssignments.scope,
        projectId: roleAssignmentProjects.projectId,
      })
      .from(roleAssignments)
      .innerJoin(accounts, eq(accounts.id, roleAssignments.accountId))
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleId, roleAssignments.roleId),
      )
      .leftJoin(
        roleAssignmentProjects,
        eq(roleAssignmentProjects.assignmentId, roleAssignments.id),
      )
      .where(and(eq(accounts.id, accountId), activeAccount()));
    const result = new Map<Permission, EffectivePermissionDto>();
    for (const row of rows) {
      if (
        row.scope === "projects" &&
        (GLOBAL_ONLY.includes(row.permission) || !row.projectId)
      )
        continue;
      const existing = result.get(row.permission);
      if (existing?.scope === "global") continue;
      if (row.scope === "global")
        result.set(row.permission, {
          permission: row.permission,
          scope: "global",
          projectIds: [],
        });
      else {
        const grant = existing ?? {
          permission: row.permission,
          scope: "projects",
          projectIds: [],
        };
        if (row.projectId && !grant.projectIds.includes(row.projectId))
          grant.projectIds.push(row.projectId);
        result.set(row.permission, grant);
      }
    }
    return [...result.values()]
      .sort((a, b) => a.permission.localeCompare(b.permission))
      .map((grant) => ({ ...grant, projectIds: grant.projectIds.sort() }));
  }
  async can(
    accountId: string,
    permission: Permission,
    projectId?: string,
  ): Promise<boolean> {
    return (await this.effective(accountId)).some(
      (grant) =>
        grant.permission === permission &&
        (grant.scope === "global" ||
          (!!projectId && grant.projectIds.includes(projectId))),
    );
  }
  async assertManagerRemains(tx: DatabaseTransaction) {
    const [manager] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .innerJoin(
        roleAssignments,
        and(
          eq(roleAssignments.accountId, accounts.id),
          eq(roleAssignments.scope, "global"),
        ),
      )
      .innerJoin(
        rolePermissions,
        and(
          eq(rolePermissions.roleId, roleAssignments.roleId),
          eq(rolePermissions.permission, "role.manage"),
        ),
      )
      .where(activeAccount())
      .limit(1);
    if (!manager)
      throw new ApiError(
        409,
        "LAST_ROLE_MANAGER",
        "역할과 소속을 관리할 활성 계정이 한 명은 필요합니다.",
      );
  }
  // Every account/role writer, including token redemption and CLI, uses this lock.
  async mutate<T>(
    work: (tx: DatabaseTransaction) => Promise<T>,
    protectManager = true,
  ): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(724381019)`);
      const value = await work(tx);
      if (protectManager) await this.assertManagerRemains(tx);
      return value;
    });
  }
  async validateExpiry(tx: IdentityDatabase, accountId?: string) {
    const missing = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .innerJoin(roleAssignments, eq(roleAssignments.accountId, accounts.id))
      .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
      .where(
        and(
          isNull(accounts.expiresAt),
          eq(roles.requiresExpiry, true),
          accountId ? eq(accounts.id, accountId) : undefined,
        ),
      )
      .limit(1);
    if (missing.length)
      throw invalid([{ field: "expiresAt", code: "requiredByRole" }]);
  }
}
