CREATE TABLE "ai_call_usage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"job_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
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
	CONSTRAINT "ai_call_usage_status" CHECK ("ai_call_usage"."status" in ('running','completed','failed','unknown')),
	CONSTRAINT "ai_call_usage_provider" CHECK ("ai_call_usage"."provider" in ('openai','anthropic','fake'))
);
--> statement-breakpoint
CREATE TABLE "ai_provider_cost_syncs" (
	"provider" text NOT NULL,
	"scope_id" text NOT NULL,
	"bucket_start" timestamp with time zone NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	CONSTRAINT "ai_provider_cost_syncs_provider_scope_id_bucket_start_pk" PRIMARY KEY("provider","scope_id","bucket_start"),
	CONSTRAINT "ai_provider_cost_syncs_provider" CHECK ("ai_provider_cost_syncs"."provider" in ('openai','anthropic'))
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
	CONSTRAINT "ai_provider_costs_provider" CHECK ("ai_provider_costs"."provider" in ('openai','anthropic'))
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "client_request_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "request_hash" text;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() + interval '10 minutes' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "finished_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "duration_ms" bigint;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_call_usage" ADD CONSTRAINT "ai_call_usage_step_id_generation_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."generation_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_call_usage_job_idx" ON "ai_call_usage" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "ai_call_usage_step_idx" ON "ai_call_usage" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "ai_call_usage_provider_time_idx" ON "ai_call_usage" USING btree ("provider","started_at");--> statement-breakpoint
CREATE INDEX "ai_provider_costs_time_idx" ON "ai_provider_costs" USING btree ("provider","bucket_start");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_request" UNIQUE("requested_by","client_request_id");
