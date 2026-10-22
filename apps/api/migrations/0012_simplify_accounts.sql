-- 기존 관리자 시스템 역할 또는 계정 관리 권한을 전체 범위로 가진 계정을 관리자 등급으로 옮긴다.
CREATE TYPE "public"."account_role" AS ENUM('admin', 'member');
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "role" "account_role" DEFAULT 'member' NOT NULL;
--> statement-breakpoint
UPDATE "accounts" AS a SET "role" = 'admin'
WHERE EXISTS (
  SELECT 1 FROM "role_assignments" ra JOIN "roles" r ON r.id = ra.role_id
  WHERE ra.account_id = a.id AND ra.scope = 'global'
    AND (
      r.system_key = 'administrator'
      OR EXISTS (
        SELECT 1 FROM "role_permissions" rp
        WHERE rp.role_id = r.id AND rp.permission = 'account.manage'
      )
    )
);
--> statement-breakpoint
-- 계정이 있는데 활성 관리자가 없으면 계정 관리와 비밀번호 복구가 막히므로 이전하지 않는다.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts")
    AND NOT EXISTS (
      SELECT 1 FROM "accounts"
      WHERE "role" = 'admin' AND "status" = 'active' AND "password_hash" IS NOT NULL
    )
  THEN
    RAISE EXCEPTION '0012: 이전 후 활성 관리자가 없습니다. 계정 관리 권한을 가진 활성 계정을 먼저 준비하세요.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_active_password";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" TYPE text USING "status"::text;
--> statement-breakpoint
UPDATE "accounts" SET "status" = CASE WHEN "password_hash" IS NULL THEN 'inactive' ELSE 'active' END WHERE "status" = 'invited';
--> statement-breakpoint
DROP TYPE "public"."account_status";
--> statement-breakpoint
CREATE TYPE "public"."account_status" AS ENUM('active', 'inactive');
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" TYPE "account_status" USING "status"::"account_status";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" SET DEFAULT 'active';
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_active_password" CHECK ("accounts"."status" <> 'active' OR "accounts"."password_hash" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN "affiliation_id", DROP COLUMN "expires_at";
--> statement-breakpoint
DROP TABLE "role_assignment_projects";
--> statement-breakpoint
DROP TABLE "role_assignments";
--> statement-breakpoint
DROP TABLE "role_permissions";
--> statement-breakpoint
DROP TABLE "roles";
--> statement-breakpoint
DROP TABLE "affiliations";
--> statement-breakpoint
DROP TABLE "auth_tokens";
--> statement-breakpoint
DROP TABLE "test_set_members";
--> statement-breakpoint
DROP TYPE "public"."permission_key";
--> statement-breakpoint
DROP TYPE "public"."assignment_scope";
--> statement-breakpoint
-- 비밀번호 없는 초대 계정의 기존 세션과 플러그인 토큰도 사용할 수 없게 한다.
DELETE FROM "sessions" USING "accounts" WHERE "sessions"."account_id" = "accounts"."id" AND "accounts"."status" = 'inactive';
--> statement-breakpoint
UPDATE "plugin_connections" SET "status" = 'revoked', "revoked_at" = now(), "token_hash" = NULL
FROM "accounts" WHERE "plugin_connections"."account_id" = "accounts"."id" AND "accounts"."status" = 'inactive';
