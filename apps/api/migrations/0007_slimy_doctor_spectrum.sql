DROP TABLE "required_cases" CASCADE;--> statement-breakpoint
ALTER TABLE "test_set_columns" ADD COLUMN "preset_key" varchar(40);--> statement-breakpoint
UPDATE "project_templates"
SET "columns" = (
  SELECT COALESCE(jsonb_agg(item || '{"presetKey": null, "enabled": true}'::jsonb ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements("project_templates"."columns") WITH ORDINALITY AS entries(item, position)
);
