import "reflect-metadata";
import { parseArgs } from "node:util";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" } },
    strict: true,
  });
  if (!values.email || !values.name)
    throw new Error("--email과 --name을 입력해주세요.");
  const database = new DatabaseService(readEnv());
  try {
    const authorization = new AuthorizationService(database);
    const service = new AccountsService(database, authorization);
    const result = await createFirstAdministrator(
      authorization,
      service,
      values.email,
      values.name,
    );
    process.stdout.write(
      `첫 관리자: ${result.account.name} <${result.account.email}>\n초대 링크용 토큰: ${result.token}\n유효기간: ${result.expiresAt}\n웹 초대 화면의 token 값으로 전달해주세요.\n`,
    );
  } finally {
    await database.onModuleDestroy();
  }
}
main().catch((error) => {
  process.stderr.write(
    error instanceof Error &&
      (error.message.startsWith("--email") ||
        error.message === "첫 관리자 계정이 이미 만들어졌습니다.")
      ? `${error.message}\n`
      : "첫 관리자 계정을 만들지 못했습니다. DB 마이그레이션과 입력을 확인해주세요.\n",
  );
  process.exitCode = 1;
});
