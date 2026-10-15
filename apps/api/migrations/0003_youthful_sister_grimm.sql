CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sheet_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"request" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"case_count" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"error" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_request_unique" UNIQUE("project_id","client_request_id"),
	CONSTRAINT "generation_status_check" CHECK ("generation_jobs"."status" in ('running','succeeded','failed')),
	CONSTRAINT "generation_provider_check" CHECK ("generation_jobs"."provider" in ('anthropic','openai'))
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_project_id_sheet_id_sheets_project_id_id_fk" FOREIGN KEY ("project_id","sheet_id") REFERENCES "public"."sheets"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_running_sheet_unique" ON "generation_jobs" USING btree ("sheet_id") WHERE "generation_jobs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "generation_sheet_idx" ON "generation_jobs" USING btree ("sheet_id","created_at");