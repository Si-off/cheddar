CREATE TABLE "files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"media_type" varchar(100),
	"byte_size" bigint,
	"sha256" varchar(64),
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "files_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "files_status_check" CHECK ("files"."status" IN ('pending', 'ready', 'failed')),
	CONSTRAINT "files_metadata_check" CHECK ("files"."status" <> 'ready' OR ("files"."media_type" IS NOT NULL AND "files"."media_type" IN ('image/png','image/jpeg','image/webp','application/json') AND "files"."byte_size" IS NOT NULL AND "files"."byte_size" > 0 AND "files"."sha256" IS NOT NULL AND "files"."sha256" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(2000),
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_check" CHECK (char_length(btrim("projects"."name")) > 0 AND "projects"."name" = btrim("projects"."name")),
	CONSTRAINT "projects_revision_check" CHECK ("projects"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_project_created_idx" ON "files" USING btree ("project_id","created_at","id");--> statement-breakpoint
CREATE INDEX "projects_created_idx" ON "projects" USING btree ("created_at","id");