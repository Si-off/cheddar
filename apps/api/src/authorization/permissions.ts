export const PERMISSIONS = [
  "test_set.create",
  "test_set.invite",
  "test_set.public_link",
  "test_set.export",
  "test_set.view_all",
  "project.manage",
  "project.create",
  "plugin.upload",
  "account.manage",
  "role.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const GLOBAL_ONLY: readonly Permission[] = [
  "project.create",
  "plugin.upload",
  "account.manage",
  "role.manage",
];
export const SCOPES = ["global", "projects"] as const;
export type Scope = (typeof SCOPES)[number];
