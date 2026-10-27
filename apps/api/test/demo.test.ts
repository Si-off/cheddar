import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { AuthService } from "../src/auth/auth.service";
import { hashPassword, verifyPassword } from "../src/auth/credentials";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { accounts } from "../src/database/schema";
import {
  DEMO_LOGIN_ID,
  DEMO_PASSWORD,
  ensureDemoAccount,
} from "../src/demo/account";
import { demoEnvironment } from "../src/demo/config";
import { readAiConfig } from "../src/generation/model-config";
import { openTestDatabase } from "./database";

test("시연 설정은 원본 DB와 경로, fake 및 관리자 키를 사용하지 않는다", () => {
  const source = {
    DATABASE_URL: "postgresql://private:secret@production/database",
    FILE_STORAGE_ROOT: "/Users/original/files",
    AI_PROVIDER: "fake",
    OPENAI_API_KEY: "test-key",
    OPENAI_ADMIN_KEY: "must-not-copy",
  };
  const env = demoEnvironment(source);
  assert.equal(new URL(env.DATABASE_URL as string).hostname, "db");
  assert.equal(env.FILE_STORAGE_ROOT, "/data/files");
  assert.equal(env.OPENAI_ADMIN_KEY, undefined);
  assert.equal(env.OPENAI_API_KEY, "test-key");
  assert.equal(readAiConfig(env).fake, false);
  assert.equal(source.AI_PROVIDER, "fake");
  assert.throws(() => demoEnvironment({}), /OPENAI_API_KEY/);
});

test("시연 계정은 첫 실행에 로그인 가능하고 재실행은 변경한 계정을 보존한다", async () => {
  const lease = await openTestDatabase();
  try {
    assert.equal(await ensureDemoAccount(lease.database), true);
    const [account] = await lease.database.db
      .select()
      .from(accounts)
      .where(eq(accounts.loginId, DEMO_LOGIN_ID));
    lease.accountIds.push(account.id);
    const authorization = new AuthorizationService(lease.database);
    const auth = new AuthService(
      lease.database,
      new AccountsService(lease.database, authorization),
      authorization,
    );
    assert.ok((await auth.login(DEMO_LOGIN_ID, DEMO_PASSWORD)).token);
    assert.equal((await authorization.active(account.id)).role, "admin");
    const changed = await hashPassword("changed-demo-password");
    await lease.database.db
      .update(accounts)
      .set({ name: "변경한 이름", passwordHash: changed })
      .where(eq(accounts.id, account.id));
    assert.equal(await ensureDemoAccount(lease.database), false);
    const [preserved] = await lease.database.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, account.id));
    assert.equal(preserved.name, "변경한 이름");
    assert.ok(
      await verifyPassword("changed-demo-password", preserved.passwordHash),
    );
  } finally {
    await lease.close();
  }
});
