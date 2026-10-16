-- This breaking local-development transition requires an explicit reset first.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "projects" LIMIT 1) THEN
    RAISE EXCEPTION 'Reset Cheddar local business data with scripts/reset-local-data.mjs before the terminology migration.';
  END IF;
END $$;
--> statement-breakpoint
-- Rename existing objects in place so foreign-key dependencies stay intact.
ALTER TABLE "project_evidence" RENAME TO "project_analysis";
--> statement-breakpoint
ALTER TABLE "sheet_column_views" RENAME TO "test_scenario_column_views";
--> statement-breakpoint
ALTER TABLE "sheet_columns" RENAME TO "test_scenario_columns";
--> statement-breakpoint
ALTER TABLE "sheets" RENAME TO "test_scenarios";
--> statement-breakpoint
ALTER TABLE "generation_jobs" RENAME COLUMN "sheet_id" TO "test_scenario_id";
--> statement-breakpoint
ALTER TABLE "generation_jobs" RENAME COLUMN "candidates" TO "results";
--> statement-breakpoint
ALTER TABLE "test_scenario_column_views" RENAME COLUMN "sheet_id" TO "test_scenario_id";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME COLUMN "sheet_id" TO "test_scenario_id";
--> statement-breakpoint
ALTER TABLE "test_case_values" RENAME COLUMN "sheet_id" TO "test_scenario_id";
--> statement-breakpoint
ALTER TABLE "test_cases" RENAME COLUMN "sheet_id" TO "test_scenario_id";
--> statement-breakpoint
ALTER TABLE "generation_jobs" RENAME CONSTRAINT "generation_jobs_project_id_sheet_id_sheets_project_id_id_fk" TO "generation_jobs_project_id_test_scenario_id_test_scenarios_project_id_id_fk";
--> statement-breakpoint
ALTER INDEX "generation_running_sheet_unique" RENAME TO "generation_running_test_scenario_unique";
--> statement-breakpoint
ALTER INDEX "generation_sheet_idx" RENAME TO "generation_test_scenario_idx";
--> statement-breakpoint
ALTER TABLE "project_analysis" RENAME CONSTRAINT "project_evidence_project_id_projects_id_fk" TO "project_analysis_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "project_analysis" RENAME CONSTRAINT "project_evidence_revision_check" TO "project_analysis_revision_check";
--> statement-breakpoint
ALTER TABLE "project_analysis" RENAME CONSTRAINT "project_evidence_pkey" TO "project_analysis_pkey";
--> statement-breakpoint
ALTER TABLE "test_scenario_column_views" RENAME CONSTRAINT "sheet_column_views_column_fk" TO "test_scenario_column_views_column_fk";
--> statement-breakpoint
ALTER TABLE "test_scenario_column_views" RENAME CONSTRAINT "sheet_column_views_sheet_id_column_id_pk" TO "test_scenario_column_views_test_scenario_id_column_id_pk";
--> statement-breakpoint
ALTER TABLE "test_scenario_column_views" RENAME CONSTRAINT "sheet_column_views_position_unique" TO "test_scenario_column_views_position_unique";
--> statement-breakpoint
ALTER TABLE "test_scenario_column_views" RENAME CONSTRAINT "sheet_column_views_dimensions_check" TO "test_scenario_column_views_dimensions_check";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_sheet_fk" TO "test_scenario_columns_test_scenario_fk";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_sheet_id_unique" TO "test_scenario_columns_test_scenario_id_unique";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_custom_fk_unique" TO "test_scenario_columns_custom_fk_unique";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_kind_check" TO "test_scenario_columns_kind_check";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_name_check" TO "test_scenario_columns_name_check";
--> statement-breakpoint
ALTER INDEX "sheet_columns_system_unique" RENAME TO "test_scenario_columns_system_unique";
--> statement-breakpoint
ALTER TABLE "test_scenario_columns" RENAME CONSTRAINT "sheet_columns_pkey" TO "test_scenario_columns_pkey";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_project_id_projects_id_fk" TO "test_scenarios_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_upload_fk" TO "test_scenarios_upload_fk";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_project_id_unique" TO "test_scenarios_project_id_unique";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_name_check" TO "test_scenarios_name_check";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_kind_check" TO "test_scenarios_kind_check";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_revisions_check" TO "test_scenarios_revisions_check";
--> statement-breakpoint
ALTER INDEX "sheets_project_created_idx" RENAME TO "test_scenarios_project_created_idx";
--> statement-breakpoint
ALTER INDEX "sheets_upload_created_idx" RENAME TO "test_scenarios_upload_created_idx";
--> statement-breakpoint
ALTER TABLE "test_scenarios" RENAME CONSTRAINT "sheets_pkey" TO "test_scenarios_pkey";
--> statement-breakpoint
ALTER TABLE "test_cases" RENAME CONSTRAINT "test_cases_sheet_fk" TO "test_cases_test_scenario_fk";
--> statement-breakpoint
ALTER TABLE "test_cases" RENAME CONSTRAINT "test_cases_sheet_id_unique" TO "test_cases_test_scenario_id_unique";
