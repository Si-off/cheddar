CREATE TABLE "screen_id_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"separator" varchar(3) DEFAULT '_' NOT NULL,
	"parts" jsonb NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screen_id_rules_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
ALTER TABLE "screen_structure_items" ADD COLUMN "type" varchar(16) DEFAULT 'page' NOT NULL;--> statement-breakpoint
ALTER TABLE "screen_id_rules" ADD CONSTRAINT "screen_id_rules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;