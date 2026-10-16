import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  GenerationResultItemDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import type { TestScenarioSnapshotDto } from "../contracts/test-scenarios.dto";

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 2000 }),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "projects_name_check",
      sql`char_length(btrim(${t.name})) > 0 AND ${t.name} = btrim(${t.name})`,
    ),
    check("projects_revision_check", sql`${t.revision} > 0`),
    index("projects_created_idx").on(t.createdAt, t.id),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    storageKey: text("storage_key").notNull().unique(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    mediaType: varchar("media_type", { length: 100 }),
    byteSize: bigint("byte_size", { mode: "number" }),
    sha256: varchar("sha256", { length: 64 }),
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("files_project_id_unique").on(t.projectId, t.id),
    index("files_project_created_idx").on(t.projectId, t.createdAt, t.id),
    check(
      "files_status_check",
      sql`${t.status} IN ('pending', 'ready', 'failed')`,
    ),
    check(
      "files_metadata_check",
      sql`${t.status} <> 'ready' OR (${t.mediaType} IS NOT NULL AND ${t.mediaType} IN ('image/png','image/jpeg','image/webp','application/json') AND ${t.byteSize} IS NOT NULL AND ${t.byteSize} > 0 AND ${t.sha256} IS NOT NULL AND ${t.sha256} ~ '^[a-f0-9]{64}$')`,
    ),
  ],
);

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    name: varchar("name", { length: 100 }).notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    requestHash: varchar("request_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uploads_project_id_unique").on(t.projectId, t.id),
    unique("uploads_project_request_unique").on(t.projectId, t.clientRequestId),
    index("uploads_project_created_idx").on(t.projectId, t.createdAt, t.id),
    check(
      "uploads_name_check",
      sql`char_length(btrim(${t.name})) > 0 AND ${t.name} = btrim(${t.name})`,
    ),
    check(
      "uploads_request_hash_check",
      sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const uploadFrames = pgTable(
  "upload_frames",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    uploadId: uuid("upload_id").notNull(),
    position: integer("position").notNull(),
    figmaFileKey: varchar("figma_file_key", { length: 200 }).notNull(),
    figmaNodeId: varchar("figma_node_id", { length: 200 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    imageFileId: uuid("image_file_id").notNull(),
    dataFileId: uuid("data_file_id").notNull(),
  },
  (t) => [
    unique("upload_frames_project_id_unique").on(t.projectId, t.id),
    unique("upload_frames_position_unique").on(t.uploadId, t.position),
    unique("upload_frames_source_unique").on(
      t.uploadId,
      t.figmaFileKey,
      t.figmaNodeId,
    ),
    foreignKey({
      name: "upload_frames_upload_fk",
      columns: [t.projectId, t.uploadId],
      foreignColumns: [uploads.projectId, uploads.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "upload_frames_image_fk",
      columns: [t.projectId, t.imageFileId],
      foreignColumns: [files.projectId, files.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "upload_frames_data_fk",
      columns: [t.projectId, t.dataFileId],
      foreignColumns: [files.projectId, files.id],
    }).onDelete("restrict"),
    index("upload_frames_image_idx").on(t.projectId, t.imageFileId),
    index("upload_frames_data_idx").on(t.projectId, t.dataFileId),
    check("upload_frames_position_check", sql`${t.position} >= 0`),
    check(
      "upload_frames_dimensions_check",
      sql`${t.width} >= 0.01 AND ${t.width} < 'Infinity'::float8 AND ${t.height} >= 0.01 AND ${t.height} < 'Infinity'::float8`,
    ),
    check(
      "upload_frames_names_check",
      sql`char_length(${t.figmaFileKey}) > 0 AND char_length(${t.figmaNodeId}) > 0 AND char_length(${t.name}) > 0`,
    ),
  ],
);

export const iaItems = pgTable(
  "ia_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    screenId: varchar("screen_id", { length: 100 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    description: varchar("description", { length: 2000 }),
    parentId: uuid("parent_id"),
    position: integer("position").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("ia_items_project_id_unique").on(t.projectId, t.id),
    unique("ia_items_screen_unique").on(t.projectId, t.screenId),
    foreignKey({
      name: "ia_items_parent_fk",
      columns: [t.projectId, t.parentId],
      foreignColumns: [t.projectId, t.id],
    }).onDelete("restrict"),
    index("ia_items_parent_idx").on(t.projectId, t.parentId, t.position, t.id),
    check(
      "ia_items_parent_check",
      sql`${t.parentId} IS NULL OR ${t.parentId} <> ${t.id}`,
    ),
    check(
      "ia_items_revision_check",
      sql`${t.revision} > 0 AND ${t.position} >= 0`,
    ),
    check(
      "ia_items_names_check",
      sql`char_length(btrim(${t.screenId})) > 0 AND ${t.screenId} = btrim(${t.screenId}) AND char_length(btrim(${t.name})) > 0 AND ${t.name} = btrim(${t.name})`,
    ),
  ],
);
export type TemplateColumn = {
  id: string;
  kind: "system" | "custom";
  name: string;
  field?: "caseCode" | "title";
  valueType?: "text" | "select" | "checkbox" | "tags";
  description?: string;
  options?: { id: string; name: string }[];
};
export type TemplateView = { columnId: string; width: number };
export const projectTemplates = pgTable(
  "project_templates",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "restrict" }),
    columns: jsonb("columns").$type<TemplateColumn[]>().notNull(),
    view: jsonb("view").$type<TemplateView[]>().notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("project_templates_revision_check", sql`${t.revision} > 0`),
    check(
      "project_templates_arrays_check",
      sql`jsonb_typeof(${t.columns}) = 'array' AND jsonb_typeof(${t.view}) = 'array'`,
    ),
  ],
);
export const testScenarios = pgTable(
  "test_scenarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "restrict" }),
    uploadId: uuid("upload_id"),
    name: varchar("name", { length: 100 }).notNull(),
    kind: varchar("kind", { length: 11 })
      .$type<"unit" | "integration">()
      .notNull(),
    contentRevision: integer("content_revision").notNull().default(1),
    viewRevision: integer("view_revision").notNull().default(1),
    nextCaseNumber: integer("next_case_number").notNull().default(1),
    sourceTemplateRevision: integer("source_template_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, precision: 3 })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("test_scenarios_project_id_unique").on(t.projectId, t.id),
    foreignKey({
      name: "test_scenarios_upload_fk",
      columns: [t.projectId, t.uploadId],
      foreignColumns: [uploads.projectId, uploads.id],
    }).onDelete("restrict"),
    index("test_scenarios_project_created_idx").on(
      t.projectId,
      t.createdAt,
      t.id,
    ),
    index("test_scenarios_upload_created_idx").on(
      t.projectId,
      t.uploadId,
      t.createdAt,
      t.id,
    ),
    check(
      "test_scenarios_name_check",
      sql`char_length(btrim(${t.name})) > 0 AND ${t.name} = btrim(${t.name})`,
    ),
    check(
      "test_scenarios_kind_check",
      sql`${t.kind} IN ('unit','integration')`,
    ),
    check(
      "test_scenarios_revisions_check",
      sql`${t.contentRevision} > 0 AND ${t.viewRevision} > 0 AND ${t.nextCaseNumber} > 0 AND ${t.sourceTemplateRevision} > 0`,
    ),
  ],
);
export const testScenarioColumns = pgTable(
  "test_scenario_columns",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    testScenarioId: uuid("test_scenario_id").notNull(),
    kind: varchar("kind", { length: 6 }).$type<"system" | "custom">().notNull(),
    field: varchar("field", { length: 20 }).$type<TemplateColumn["field"]>(),
    valueType: varchar("value_type", { length: 8 }).$type<
      TemplateColumn["valueType"]
    >(),
    description: text("description"),
    options: jsonb("options").$type<TemplateColumn["options"]>(),
    name: varchar("name", { length: 100 }).notNull(),
  },
  (t) => [
    unique("test_scenario_columns_test_scenario_id_unique").on(
      t.testScenarioId,
      t.id,
    ),
    unique("test_scenario_columns_custom_fk_unique").on(
      t.testScenarioId,
      t.id,
      t.kind,
    ),
    foreignKey({
      name: "test_scenario_columns_test_scenario_fk",
      columns: [t.projectId, t.testScenarioId],
      foreignColumns: [testScenarios.projectId, testScenarios.id],
    }).onDelete("restrict"),
    uniqueIndex("test_scenario_columns_system_unique")
      .on(t.testScenarioId, t.field)
      .where(sql`${t.kind} = 'system'`),
    check(
      "test_scenario_columns_kind_check",
      sql`(${t.kind} = 'system' AND ${t.field} IS NOT NULL AND ${t.field} IN ('caseCode','title') AND ${t.valueType} IS NULL) OR (${t.kind} = 'custom' AND ${t.field} IS NULL AND ${t.valueType} IS NOT NULL AND ${t.valueType} IN ('text','select','checkbox','tags'))`,
    ),
    check(
      "test_scenario_columns_name_check",
      sql`char_length(btrim(${t.name})) > 0 AND ${t.name} = btrim(${t.name})`,
    ),
  ],
);
export const testScenarioColumnViews = pgTable(
  "test_scenario_column_views",
  {
    testScenarioId: uuid("test_scenario_id").notNull(),
    columnId: uuid("column_id").notNull(),
    position: integer("position").notNull(),
    width: integer("width").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.testScenarioId, t.columnId] }),
    unique("test_scenario_column_views_position_unique").on(
      t.testScenarioId,
      t.position,
    ),
    foreignKey({
      name: "test_scenario_column_views_column_fk",
      columns: [t.testScenarioId, t.columnId],
      foreignColumns: [
        testScenarioColumns.testScenarioId,
        testScenarioColumns.id,
      ],
    }).onDelete("restrict"),
    check(
      "test_scenario_column_views_dimensions_check",
      sql`${t.position} >= 0 AND ${t.width} > 0`,
    ),
  ],
);
export const testCases = pgTable(
  "test_cases",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    testScenarioId: uuid("test_scenario_id").notNull(),
    position: integer("position").notNull(),
    caseCode: varchar("case_code", { length: 100 }).notNull(),
    title: text("title").notNull(),
  },
  (t) => [
    unique("test_cases_project_id_unique").on(t.projectId, t.id),
    unique("test_cases_test_scenario_id_unique").on(t.testScenarioId, t.id),
    unique("test_cases_position_unique").on(t.testScenarioId, t.position),
    uniqueIndex("test_cases_code_unique")
      .on(t.testScenarioId, t.caseCode)
      .where(sql`${t.caseCode} <> ''`),
    foreignKey({
      name: "test_cases_test_scenario_fk",
      columns: [t.projectId, t.testScenarioId],
      foreignColumns: [testScenarios.projectId, testScenarios.id],
    }).onDelete("restrict"),
    check("test_cases_position_check", sql`${t.position} >= 0`),
  ],
);
export const testCaseValues = pgTable(
  "test_case_values",
  {
    testScenarioId: uuid("test_scenario_id").notNull(),
    caseId: uuid("case_id").notNull(),
    columnId: uuid("column_id").notNull(),
    columnKind: varchar("column_kind", { length: 6 })
      .$type<"custom">()
      .notNull()
      .default("custom"),
    value:
      jsonb("value").$type<
        import("../contracts/test-scenarios.dto").ColumnValue
      >(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.columnId] }),
    foreignKey({
      name: "test_case_values_case_fk",
      columns: [t.testScenarioId, t.caseId],
      foreignColumns: [testCases.testScenarioId, testCases.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "test_case_values_column_fk",
      columns: [t.testScenarioId, t.columnId, t.columnKind],
      foreignColumns: [
        testScenarioColumns.testScenarioId,
        testScenarioColumns.id,
        testScenarioColumns.kind,
      ],
    }).onDelete("restrict"),
    index("test_case_values_column_idx").on(t.testScenarioId, t.columnId),
    check("test_case_values_kind_check", sql`${t.columnKind} = 'custom'`),
  ],
);
export const testCaseFrameLinks = pgTable(
  "test_case_frame_links",
  {
    projectId: uuid("project_id").notNull(),
    caseId: uuid("case_id").notNull(),
    frameId: uuid("frame_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.frameId] }),
    unique("test_case_frame_links_position_unique").on(t.caseId, t.position),
    foreignKey({
      name: "test_case_frame_links_case_fk",
      columns: [t.projectId, t.caseId],
      foreignColumns: [testCases.projectId, testCases.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "test_case_frame_links_frame_fk",
      columns: [t.projectId, t.frameId],
      foreignColumns: [uploadFrames.projectId, uploadFrames.id],
    }).onDelete("restrict"),
    index("test_case_frame_links_frame_idx").on(t.projectId, t.frameId),
    check("test_case_frame_links_position_check", sql`${t.position} >= 0`),
  ],
);
export const testCaseIaLinks = pgTable(
  "test_case_ia_links",
  {
    projectId: uuid("project_id").notNull(),
    caseId: uuid("case_id").notNull(),
    iaItemId: uuid("ia_item_id").notNull(),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.caseId, t.iaItemId] }),
    unique("test_case_ia_links_position_unique").on(t.caseId, t.position),
    foreignKey({
      name: "test_case_ia_links_case_fk",
      columns: [t.projectId, t.caseId],
      foreignColumns: [testCases.projectId, testCases.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "test_case_ia_links_ia_fk",
      columns: [t.projectId, t.iaItemId],
      foreignColumns: [iaItems.projectId, iaItems.id],
    }).onDelete("restrict"),
    index("test_case_ia_links_ia_idx").on(t.projectId, t.iaItemId),
    check("test_case_ia_links_position_check", sql`${t.position} >= 0`),
  ],
);

export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull(),
    testScenarioId: uuid("test_scenario_id").notNull(),
    clientRequestId: uuid("client_request_id").notNull(),
    requestHash: text("request_hash").notNull(),
    provider: text("provider").$type<"anthropic" | "openai">().notNull(),
    model: text("model").notNull(),
    status: text("status")
      .$type<"running" | "succeeded" | "failed">()
      .notNull()
      .default("running"),
    request: jsonb("request").$type<StartGenerationDto>().notNull(),
    snapshot: jsonb("snapshot").$type<TestScenarioSnapshotDto>().notNull(),
    results: jsonb("results")
      .$type<GenerationResultItemDto[]>()
      .notNull()
      .default([]),
    caseCount: integer("case_count").notNull().default(0),
    revision: integer("revision").notNull().default(1),
    error: text("error"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.projectId, t.testScenarioId],
      foreignColumns: [testScenarios.projectId, testScenarios.id],
    }).onDelete("restrict"),
    unique("generation_request_unique").on(t.projectId, t.clientRequestId),
    uniqueIndex("generation_running_test_scenario_unique")
      .on(t.testScenarioId)
      .where(sql`${t.status} = 'running'`),
    index("generation_test_scenario_idx").on(t.testScenarioId, t.createdAt),
    check(
      "generation_status_check",
      sql`${t.status} in ('running','succeeded','failed')`,
    ),
    check(
      "generation_provider_check",
      sql`${t.provider} in ('anthropic','openai')`,
    ),
  ],
);

// Source annotations and their manual associations are independent of uploaded bytes.
export const projectAnalysis = pgTable(
  "project_analysis",
  {
    projectId: uuid("project_id")
      .primaryKey()
      .references(() => projects.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(1),
    items: jsonb("items")
      .$type<import("../contracts/analysis.dto").AnalysisItemDto[]>()
      .notNull()
      .default([]),
    links: jsonb("links")
      .$type<import("../contracts/analysis.dto").AnalysisLinkDto[]>()
      .notNull()
      .default([]),
  },
  (t) => [check("project_analysis_revision_check", sql`${t.revision} > 0`)],
);
