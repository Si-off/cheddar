CREATE TABLE "scenario_canvases" (
	"test_scenario_id" uuid PRIMARY KEY NOT NULL,
	"flow_revision" integer DEFAULT 1 NOT NULL,
	"layout_revision" integer DEFAULT 1 NOT NULL,
	"flow" jsonb DEFAULT '{"steps":[],"edges":[]}'::jsonb NOT NULL,
	"layout" jsonb DEFAULT '{"groupBy":null,"positions":[],"collapsed":[]}'::jsonb NOT NULL,
	"previous" jsonb
);
--> statement-breakpoint
CREATE TABLE "scenario_flow_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"test_scenario_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"request_hash" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"content_revision" integer NOT NULL,
	"flow_revision" integer NOT NULL,
	"layout_revision" integer NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_generation_request_unique" UNIQUE("project_id","client_request_id")
);
--> statement-breakpoint
ALTER TABLE "scenario_canvases" ADD CONSTRAINT "scenario_canvases_test_scenario_id_test_scenarios_id_fk" FOREIGN KEY ("test_scenario_id") REFERENCES "public"."test_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenario_flow_jobs" ADD CONSTRAINT "scenario_flow_jobs_project_id_test_scenario_id_test_scenarios_project_id_id_fk" FOREIGN KEY ("project_id","test_scenario_id") REFERENCES "public"."test_scenarios"("project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flow_generation_scenario_idx" ON "scenario_flow_jobs" USING btree ("test_scenario_id","created_at");