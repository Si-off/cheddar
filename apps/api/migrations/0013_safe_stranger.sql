ALTER TABLE "view_preferences" DROP CONSTRAINT "view_preferences_view";--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "feature_group_id" uuid;--> statement-breakpoint
ALTER TABLE "test_cases" ADD COLUMN "feature_group_id" uuid;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD COLUMN "canvas_group" varchar(10) DEFAULT 'feature' NOT NULL;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD COLUMN "canvas_density" varchar(10) DEFAULT 'brief' NOT NULL;--> statement-breakpoint
UPDATE "view_preferences"
SET "view" = CASE WHEN "view" = 'card' THEN 'canvas' ELSE "view" END,
    "canvas_group" = CASE WHEN "group_by_column_id" IS NOT NULL THEN 'column' ELSE 'feature' END;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_feature_group_id_feature_groups_id_fk" FOREIGN KEY ("feature_group_id") REFERENCES "public"."feature_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_feature_group_id_feature_groups_id_fk" FOREIGN KEY ("feature_group_id") REFERENCES "public"."feature_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_canvas_group" CHECK ("view_preferences"."canvas_group" IN ('feature', 'column', 'none'));--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_canvas_density" CHECK ("view_preferences"."canvas_density" IN ('brief', 'detail'));--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_view" CHECK ("view_preferences"."view" IN ('table', 'canvas'));
