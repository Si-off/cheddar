import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

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
