import "reflect-metadata";
import { parseArgs } from "node:util";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";

async function main() {
  const { values } = parseArgs({
    options: { "login-id": { type: "string" }, name: { type: "string" } },
    strict: true,
  });
  const loginId = values["login-id"];
  if (!loginId || !values.name)
    throw new Error("--login-id와 --name을 입력해주세요.");
  const database = new DatabaseService(readEnv());
  try {
    const authorization = new AuthorizationService(database);
    const service = new AccountsService(database, authorization);
    const result = await createFirstAdministrator(
      authorization,
      service,
      loginId,
      values.name,
    );
    process.stdout.write(
      `첫 관리자: ${result.account.name} (${result.account.loginId})\n임시 비밀번호: ${result.password}\n로그인 후 내 비밀번호를 바꿔주세요.\n`,
    );
  } finally {
    await database.onModuleDestroy();
  }
}
main().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      (error.message.startsWith("--login-id") ||
        error.message === "첫 관리자 계정이 이미 만들어졌습니다.")
      ? `${error.message}\n`
      : "첫 관리자 계정을 만들지 못했습니다. DB 마이그레이션과 입력을 확인해주세요.\n",
  );
  process.exitCode = 1;
});
