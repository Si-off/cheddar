ALTER TABLE "accounts" RENAME COLUMN "email" TO "login_id";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "accounts_email_unique" TO "accounts_login_id_unique";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_email_normalized";--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_login_id_normalized" CHECK ("accounts"."login_id" = lower(btrim("accounts"."login_id")));
