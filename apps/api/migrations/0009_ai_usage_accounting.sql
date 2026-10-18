CREATE TABLE "ai_call_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid,
	"flow_job_id" uuid,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"requested_model" text NOT NULL,
	"response_model" text,
	"request_id" text,
	"response_id" text,
	"service_tier" text,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" bigint,
	"http_status" integer,
	"error_code" text,
	"usage_known" boolean DEFAULT false NOT NULL,
	"input_tokens" bigint,
	"output_tokens" bigint,
	"cached_input_tokens" bigint,
	"cache_write_tokens" bigint,
	"reasoning_tokens" bigint,
	"raw_usage" jsonb,
	"calculated_cost_usd" numeric(24, 12),
	"pricing" jsonb,
	CONSTRAINT "ai_call_usage_owner_check" CHECK (num_nonnulls("ai_call_usage"."job_id", "ai_call_usage"."flow_job_id") = 1),
	CONSTRAINT "ai_call_usage_status_check" CHECK ("ai_call_usage"."status" in ('running','succeeded','failed','unknown')),
	CONSTRAINT "ai_call_usage_provider_check" CHECK ("ai_call_usage"."provider" in ('openai','anthropic'))
);
--> statement-breakpoint
CREATE TABLE "ai_provider_costs" (
	"provider" text NOT NULL,
	"scope_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"bucket_end" timestamp with time zone NOT NULL,
	"item_key" text NOT NULL,
	"dimensions" jsonb NOT NULL,
	"amount_usd" numeric NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_costs_provider_scope_id_bucket_start_item_key_pk" PRIMARY KEY("provider","scope_id","bucket_start","item_key"),
	CONSTRAINT "ai_provider_costs_provider_check" CHECK ("ai_provider_costs"."provider" in ('openai','anthropic'))
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "duration_ms" bigint;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_flow_job_id_scenario_flow_jobs_id_fk" FOREIGN KEY ("flow_job_id") REFERENCES "public"."scenario_flow_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_usage_job_idx" ON "ai_call_usage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ai_call_usage_flow_job_idx" ON "ai_call_usage" USING btree ("flow_job_id");--> statement-breakpoint
CREATE INDEX "ai_call_usage_project_time_idx" ON "ai_call_usage" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "ai_call_usage_provider_time_idx" ON "ai_call_usage" USING btree ("provider","started_at");--> statement-breakpoint
CREATE INDEX "ai_provider_costs_time_idx" ON "ai_provider_costs" USING btree ("provider","bucket_start");