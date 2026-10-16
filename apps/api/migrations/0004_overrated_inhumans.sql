CREATE TABLE "project_evidence" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "project_evidence_revision_check" CHECK ("project_evidence"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_evidence" ADD CONSTRAINT "project_evidence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;