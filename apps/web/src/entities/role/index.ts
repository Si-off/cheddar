import { queryOptions } from "@tanstack/react-query";
import type { PermissionKey } from "@/entities/permission";
import {
  getRoleQueryKey,
  listRolesQueryKey,
  type RoleDto,
  sdk,
} from "@/shared/api";

export interface Role {
  id: string;
  name: string;
  /** 고정 역할(링크 방문자). 계정에 할당하거나 지울 수 없다. */
  fixed: boolean;
  requiresExpiry: boolean;
  defaultExpiryDays: number | null;
  permissions: PermissionKey[];
}

export function toRole(dto: RoleDto): Role {
  return {
    id: dto.id,
    name: dto.name,
    fixed: dto.fixed,
    requiresExpiry: dto.requiresExpiry,
    defaultExpiryDays: dto.defaultExpiryDays,
    permissions: [...dto.permissions],
  };
}

export const rolesQuery = () =>
  queryOptions({
    queryKey: listRolesQueryKey(),
    queryFn: async ({ signal }) =>
      (await sdk.listRoles({ signal, throwOnError: true })).data.map(toRole),
  });

export const roleQuery = (roleId: string) =>
  queryOptions({
    queryKey: getRoleQueryKey({ path: { roleId } }),
    queryFn: async ({ signal }) =>
      toRole(
        (await sdk.getRole({ path: { roleId }, signal, throwOnError: true }))
          .data,
      ),
  });

/** 할당된 역할 중 만료일을 요구하는 역할이 있으면 가장 짧은 기본 기간을, 없으면 null을 돌려준다. */
export function expiryRequirement(
  roles: readonly Role[],
  roleIds: readonly string[],
) {
  const required = roles.filter(
    (role) => roleIds.includes(role.id) && role.requiresExpiry,
  );
  if (required.length === 0) return null;
  const days = required
    .map((role) => role.defaultExpiryDays)
    .filter((d): d is number => d !== null);
  return { defaultDays: days.length > 0 ? Math.min(...days) : null };
}
