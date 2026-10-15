CREATE TABLE "upload_frames" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"figma_file_key" varchar(200) NOT NULL,
	"figma_node_id" varchar(200) NOT NULL,
	"name" varchar(255) NOT NULL,
	"width" double precision NOT NULL,
	"height" double precision NOT NULL,
	"image_file_id" uuid NOT NULL,
	"data_file_id" uuid NOT NULL,
	CONSTRAINT "upload_frames_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "upload_frames_position_unique" UNIQUE("upload_id","position"),
	CONSTRAINT "upload_frames_source_unique" UNIQUE("upload_id","figma_file_key","figma_node_id"),
	CONSTRAINT "upload_frames_position_check" CHECK ("upload_frames"."position" >= 0),
	CONSTRAINT "upload_frames_dimensions_check" CHECK ("upload_frames"."width" >= 0.01 AND "upload_frames"."width" < 'Infinity'::float8 AND "upload_frames"."height" >= 0.01 AND "upload_frames"."height" < 'Infinity'::float8),
	CONSTRAINT "upload_frames_names_check" CHECK (char_length("upload_frames"."figma_file_key") > 0 AND char_length("upload_frames"."figma_node_id") > 0 AND char_length("upload_frames"."name") > 0)
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"client_request_id" uuid NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_project_id_unique" UNIQUE("project_id","id"),
	CONSTRAINT "uploads_project_request_unique" UNIQUE("project_id","client_request_id"),
	CONSTRAINT "uploads_name_check" CHECK (char_length(btrim("uploads"."name")) > 0 AND "uploads"."name" = btrim("uploads"."name")),
	CONSTRAINT "uploads_request_hash_check" CHECK ("uploads"."request_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "upload_frames" ADD CONSTRAINT "upload_frames_upload_fk" FOREIGN KEY ("project_id","upload_id") REFERENCES "public"."uploads"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_frames" ADD CONSTRAINT "upload_frames_image_fk" FOREIGN KEY ("project_id","image_file_id") REFERENCES "public"."files"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_frames" ADD CONSTRAINT "upload_frames_data_fk" FOREIGN KEY ("project_id","data_file_id") REFERENCES "public"."files"("project_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "upload_frames_image_idx" ON "upload_frames" USING btree ("project_id","image_file_id");--> statement-breakpoint
CREATE INDEX "upload_frames_data_idx" ON "upload_frames" USING btree ("project_id","data_file_id");--> statement-breakpoint
CREATE INDEX "uploads_project_created_idx" ON "uploads" USING btree ("project_id","created_at","id");