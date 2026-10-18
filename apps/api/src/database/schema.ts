import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { PERMISSIONS } from "../authorization/permissions";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const time = (name: string) => timestamp(name, { withTimezone: true });
export const permissionEnum = pgEnum("permission_key", PERMISSIONS);
export const scopeEnum = pgEnum("assignment_scope", ["global", "projects"]);
export const accountStatusEnum = pgEnum("account_status", [
  "invited",
  "active",
  "inactive",
]);
export const accessEnum = pgEnum("access_level", ["view", "edit"]);
export const columnTypeEnum = pgEnum("column_type", [
  "text",
  "select",
  "checkbox",
  "tags",
]);
export const jobStatusEnum = pgEnum("job_status", [
  "pending",
  "running",
  "completed",
  "failed",
]);

export const affiliations = pgTable("affiliations", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  createdAt: created(),
  updatedAt: updated(),
});
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull().unique(),
    affiliationId: uuid("affiliation_id")
      .notNull()
      .references(() => affiliations.id, { onDelete: "restrict" }),
    passwordHash: text("password_hash"),
    status: accountStatusEnum("status").notNull().default("invited"),
    expiresAt: time("expires_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "accounts_email_normalized",
      sql`${t.email} = lower(btrim(${t.email}))`,
    ),
    check(
      "accounts_active_password",
      sql`${t.status} <> 'active' OR ${t.passwordHash} IS NOT NULL`,
    ),
    index("accounts_affiliation_idx").on(t.affiliationId),
  ],
);
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    purpose: varchar("purpose", { length: 10 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: time("expires_at").notNull(),
    consumedAt: time("consumed_at"),
    createdAt: created(),
  },
  (t) => [
    check("auth_tokens_purpose", sql`${t.purpose} IN ('invite', 'reset')`),
    index("auth_tokens_account_idx").on(t.accountId, t.purpose),
  ],
);
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: time("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [index("sessions_account_idx").on(t.accountId)],
);
export const roles = pgTable(
  "roles",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    systemKey: varchar("system_key", { length: 30 }).unique(),
    fixed: boolean("fixed").notNull().default(false),
    requiresExpiry: boolean("requires_expiry").notNull().default(false),
    defaultExpiryDays: integer("default_expiry_days"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "roles_expiry_days",
      sql`(${t.defaultExpiryDays} IS NULL OR ${t.defaultExpiryDays} > 0) AND (NOT ${t.requiresExpiry} OR ${t.defaultExpiryDays} IS NOT NULL)`,
    ),
    check(
      "roles_fixed_visitor",
      sql`${t.fixed} = (${t.systemKey} IS NOT DISTINCT FROM 'link_visitor')`,
    ),
  ],
);
export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permission: permissionEnum("permission").notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permission] })],
);
export const projects = pgTable("projects", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  createdAt: created(),
  updatedAt: updated(),
});
export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "restrict" }),
    scope: scopeEnum("scope").notNull(),
  },
  (t) => [
    index("role_assignments_account_idx").on(t.accountId),
    index("role_assignments_role_idx").on(t.roleId),
  ],
);
export const roleAssignmentProjects = pgTable(
  "role_assignment_projects",
  {
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => roleAssignments.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.assignmentId, t.projectId] })],
);

// A template is one versioned JSON document; each test set copies its columns into rows.
export const projectTemplates = pgTable(
  "project_templates",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "cascade" }),
    columns: jsonb("columns")
      .$type<
        {
          id: string;
          name: string;
          type: "text" | "select" | "checkbox" | "tags";
          systemKey?: "test_id" | "title";
          description: string;
          options: string[];
        }[]
      >()
      .notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: updated(),
  },
  (t) => [check("project_templates_revision", sql`${t.revision} > 0`)],
);
export const featureGroups = pgTable(
  "feature_groups",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description").notNull().default(""),
    position: integer("position").notNull(),
  },
  (t) => [unique("feature_groups_name").on(t.projectId, t.name)],
);
export const requiredCases = pgTable("required_cases", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  position: integer("position").notNull(),
});
export const screenStructureItems = pgTable(
  "screen_structure_items",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    screenId: varchar("screen_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    parentId: uuid("parent_id"),
    description: text("description").notNull().default(""),
    position: integer("position").notNull(),
  },
  (t) => [
    unique("screen_structure_screen_id").on(t.projectId, t.screenId),
    unique("screen_structure_project_id").on(t.projectId, t.id),
    foreignKey({
      columns: [t.projectId, t.parentId],
      foreignColumns: [t.projectId, t.id],
    }).onDelete("restrict"),
    check(
      "screen_structure_not_self",
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),
  ],
);
export const projectMemos = pgTable("project_memos", {
  id: id(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
export const testSets = pgTable(
  "test_sets",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 200 }).notNull(),
    memo: text("memo").notNull().default(""),
    visibility: varchar("visibility", { length: 10 })
      .notNull()
      .default("private"),
    linkAccess: accessEnum("link_access").notNull().default("view"),
    linkTokenHash: varchar("link_token_hash", { length: 64 }).unique(),
    version: integer("version").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "test_sets_visibility",
      sql`${t.visibility} IN ('private', 'public') AND (${t.visibility} <> 'public' OR ${t.linkTokenHash} IS NOT NULL)`,
    ),
    check("test_sets_version", sql`${t.version} >= 0`),
    index("test_sets_owner_idx").on(t.ownerId),
    index("test_sets_project_idx").on(t.projectId),
  ],
);
export const testSetColumns = pgTable(
  "test_set_columns",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    type: columnTypeEnum("type").notNull(),
    systemKey: varchar("system_key", { length: 10 }),
    description: text("description").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    position: integer("position").notNull(),
  },
  (t) => [
    unique("test_set_columns_system").on(t.testSetId, t.systemKey),
    unique("test_set_columns_set_id").on(t.testSetId, t.id),
    check(
      "test_set_columns_system_type",
      sql`${t.systemKey} IS NULL OR (${t.systemKey} IN ('test_id', 'title') AND ${t.type} = 'text')`,
    ),
  ],
);
export const testCases = pgTable(
  "test_cases",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    createdBy: uuid("created_by").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    authorName: varchar("author_name", { length: 100 }).notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [unique("test_cases_set_id").on(t.testSetId, t.id)],
);
export const testCaseValues = pgTable(
  "test_case_values",
  {
    testSetId: uuid("test_set_id").notNull(),
    caseId: uuid("case_id").notNull(),
    columnId: uuid("column_id").notNull(),
    value: jsonb("value").$type<string | boolean | string[] | null>(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.columnId] }),
    foreignKey({
      columns: [t.testSetId, t.caseId],
      foreignColumns: [testCases.testSetId, testCases.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.testSetId, t.columnId],
      foreignColumns: [testSetColumns.testSetId, testSetColumns.id],
    }).onDelete("cascade"),
  ],
);
export const testSetMembers = pgTable(
  "test_set_members",
  {
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    access: accessEnum("access").notNull(),
    createdAt: created(),
  },
  (t) => [primaryKey({ columns: [t.testSetId, t.accountId] })],
);
export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    browserTokenHash: varchar("browser_token_hash", { length: 64 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: created(),
  },
  (t) => [
    unique("visitor_sessions_browser").on(t.testSetId, t.browserTokenHash),
    unique("visitor_sessions_name").on(t.testSetId, t.name),
    unique("visitor_sessions_set_id").on(t.testSetId, t.id),
  ],
);
export const viewPreferences = pgTable(
  "view_preferences",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    visitorSessionId: uuid("visitor_session_id"),
    view: varchar("view", { length: 10 }).notNull().default("table"),
    groupByColumnId: uuid("group_by_column_id"),
    columnWidths: jsonb("column_widths")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    rowHeights: jsonb("row_heights")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "view_preferences_actor",
      sql`num_nonnulls(${t.accountId}, ${t.visitorSessionId}) = 1`,
    ),
    check("view_preferences_view", sql`${t.view} IN ('table', 'card')`),
    unique("view_preferences_account").on(t.testSetId, t.accountId),
    unique("view_preferences_visitor").on(t.testSetId, t.visitorSessionId),
    foreignKey({
      columns: [t.testSetId, t.visitorSessionId],
      foreignColumns: [visitorSessions.testSetId, visitorSessions.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.testSetId, t.groupByColumnId],
      foreignColumns: [testSetColumns.testSetId, testSetColumns.id],
    }).onDelete("restrict"),
  ],
);
export const tempUploads = pgTable(
  "temp_uploads",
  {
    id: id(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    expiresAt: time("expires_at")
      .notNull()
      .default(sql`now() + interval '1 hour'`),
    claimedAt: time("claimed_at"),
    createdAt: created(),
  },
  (t) => [index("temp_uploads_expiry_idx").on(t.expiresAt)],
);
export const tempFrames = pgTable("temp_frames", {
  id: id(),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => tempUploads.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  screenDocument: text("screen_document").notNull(),
  imageStorageKeys: jsonb("image_storage_keys").$type<string[]>().notNull(),
  position: integer("position").notNull(),
});
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    uploadId: uuid("upload_id").references(() => tempUploads.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 10 }).notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    currentStage: varchar("current_stage", { length: 30 }),
    errorCode: text("error_code"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "generation_jobs_kind",
      sql`${t.kind} IN ('initial', 'append', 'rewrite')`,
    ),
  ],
);
export const generationSteps = pgTable(
  "generation_steps",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => generationJobs.id, { onDelete: "cascade" }),
    stage: varchar("stage", { length: 40 }).notNull(),
    workKey: varchar("work_key", { length: 100 }).notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    attempts: integer("attempts").notNull().default(0),
    promptVersion: text("prompt_version"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    cost: numeric("cost", { precision: 20, scale: 10 }),
    requiredCoverage: jsonb("required_coverage"),
    reviewRatio: numeric("review_ratio", { precision: 6, scale: 5 }),
    startedAt: time("started_at"),
    completedAt: time("completed_at"),
  },
  (t) => [unique("generation_steps_work").on(t.jobId, t.stage, t.workKey)],
);
export const reviewItems = pgTable(
  "review_items",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    screenDescription: text("screen_description").notNull(),
    questions: jsonb("questions")
      .$type<{ question: string; answer: string | null }[]>()
      .notNull(),
    draft: jsonb("draft").notNull(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "review_items_status",
      sql`${t.status} IN ('pending', 'excluded', 'resolved')`,
    ),
  ],
);
export const pluginConnections = pgTable(
  "plugin_connections",
  {
    id: id(),
    requestTokenHash: varchar("request_token_hash", { length: 64 })
      .notNull()
      .unique(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "cascade",
    }),
    tokenHash: varchar("token_hash", { length: 64 }).unique(),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    expiresAt: time("expires_at").notNull(),
    approvedAt: time("approved_at"),
    revokedAt: time("revoked_at"),
    createdAt: created(),
  },
  (t) => [
    check(
      "plugin_connections_status",
      sql`${t.status} IN ('pending', 'approved', 'revoked')`,
    ),
  ],
);
