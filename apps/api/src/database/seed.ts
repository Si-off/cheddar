import { PERMISSIONS, type Permission } from "../authorization/permissions";
import type { DatabaseTransaction } from "./database.service";
import { affiliations, rolePermissions, roles } from "./schema";

export const DEFAULT_AFFILIATION_ID = "00000000-0000-4000-8000-000000000001";
export async function seedInitialData(tx: DatabaseTransaction) {
  // The fixed visitor role cannot be deleted: its existence marks completed seeding.
  if ((await tx.select({ id: roles.id }).from(roles).limit(1)).length) return;
  await tx
    .insert(affiliations)
    .values({ id: DEFAULT_AFFILIATION_ID, name: "사내" });
  const definitions: {
    name: string;
    systemKey: string;
    fixed?: boolean;
    requiresExpiry?: boolean;
    defaultExpiryDays?: number;
    permissions: Permission[];
  }[] = [
    {
      name: "관리자",
      systemKey: "administrator",
      permissions: PERMISSIONS.filter((p) => p !== "test_set.view_all"),
    },
    {
      name: "구성원",
      systemKey: "member",
      permissions: [
        "test_set.create",
        "test_set.invite",
        "test_set.public_link",
        "test_set.export",
        "project.manage",
        "project.create",
        "plugin.upload",
      ],
    },
    {
      name: "외부 참여자",
      systemKey: "external",
      requiresExpiry: true,
      defaultExpiryDays: 90,
      permissions: ["test_set.export"],
    },
    {
      name: "링크 방문자",
      systemKey: "link_visitor",
      fixed: true,
      permissions: ["test_set.export"],
    },
  ];
  for (const { permissions, ...definition } of definitions) {
    const [role] = await tx.insert(roles).values(definition).returning();
    await tx
      .insert(rolePermissions)
      .values(
        permissions.map((permission) => ({ roleId: role.id, permission })),
      );
  }
}
