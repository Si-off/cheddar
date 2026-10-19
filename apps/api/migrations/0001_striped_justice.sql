ALTER TABLE "projects" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "required_cases" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_memos" ADD CONSTRAINT "project_memos_project_id_unique" UNIQUE("project_id");