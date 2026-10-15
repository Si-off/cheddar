import { sql } from "drizzle-orm";
import {
  bigint,
  check,
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
