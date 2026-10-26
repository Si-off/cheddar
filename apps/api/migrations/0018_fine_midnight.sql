CREATE TABLE "project_qa_references" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_qa_references" ADD CONSTRAINT "project_qa_references_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;