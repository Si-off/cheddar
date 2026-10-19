ALTER TABLE "review_items" DROP CONSTRAINT "review_items_status";--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "added_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "review_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "review_item_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD COLUMN "cache_read_tokens" integer;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD COLUMN "cache_creation_tokens" integer;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD COLUMN "failure_code" text;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD COLUMN "merged_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD COLUMN "repair_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_items" ADD COLUMN "reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_jobs_active_set" ON "generation_jobs" USING btree ("test_set_id") WHERE "generation_jobs"."status" IN ('pending', 'running');--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_status" CHECK ("review_items"."status" IN ('pending', 'rewriting', 'excluded', 'resolved'));