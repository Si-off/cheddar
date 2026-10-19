CREATE TYPE "public"."access_level" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('invited', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."column_type" AS ENUM('text', 'select', 'checkbox', 'tags');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."permission_key" AS ENUM('test_set.create', 'test_set.invite', 'test_set.public_link', 'test_set.export', 'test_set.view_all', 'project.manage', 'project.create', 'plugin.upload', 'account.manage', 'role.manage');--> statement-breakpoint
CREATE TYPE "public"."assignment_scope" AS ENUM('global', 'projects');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"email" varchar(254) NOT NULL,
	"affiliation_id" uuid NOT NULL,
	"password_hash" text,
	"status" "account_status" DEFAULT 'invited' NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_email_unique" UNIQUE("email"),
	CONSTRAINT "accounts_email_normalized" CHECK ("accounts"."email" = lower(btrim("accounts"."email"))),
	CONSTRAINT "accounts_active_password" CHECK ("accounts"."status" <> 'active' OR "accounts"."password_hash" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "affiliations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "affiliations_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"purpose" varchar(10) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "auth_tokens_purpose" CHECK ("auth_tokens"."purpose" IN ('invite', 'reset'))
);
--> statement-breakpoint
CREATE TABLE "feature_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "feature_groups_name" UNIQUE("project_id","name")
);
--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"upload_id" uuid,
	"kind" varchar(10) NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"current_stage" varchar(30),
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "generation_jobs_kind" CHECK ("generation_jobs"."kind" IN ('initial', 'append', 'rewrite'))
);
--> statement-breakpoint
CREATE TABLE "generation_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" varchar(40) NOT NULL,
	"work_key" varchar(100) NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"attempts" integer DEFAULT 0 NOT NULL,
	"prompt_version" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"cost" numeric(20, 10),
	"required_coverage" jsonb,
	"review_ratio" numeric(6, 5),
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	CONSTRAINT "generation_steps_work" UNIQUE("job_id","stage","work_key")
);
--> statement-breakpoint
CREATE TABLE "plugin_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_token_hash" varchar(64) NOT NULL,
	"account_id" uuid,
	"token_hash" varchar(64),
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_connections_request_token_hash_unique" UNIQUE("request_token_hash"),
	CONSTRAINT "plugin_connections_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "plugin_connections_status" CHECK ("plugin_connections"."status" IN ('pending', 'approved', 'revoked'))
);
--> statement-breakpoint
CREATE TABLE "project_memos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_templates" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"columns" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_templates_revision" CHECK ("project_templates"."revision" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "required_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"description" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"screen_description" text NOT NULL,
	"questions" jsonb NOT NULL,
	"draft" jsonb NOT NULL,
	"status" varchar(12) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_status" CHECK ("review_items"."status" IN ('pending', 'excluded', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "role_assignment_projects" (
	"assignment_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "role_assignment_projects_assignment_id_project_id_pk" PRIMARY KEY("assignment_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"scope" "assignment_scope" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission" "permission_key" NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"system_key" varchar(30),
	"fixed" boolean DEFAULT false NOT NULL,
	"requires_expiry" boolean DEFAULT false NOT NULL,
	"default_expiry_days" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name"),
	CONSTRAINT "roles_system_key_unique" UNIQUE("system_key"),
	CONSTRAINT "roles_expiry_days" CHECK (("roles"."default_expiry_days" IS NULL OR "roles"."default_expiry_days" > 0) AND (NOT "roles"."requires_expiry" OR "roles"."default_expiry_days" IS NOT NULL)),
	CONSTRAINT "roles_fixed_visitor" CHECK ("roles"."fixed" = ("roles"."system_key" IS NOT DISTINCT FROM 'link_visitor'))
);
--> statement-breakpoint
CREATE TABLE "screen_structure_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"screen_id" varchar(100) NOT NULL,
	"name" varchar(200) NOT NULL,
	"parent_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "screen_structure_screen_id" UNIQUE("project_id","screen_id"),
	CONSTRAINT "screen_structure_project_id" UNIQUE("project_id","id"),
	CONSTRAINT "screen_structure_not_self" CHECK ("screen_structure_items"."parent_id" IS NULL OR "screen_structure_items"."parent_id" <> "screen_structure_items"."id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "temp_frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"upload_id" uuid NOT NULL,
	"name" text NOT NULL,
	"screen_document" text NOT NULL,
	"image_storage_keys" jsonb NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "temp_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '1 hour' NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_case_values" (
	"test_set_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"column_id" uuid NOT NULL,
	"value" jsonb,
	CONSTRAINT "test_case_values_case_id_column_id_pk" PRIMARY KEY("case_id","column_id")
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_by" uuid,
	"author_name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_cases_set_id" UNIQUE("test_set_id","id")
);
--> statement-breakpoint
CREATE TABLE "test_set_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" "column_type" NOT NULL,
	"system_key" varchar(10),
	"description" text DEFAULT '' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "test_set_columns_system" UNIQUE("test_set_id","system_key"),
	CONSTRAINT "test_set_columns_set_id" UNIQUE("test_set_id","id"),
	CONSTRAINT "test_set_columns_system_type" CHECK ("test_set_columns"."system_key" IS NULL OR ("test_set_columns"."system_key" IN ('test_id', 'title') AND "test_set_columns"."type" = 'text'))
);
--> statement-breakpoint
CREATE TABLE "test_set_members" (
	"test_set_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"access" "access_level" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_set_members_test_set_id_account_id_pk" PRIMARY KEY("test_set_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "test_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"memo" text DEFAULT '' NOT NULL,
	"visibility" varchar(10) DEFAULT 'private' NOT NULL,
	"link_access" "access_level" DEFAULT 'view' NOT NULL,
	"link_token_hash" varchar(64),
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "test_sets_link_token_hash_unique" UNIQUE("link_token_hash"),
	CONSTRAINT "test_sets_visibility" CHECK ("test_sets"."visibility" IN ('private', 'public') AND ("test_sets"."visibility" <> 'public' OR "test_sets"."link_token_hash" IS NOT NULL)),
	CONSTRAINT "test_sets_version" CHECK ("test_sets"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "view_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"account_id" uuid,
	"visitor_session_id" uuid,
	"view" varchar(10) DEFAULT 'table' NOT NULL,
	"group_by_column_id" uuid,
	"column_widths" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_heights" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "view_preferences_account" UNIQUE("test_set_id","account_id"),
	CONSTRAINT "view_preferences_visitor" UNIQUE("test_set_id","visitor_session_id"),
	CONSTRAINT "view_preferences_actor" CHECK (num_nonnulls("view_preferences"."account_id", "view_preferences"."visitor_session_id") = 1),
	CONSTRAINT "view_preferences_view" CHECK ("view_preferences"."view" IN ('table', 'card'))
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"browser_token_hash" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "visitor_sessions_browser" UNIQUE("test_set_id","browser_token_hash"),
	CONSTRAINT "visitor_sessions_name" UNIQUE("test_set_id","name"),
	CONSTRAINT "visitor_sessions_set_id" UNIQUE("test_set_id","id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_affiliation_id_affiliations_id_fk" FOREIGN KEY ("affiliation_id") REFERENCES "public"."affiliations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_groups" ADD CONSTRAINT "feature_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_requested_by_accounts_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_upload_id_temp_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."temp_uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD CONSTRAINT "generation_steps_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_connections" ADD CONSTRAINT "plugin_connections_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memos" ADD CONSTRAINT "project_memos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_memos" ADD CONSTRAINT "project_memos_author_id_accounts_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_templates" ADD CONSTRAINT "project_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "required_cases" ADD CONSTRAINT "required_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment_projects" ADD CONSTRAINT "role_assignment_projects_assignment_id_role_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignment_projects" ADD CONSTRAINT "role_assignment_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_structure_items" ADD CONSTRAINT "screen_structure_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screen_structure_items" ADD CONSTRAINT "screen_structure_items_project_id_parent_id_screen_structure_items_project_id_id_fk" FOREIGN KEY ("project_id","parent_id") REFERENCES "public"."screen_structure_items"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temp_frames" ADD CONSTRAINT "temp_frames_upload_id_temp_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."temp_uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "temp_uploads" ADD CONSTRAINT "temp_uploads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_values" ADD CONSTRAINT "test_case_values_test_set_id_case_id_test_cases_test_set_id_id_fk" FOREIGN KEY ("test_set_id","case_id") REFERENCES "public"."test_cases"("test_set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_case_values" ADD CONSTRAINT "test_case_values_test_set_id_column_id_test_set_columns_test_set_id_id_fk" FOREIGN KEY ("test_set_id","column_id") REFERENCES "public"."test_set_columns"("test_set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_created_by_accounts_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_set_columns" ADD CONSTRAINT "test_set_columns_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_set_members" ADD CONSTRAINT "test_set_members_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_set_members" ADD CONSTRAINT "test_set_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_owner_id_accounts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_test_set_id_visitor_session_id_visitor_sessions_test_set_id_id_fk" FOREIGN KEY ("test_set_id","visitor_session_id") REFERENCES "public"."visitor_sessions"("test_set_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "view_preferences" ADD CONSTRAINT "view_preferences_test_set_id_group_by_column_id_test_set_columns_test_set_id_id_fk" FOREIGN KEY ("test_set_id","group_by_column_id") REFERENCES "public"."test_set_columns"("test_set_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_affiliation_idx" ON "accounts" USING btree ("affiliation_id");--> statement-breakpoint
CREATE INDEX "auth_tokens_account_idx" ON "auth_tokens" USING btree ("account_id","purpose");--> statement-breakpoint
CREATE INDEX "role_assignments_account_idx" ON "role_assignments" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "role_assignments_role_idx" ON "role_assignments" USING btree ("role_id");--> statement-breakpoint
CREATE INDEX "sessions_account_idx" ON "sessions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "temp_uploads_expiry_idx" ON "temp_uploads" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "test_sets_owner_idx" ON "test_sets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "test_sets_project_idx" ON "test_sets" USING btree ("project_id");