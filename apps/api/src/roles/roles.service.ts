import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  CreateRoleDto,
  RoleDto,
  UpdateRoleDto,
} from "../contracts/identity.dto";
import { DatabaseService } from "../database/database.service";
import { roleAssignments, rolePermissions, roles } from "../database/schema";
@Injectable()
export class RolesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async detail(
    id: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<RoleDto> {
    const [role] = await db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw notFound();
    const permissions = await db
      .select()
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id))
      .orderBy(rolePermissions.permission);
    return {
      id: role.id,
      name: role.name,
      fixed: role.fixed,
      requiresExpiry: role.requiresExpiry,
      defaultExpiryDays: role.defaultExpiryDays,
      permissions: permissions.map((p) => p.permission),
    };
  }
  async list() {
    const all = await this.database.db
      .select({ id: roles.id })
      .from(roles)
      .orderBy(roles.name);
    return Promise.all(all.map((r) => this.detail(r.id)));
  }
  async create(dto: CreateRoleDto) {
    return this.authorization.mutate(async (tx) => {
      if (!dto.name.trim() || (dto.requiresExpiry && !dto.defaultExpiryDays))
        throw invalid();
      const [role] = await tx
        .insert(roles)
        .values({
          name: dto.name.trim(),
          requiresExpiry: dto.requiresExpiry,
          defaultExpiryDays: dto.defaultExpiryDays,
        })
        .returning();
      if (dto.permissions.length)
        await tx.insert(rolePermissions).values(
          dto.permissions.map((permission) => ({
            roleId: role.id,
            permission,
          })),
        );
      return this.detail(role.id, tx);
    });
  }
  async update(id: string, dto: UpdateRoleDto) {
    return this.authorization.mutate(async (tx) => {
      const current = await this.detail(id, tx);
      if (
        current.fixed &&
        (dto.name !== undefined ||
          dto.requiresExpiry !== undefined ||
          dto.defaultExpiryDays !== undefined ||
          dto.permissions?.some((p) => p !== "test_set.export"))
      )
        throw new ApiError(
          409,
          "FIXED_ROLE",
          "링크 방문자는 XLSX 내보내기 권한만 바꿀 수 있습니다.",
        );
      const next = { ...current, ...dto };
      if (!next.name.trim() || (next.requiresExpiry && !next.defaultExpiryDays))
        throw invalid();
      await tx
        .update(roles)
        .set({
          name: next.name.trim(),
          requiresExpiry: next.requiresExpiry,
          defaultExpiryDays: next.defaultExpiryDays,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, id));
      if (dto.permissions !== undefined) {
        await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, id));
        if (dto.permissions.length)
          await tx
            .insert(rolePermissions)
            .values(
              dto.permissions.map((permission) => ({ roleId: id, permission })),
            );
      }
      await this.authorization.validateExpiry(tx);
      return this.detail(id, tx);
    });
  }
  async remove(id: string) {
    await this.authorization.mutate(async (tx) => {
      if ((await this.detail(id, tx)).fixed)
        throw new ApiError(
          409,
          "FIXED_ROLE",
          "링크 방문자는 삭제할 수 없습니다.",
        );
      if (
        (
          await tx
            .select()
            .from(roleAssignments)
            .where(eq(roleAssignments.roleId, id))
            .limit(1)
        ).length
      )
        throw new ApiError(
          409,
          "ROLE_ASSIGNED",
          "계정에 할당된 역할은 삭제할 수 없습니다.",
        );
      await tx.delete(roles).where(eq(roles.id, id));
    });
  }
  async duplicate(id: string, name: string) {
    // Fixed visitors can be copied as ordinary export-only roles.
    const role = await this.detail(id);
    return this.create({
      name,
      permissions: role.permissions,
      requiresExpiry: role.requiresExpiry,
      defaultExpiryDays: role.defaultExpiryDays,
    });
  }
}
