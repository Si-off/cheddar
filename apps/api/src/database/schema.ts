import type { CellValue, OptionColor } from "@workspace/contracts";
import { sql } from "drizzle-orm";
import {
  bigint,
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
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { ScreenIdRulePartDto } from "../contracts/project.dto";
import type { QaReference } from "../generation/pi/reference";

const id = () => uuid("id").primaryKey().defaultRandom();
const created = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const time = (name: string) => timestamp(name, { withTimezone: true });
export const accountRoleEnum = pgEnum("account_role", ["admin", "member"]);
export const accountStatusEnum = pgEnum("account_status", [
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

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    name: varchar("name", { length: 100 }).notNull(),
    loginId: varchar("login_id", { length: 254 }).notNull().unique(),
    role: accountRoleEnum("role").notNull().default("member"),
    passwordHash: text("password_hash"),
    status: accountStatusEnum("status").notNull().default("active"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "accounts_login_id_normalized",
      sql`${t.loginId} = lower(btrim(${t.loginId}))`,
    ),
    check(
      "accounts_active_password",
      sql`${t.status} <> 'active' OR ${t.passwordHash} IS NOT NULL`,
    ),
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
export const projects = pgTable("projects", {
  id: id(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description").notNull().default(""),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => accounts.id, { onDelete: "restrict" }),
  createdAt: created(),
  updatedAt: updated(),
});
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
          presetKey: string | null;
          enabled: boolean;
          systemKey: "test_id" | "title" | null;
          description: string;
          options: string[];
          colors?: Record<string, OptionColor>;
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
export const screenStructureItems = pgTable(
  "screen_structure_items",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    screenId: varchar("screen_id", { length: 100 }).notNull(),
    type: varchar("type", { length: 16 })
      .$type<"page" | "popup" | "bottom_sheet" | "tab">()
      .notNull()
      .default("page"),
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
    .unique()
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
    linkToken: varchar("link_token", { length: 43 }).unique(),
    version: integer("version").notNull().default(0),
    // 삭제한 케이스의 자동 번호도 다시 사용하지 않는다. 긴 사용자 입력 번호를 보존한다.
    testIdCounter: text("test_id_counter").notNull().default("0"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "test_sets_visibility",
      sql`${t.visibility} IN ('private', 'public') AND (${t.visibility} <> 'public' OR ${t.linkToken} IS NOT NULL)`,
    ),
    check(
      "test_sets_link_token",
      sql`${t.linkToken} IS NULL OR ${t.linkToken} ~ '^[A-Za-z0-9_-]{43}$'`,
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
    presetKey: varchar("preset_key", { length: 40 }),
    description: text("description").notNull().default(""),
    options: jsonb("options").$type<string[]>().notNull().default([]),
    colors: jsonb("colors")
      .$type<Record<string, OptionColor>>()
      .notNull()
      .default({}),
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
    featureGroupId: uuid("feature_group_id").references(
      () => featureGroups.id,
      {
        onDelete: "set null",
      },
    ),
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
    value: jsonb("value").$type<CellValue>(),
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
    canvasGroup: varchar("canvas_group", { length: 10 })
      .$type<"feature" | "column" | "none">()
      .notNull()
      .default("feature"),
    canvasDensity: varchar("canvas_density", { length: 10 })
      .$type<"brief" | "detail">()
      .notNull()
      .default("brief"),
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
    check("view_preferences_view", sql`${t.view} IN ('table', 'canvas')`),
    check(
      "view_preferences_canvas_group",
      sql`${t.canvasGroup} IN ('feature', 'column', 'none')`,
    ),
    check(
      "view_preferences_canvas_density",
      sql`${t.canvasDensity} IN ('brief', 'detail')`,
    ),
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
    kind: varchar("kind", { length: 16 }).notNull(),
    status: jobStatusEnum("status").notNull().default("pending"),
    currentStage: varchar("current_stage", { length: 30 }),
    errorCode: text("error_code"),
    addedCount: integer("added_count").notNull().default(0),
    reviewCount: integer("review_count").notNull().default(0),
    reviewItemId: uuid("review_item_id"),
    clientRequestId: uuid("client_request_id"),
    requestHash: text("request_hash"),
    expiresAt: time("expires_at")
      .notNull()
      .default(sql`now() + interval '10 minutes'`),
    finishedAt: time("finished_at"),
    durationMs: bigint("duration_ms", { mode: "number" }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "generation_jobs_kind",
      sql`${t.kind} IN ('initial', 'append', 'rewrite', 'fill_column')`,
    ),
    unique("generation_jobs_request").on(t.requestedBy, t.clientRequestId),
    uniqueIndex("generation_jobs_active_set")
      .on(t.testSetId)
      .where(sql`${t.status} IN ('pending', 'running')`),
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
    cacheReadTokens: integer("cache_read_tokens"),
    cacheCreationTokens: integer("cache_creation_tokens"),
    failureCode: text("failure_code"),
    mergedCount: integer("merged_count").notNull().default(0),
    repairCount: integer("repair_count").notNull().default(0),
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
    reason: text("reason").notNull().default(""),
    questions: jsonb("questions")
      .$type<{ question: string; answer: string | null }[]>()
      .notNull(),
    draft: jsonb("draft").notNull(),
    featureGroupId: uuid("feature_group_id").references(
      () => featureGroups.id,
      {
        onDelete: "set null",
      },
    ),
    status: varchar("status", { length: 12 }).notNull().default("pending"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    check(
      "review_items_status",
      sql`${t.status} IN ('pending', 'rewriting', 'excluded', 'resolved')`,
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
    tokenExpiresAt: time("token_expires_at"),
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
    index("plugin_connections_account_idx").on(t.accountId),
  ],
);

/** 계정마다 하나인 Figma 개인 액세스 토큰. 원문은 저장소 키로 암호화해 둔다 */
export const figmaTokens = pgTable("figma_tokens", {
  accountId: uuid("account_id")
    .primaryKey()
    .references(() => accounts.id, { onDelete: "cascade" }),
  encryptedToken: text("encrypted_token").notNull(),
  tokenSuffix: varchar("token_suffix", { length: 8 }).notNull(),
  figmaHandle: text("figma_handle").notNull(),
  figmaEmail: text("figma_email").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

export const aiCallUsage = pgTable(
  "ai_call_usage",
  {
    id: uuid("id").primaryKey(),
    jobId: uuid("job_id").references(() => generationJobs.id, {
      onDelete: "cascade",
    }),
    stepId: uuid("step_id").references(() => generationSteps.id, {
      onDelete: "cascade",
    }),
    // 생성 작업 밖의 단발 호출(파일에서 화면 구조 초안 만들기)은 프로젝트에 속한다.
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    purpose: text("purpose"),
    provider: text("provider").notNull(),
    requestedModel: text("requested_model").notNull(),
    responseModel: text("response_model"),
    requestId: text("request_id"),
    responseId: text("response_id"),
    serviceTier: text("service_tier"),
    status: text("status").notNull().default("running"),
    startedAt: time("started_at").notNull(),
    finishedAt: time("finished_at"),
    durationMs: bigint("duration_ms", { mode: "number" }),
    httpStatus: integer("http_status"),
    errorCode: text("error_code"),
    usageKnown: boolean("usage_known").notNull().default(false),
    inputTokens: bigint("input_tokens", { mode: "number" }),
    outputTokens: bigint("output_tokens", { mode: "number" }),
    cachedInputTokens: bigint("cached_input_tokens", { mode: "number" }),
    cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }),
    rawUsage: jsonb("raw_usage"),
    calculatedCostUsd: numeric("calculated_cost_usd", {
      precision: 24,
      scale: 12,
    }),
    pricing: jsonb("pricing"),
  },
  (t) => [
    check(
      "ai_call_usage_status",
      sql`${t.status} in ('running','completed','failed','unknown')`,
    ),
    check(
      "ai_call_usage_owner",
      sql`(${t.jobId} is not null and ${t.stepId} is not null and ${t.projectId} is null and ${t.purpose} is null) or (${t.jobId} is null and ${t.stepId} is null and ${t.projectId} is not null and ${t.purpose} is not null)`,
    ),
    check(
      "ai_call_usage_provider",
      sql`${t.provider} in ('openai','anthropic','fake')`,
    ),
    index("ai_call_usage_job_idx").on(t.jobId),
    index("ai_call_usage_step_idx").on(t.stepId),
    index("ai_call_usage_project_idx").on(t.projectId),
    index("ai_call_usage_provider_time_idx").on(t.provider, t.startedAt),
  ],
);
export const aiProviderCostSyncs = pgTable(
  "ai_provider_cost_syncs",
  {
    provider: text("provider").$type<"openai" | "anthropic">().notNull(),
    scopeId: text("scope_id").notNull(),
    bucketStart: time("bucket_start").notNull(),
    syncedAt: time("synced_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.scopeId, t.bucketStart] }),
    check(
      "ai_provider_cost_syncs_provider",
      sql`${t.provider} in ('openai','anthropic')`,
    ),
  ],
);
export const aiProviderCosts = pgTable(
  "ai_provider_costs",
  {
    provider: text("provider").$type<"openai" | "anthropic">().notNull(),
    scopeId: text("scope_id").notNull(),
    bucketStart: time("bucket_start").notNull(),
    bucketEnd: time("bucket_end").notNull(),
    itemKey: text("item_key").notNull(),
    dimensions: jsonb("dimensions")
      .$type<Record<string, string | null>>()
      .notNull(),
    amountUsd: numeric("amount_usd").notNull(),
    syncedAt: time("synced_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.scopeId, t.bucketStart, t.itemKey] }),
    check(
      "ai_provider_costs_provider",
      sql`${t.provider} in ('openai','anthropic')`,
    ),
    index("ai_provider_costs_time_idx").on(t.provider, t.bucketStart),
  ],
);

export const screenIdRules = pgTable(
  "screen_id_rules",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    separator: varchar("separator", { length: 3 }).notNull().default("_"),
    parts: jsonb("parts").$type<ScreenIdRulePartDto[]>().notNull(),
    position: integer("position").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [unique("screen_id_rules_name").on(t.projectId, t.name)],
);

export const cellImages = pgTable(
  "cell_images",
  {
    id: id(),
    testSetId: uuid("test_set_id")
      .notNull()
      .references(() => testSets.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull().unique(),
    contentType: varchar("content_type", { length: 20 }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    createdAt: created(),
    accountId: uuid("account_id").references(() => accounts.id, {
      onDelete: "restrict",
    }),
    // 링크 교체로 세션이 지워져도 업로더 식별자와 이미지는 보존한다.
    visitorSessionId: uuid("visitor_session_id"),
  },
  (t) => [
    index("cell_images_set_idx").on(t.testSetId),
    check(
      "cell_images_actor",
      sql`num_nonnulls(${t.accountId}, ${t.visitorSessionId}) = 1`,
    ),
    check(
      "cell_images_dimensions",
      sql`${t.width} > 0 AND ${t.height} > 0 AND ${t.byteSize} > 0 AND ${t.byteSize} <= 10485760`,
    ),
    check(
      "cell_images_content_type",
      sql`${t.contentType} IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp')`,
    ),
  ],
);

/** 프로젝트에 한 번 등록하는 기준 QA 문서. 생성 작업에는 사본을 고정한다. */
export const projectQaReferences = pgTable("project_qa_references", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  document: jsonb("document").$type<QaReference>().notNull(),
  updatedAt: updated(),
});
