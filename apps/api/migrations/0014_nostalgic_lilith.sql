CREATE TABLE "cell_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_set_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" varchar(20) NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"account_id" uuid,
	"visitor_session_id" uuid,
	CONSTRAINT "cell_images_storage_key_unique" UNIQUE("storage_key"),
	CONSTRAINT "cell_images_actor" CHECK (num_nonnulls("cell_images"."account_id", "cell_images"."visitor_session_id") = 1),
	CONSTRAINT "cell_images_dimensions" CHECK ("cell_images"."width" > 0 AND "cell_images"."height" > 0 AND "cell_images"."byte_size" > 0 AND "cell_images"."byte_size" <= 10485760),
	CONSTRAINT "cell_images_content_type" CHECK ("cell_images"."content_type" IN ('image/png', 'image/jpeg', 'image/gif', 'image/webp'))
);
--> statement-breakpoint
ALTER TABLE "test_set_columns" ADD COLUMN "colors" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "cell_images" ADD CONSTRAINT "cell_images_test_set_id_test_sets_id_fk" FOREIGN KEY ("test_set_id") REFERENCES "public"."test_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cell_images" ADD CONSTRAINT "cell_images_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cell_images_set_idx" ON "cell_images" USING btree ("test_set_id");
--> statement-breakpoint
UPDATE test_set_columns SET colors = CASE preset_key WHEN 'qa_result' THEN '{"Pass":"green","Fail":"red","Deferred":"yellow","N/A":"gray","-":"gray","추가 요청":"yellow"}'::jsonb WHEN 'dev_status' THEN '{"완료":"green","수정중":"blue","수정 완료":"green","보류":"yellow","기타":"gray","-":"gray"}'::jsonb WHEN 'user_role' THEN '{"사용자":"gray","관리자":"gray"}'::jsonb ELSE '{}'::jsonb END;
--> statement-breakpoint
UPDATE project_templates SET columns = (SELECT jsonb_agg(c || jsonb_build_object('colors', CASE c->>'presetKey' WHEN 'qa_result' THEN '{"Pass":"green","Fail":"red","Deferred":"yellow","N/A":"gray","-":"gray","추가 요청":"yellow"}'::jsonb WHEN 'dev_status' THEN '{"완료":"green","수정중":"blue","수정 완료":"green","보류":"yellow","기타":"gray","-":"gray"}'::jsonb WHEN 'user_role' THEN '{"사용자":"gray","관리자":"gray"}'::jsonb ELSE coalesce(c->'colors', '{}'::jsonb) END) ORDER BY ord) FROM jsonb_array_elements(columns) WITH ORDINALITY AS entry(c, ord));
