ALTER TABLE "ai_call_usage" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ALTER COLUMN "step_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD COLUMN "purpose" text;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_usage_project_idx" ON "ai_call_usage" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_owner" CHECK (("ai_call_usage"."job_id" is not null and "ai_call_usage"."step_id" is not null) or ("ai_call_usage"."job_id" is null and "ai_call_usage"."step_id" is null and "ai_call_usage"."project_id" is not null and "ai_call_usage"."purpose" is not null));