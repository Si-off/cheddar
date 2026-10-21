import { eq } from "drizzle-orm";
import { hashPassword } from "../auth/credentials";
import { AuthorizationService } from "../authorization/authorization.service";
import type { DatabaseService } from "../database/database.service";
import { accounts, roleAssignments, roles } from "../database/schema";
import { DEFAULT_AFFILIATION_ID, seedInitialData } from "../database/seed";

export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "Demo-Scenario-2026!";

// 전용 시연 DB의 최초 실행에만 계정을 만든다. 재시작 시 기존 데이터와 비밀번호를 보존한다.
export async function ensureDemoAccount(database: DatabaseService) {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  return new AuthorizationService(database).mutate(async (tx) => {
    if ((await tx.select({ id: accounts.id }).from(accounts).limit(1)).length)
      return false;
    await seedInitialData(tx);
    const [role] = await tx
      .select()
      .from(roles)
      .where(eq(roles.systemKey, "administrator"));
    if (!role) throw new Error("시연 계정의 관리자 역할을 찾지 못했습니다.");
    const [account] = await tx
      .insert(accounts)
      .values({
        email: DEMO_EMAIL,
        name: "시연 관리자",
        affiliationId: DEFAULT_AFFILIATION_ID,
        passwordHash,
        status: "active",
      })
      .returning();
    await tx.insert(roleAssignments).values({
      accountId: account.id,
      roleId: role.id,
      scope: "global",
    });
    return true;
  }, false);
}
