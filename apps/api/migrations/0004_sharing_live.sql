-- 기존 해시에서는 원문을 복원할 수 없다. 기존 공개 링크는 비공개로 전환해 무효화한다.
ALTER TABLE "test_sets" DROP CONSTRAINT "test_sets_visibility";
--> statement-breakpoint
DELETE FROM "visitor_sessions" WHERE "test_set_id" IN (SELECT "id" FROM "test_sets" WHERE "link_token_hash" IS NOT NULL OR "visibility" = 'public');
--> statement-breakpoint
UPDATE "test_sets" SET "visibility" = 'private' WHERE "visibility" = 'public';
--> statement-breakpoint
ALTER TABLE "test_sets" DROP COLUMN "link_token_hash";
--> statement-breakpoint
ALTER TABLE "test_sets" ADD COLUMN "link_token" varchar(43);
--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_link_token_unique" UNIQUE("link_token");
--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_visibility" CHECK ("visibility" IN ('private', 'public') AND ("visibility" <> 'public' OR "link_token" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "test_sets" ADD CONSTRAINT "test_sets_link_token" CHECK ("link_token" IS NULL OR "link_token" ~ '^[A-Za-z0-9_-]{43}$');
