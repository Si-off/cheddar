import { hashPassword } from "../auth/credentials";
import { AuthorizationService } from "../authorization/authorization.service";
import type { DatabaseService } from "../database/database.service";
import { accounts } from "../database/schema";

// 기존 시연 볼륨의 계정과 맞추기 위해 이메일 모양 아이디를 유지한다
export const DEMO_LOGIN_ID = "demo@example.com";
export const DEMO_PASSWORD = "Demo-Scenario-2026!";

// 전용 시연 DB의 최초 실행에만 계정을 만든다. 재시작 시 기존 데이터와 비밀번호를 보존한다.
export async function ensureDemoAccount(database: DatabaseService) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return new AuthorizationService(database).mutate(async (tx) => {
    if ((await tx.select({ id: accounts.id }).from(accounts).limit(1)).length)
      return false;
    await tx
      .insert(accounts)
      .values({
        loginId: DEMO_LOGIN_ID,
        name: "시연 관리자",
        role: "admin",
        passwordHash,
        status: "active",
      })
      .returning();
    return true;
  }, false);
}
