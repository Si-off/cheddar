CREATE TABLE "ia_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"screen_id" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(2000),
	"parent_id" uuid,
	"position" integer NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ia_items_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "ia_items_screen_unique" UNIQUE("project_id","screen_id"),
	CONSTRAINT "ia_items_parent_check" CHECK ("ia_items"."parent_id" IS NULL OR "ia_items"."parent_id" <> "ia_items"."id"),
	CONSTRAINT "ia_items_revision_check" CHECK ("ia_items"."revision" > 0 AND "ia_items"."position" >= 0),
	CONSTRAINT "ia_items_names_check" CHECK (char_length(btrim("ia_items"."screen_id")) > 0 AND "ia_items"."screen_id" = btrim("ia_items"."screen_id") AND char_length(btrim("ia_items"."name")) > 0 AND "ia_items"."name" = btrim("ia_items"."name"))
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"columns" jsonb NOT NULL,
	"view" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_templates_revision_check" CHECK ("project_templates"."revision" > 0),
	CONSTRAINT "project_templates_arrays_check" CHECK (jsonb_typeof("project_templates"."columns") = 'array' AND jsonb_typeof("project_templates"."view") = 'array')
);
--> statement-breakpoint
CREATE TABLE "sheet_column_views" (
	"sheet_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"width" integer NOT NULL,
	CONSTRAINT "sheet_column_views_sheet_id_column_id_pk" PRIMARY KEY("sheet_id","column_id"),
	CONSTRAINT "sheet_column_views_position_unique" UNIQUE("sheet_id","position"),
	CONSTRAINT "sheet_column_views_dimensions_check" CHECK ("sheet_column_views"."position" >= 0 AND "sheet_column_views"."width" > 0)
);
--> statement-breakpoint
CREATE TABLE "sheet_columns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"kind" varchar(6) NOT NULL,
	"field" varchar(20),
	"value_type" varchar(4),
	"name" varchar(100) NOT NULL,
	CONSTRAINT "sheet_columns_sheet_id_unique" UNIQUE("sheet_id","id"),
	CONSTRAINT "sheet_columns_custom_fk_unique" UNIQUE("sheet_id","id","kind"),
	CONSTRAINT "sheet_columns_kind_check" CHECK (("sheet_columns"."kind" = 'system' AND "sheet_columns"."field" IS NOT NULL AND "sheet_columns"."field" IN ('caseCode','title','preconditions','steps','expectedResult','priority','relatedFrames','screens') AND "sheet_columns"."value_type" IS NULL) OR ("sheet_columns"."kind" = 'custom' AND "sheet_columns"."field" IS NULL AND "sheet_columns"."value_type" IS NOT NULL AND "sheet_columns"."value_type" = 'text')),
	CONSTRAINT "sheet_columns_name_check" CHECK (char_length(btrim("sheet_columns"."name")) > 0 AND "sheet_columns"."name" = btrim("sheet_columns"."name"))
);
--> statement-breakpoint
CREATE TABLE "sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"upload_id" uuid,
	"name" varchar(100) NOT NULL,
	"kind" varchar(11) NOT NULL,
	"content_revision" integer DEFAULT 1 NOT NULL,
	"view_revision" integer DEFAULT 1 NOT NULL,
	"next_case_number" integer DEFAULT 1 NOT NULL,
	"source_template_revision" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sheets_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "sheets_name_check" CHECK (char_length(btrim("sheets"."name")) > 0 AND "sheets"."name" = btrim("sheets"."name")),
	CONSTRAINT "sheets_kind_check" CHECK ("sheets"."kind" IN ('unit','integration')),
	CONSTRAINT "sheets_revisions_check" CHECK ("sheets"."content_revision" > 0 AND "sheets"."view_revision" > 0 AND "sheets"."next_case_number" > 0 AND "sheets"."source_template_revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "test_case_frame_links" (
	"project_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"frame_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "test_case_frame_links_case_id_frame_id_pk" PRIMARY KEY("case_id","frame_id"),
	CONSTRAINT "test_case_frame_links_position_unique" UNIQUE("case_id","position"),
	CONSTRAINT "test_case_frame_links_position_check" CHECK ("test_case_frame_links"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "test_case_ia_links" (
	"project_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"ia_item_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "test_case_ia_links_case_id_ia_item_id_pk" PRIMARY KEY("case_id","ia_item_id"),
	CONSTRAINT "test_case_ia_links_position_unique" UNIQUE("case_id","position"),
	CONSTRAINT "test_case_ia_links_position_check" CHECK ("test_case_ia_links"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "test_case_values" (
	"sheet_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"column_kind" varchar(6) DEFAULT 'custom' NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "test_case_values_case_id_column_id_pk" PRIMARY KEY("case_id","column_id"),
	CONSTRAINT "test_case_values_kind_check" CHECK ("test_case_values"."column_kind" = 'custom')
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"case_code" varchar(100) NOT NULL,
	"title" text NOT NULL,
	"preconditions" text NOT NULL,
	"steps" text NOT NULL,
	"expected_result" text NOT NULL,
	"priority" varchar(6),
	CONSTRAINT "test_cases_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "test_cases_sheet_id_unique" UNIQUE("sheet_id","id"),
	CONSTRAINT "test_cases_position_unique" UNIQUE("sheet_id","position"),
	CONSTRAINT "test_cases_position_check" CHECK ("test_cases"."position" >= 0),
	CONSTRAINT "test_cases_priority_check" CHECK ("test_cases"."priority" IS NULL OR "test_cases"."priority" IN ('high','medium','low'))
);
--> statement-breakpoint
ALTER TABLE "ia_items" ADD CONSTRAINT "ia_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ia_items" ADD CONSTRAINT "ia_items_parent_fk" FOREIGN KEY ("project_id","parent_id") REFERENCES "public"."ia_items"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_column_views" ADD CONSTRAINT "sheet_column_views_column_fk" FOREIGN KEY ("sheet_id","column_id") REFERENCES "public"."sheet_columns"("sheet_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheet_columns" ADD CONSTRAINT "sheet_columns_sheet_fk" FOREIGN KEY ("project_id","sheet_id") REFERENCES "public"."sheets"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_upload_fk" FOREIGN KEY ("project_id","upload_id") REFERENCES "public"."uploads"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_frame_links" ADD CONSTRAINT "test_case_frame_links_case_fk" FOREIGN KEY ("project_id","case_id") REFERENCES "public"."test_cases"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_frame_links" ADD CONSTRAINT "test_case_frame_links_frame_fk" FOREIGN KEY ("project_id","frame_id") REFERENCES "public"."upload_frames"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_ia_links" ADD CONSTRAINT "test_case_ia_links_case_fk" FOREIGN KEY ("project_id","case_id") REFERENCES "public"."test_cases"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_ia_links" ADD CONSTRAINT "test_case_ia_links_ia_fk" FOREIGN KEY ("project_id","ia_item_id") REFERENCES "public"."ia_items"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_values" ADD CONSTRAINT "test_case_values_case_fk" FOREIGN KEY ("sheet_id","case_id") REFERENCES "public"."test_cases"("sheet_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_values" ADD CONSTRAINT "test_case_values_column_fk" FOREIGN KEY ("sheet_id","column_id","column_kind") REFERENCES "public"."sheet_columns"("sheet_id","id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_sheet_fk" FOREIGN KEY ("project_id","sheet_id") REFERENCES "public"."sheets"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ia_items_parent_idx" ON "ia_items" USING btree ("project_id","parent_id","position","id");--> statement-breakpoint
CREATE UNIQUE INDEX "sheet_columns_system_unique" ON "sheet_columns" USING btree ("sheet_id","field") WHERE "sheet_columns"."kind" = 'system';--> statement-breakpoint
CREATE INDEX "sheets_project_created_idx" ON "sheets" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "sheets_upload_created_idx" ON "sheets" USING btree ("project_id","upload_id","created_at","id");--> statement-breakpoint
CREATE INDEX "test_case_frame_links_frame_idx" ON "test_case_frame_links" USING btree ("project_id","frame_id");--> statement-breakpoint
CREATE INDEX "test_case_ia_links_ia_idx" ON "test_case_ia_links" USING btree ("project_id","ia_item_id");--> statement-breakpoint
CREATE INDEX "test_case_values_column_idx" ON "test_case_values" USING btree ("sheet_id","column_id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_code_unique" ON "test_cases" USING btree ("sheet_id","case_code") WHERE "test_cases"."case_code" <> '';
--> statement-breakpoint
-- Backfill only missing templates; never replace an existing edited snapshot.
WITH initial_fields(position, field, name) AS (
  VALUES (0, 'caseCode', '케이스 번호'), (1, 'title', '제목'),
    (2, 'preconditions', '사전조건'), (3, 'steps', '수행 단계'),
    (4, 'expectedResult', '기대 결과'), (5, 'priority', '우선순위'),
    (6, 'relatedFrames', '관련 프레임'), (7, 'screens', 'IA 화면')
), new_columns AS MATERIALIZED (
  SELECT p.id AS project_id, gen_random_uuid() AS id, f.* FROM projects p
  CROSS JOIN initial_fields f
  WHERE NOT EXISTS (SELECT 1 FROM project_templates t WHERE t.project_id = p.id)
)
INSERT INTO project_templates(project_id, columns, view)
SELECT project_id,
  jsonb_agg(jsonb_build_object('id', id, 'kind', 'system', 'field', field, 'name', name) ORDER BY position),
  jsonb_agg(jsonb_build_object('columnId', id, 'width', 180) ORDER BY position)
FROM new_columns GROUP BY project_id
ON CONFLICT (project_id) DO NOTHING;
