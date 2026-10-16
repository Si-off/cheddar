-- Development data reset is explicitly required; migrations never erase cases implicitly.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM projects) THEN
    RAISE EXCEPTION 'Reset local development data explicitly before migrating configurable columns';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "test_cases" DROP CONSTRAINT "test_cases_priority_check";--> statement-breakpoint
ALTER TABLE "test_scenario_columns" DROP CONSTRAINT "test_scenario_columns_kind_check";--> statement-breakpoint
ALTER TABLE "test_case_values" ALTER COLUMN "value" SET DATA TYPE jsonb USING to_jsonb("value");--> statement-breakpoint
ALTER TABLE "test_case_values" ALTER COLUMN "value" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "test_scenario_columns" ALTER COLUMN "value_type" SET DATA TYPE varchar(8);--> statement-breakpoint
ALTER TABLE "test_scenario_columns" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "test_scenario_columns" ADD COLUMN "options" jsonb;--> statement-breakpoint

ALTER TABLE "test_cases" DROP COLUMN "preconditions";--> statement-breakpoint
ALTER TABLE "test_cases" DROP COLUMN "steps";--> statement-breakpoint
ALTER TABLE "test_cases" DROP COLUMN "expected_result";--> statement-breakpoint
ALTER TABLE "test_cases" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "test_scenario_columns" ADD CONSTRAINT "test_scenario_columns_kind_check" CHECK (("test_scenario_columns"."kind" = 'system' AND "test_scenario_columns"."field" IS NOT NULL AND "test_scenario_columns"."field" IN ('caseCode','title') AND "test_scenario_columns"."value_type" IS NULL) OR ("test_scenario_columns"."kind" = 'custom' AND "test_scenario_columns"."field" IS NULL AND "test_scenario_columns"."value_type" IS NOT NULL AND "test_scenario_columns"."value_type" IN ('text','select','checkbox','tags')));