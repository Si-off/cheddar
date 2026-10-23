import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "../src/common/application";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";
import { ensureDemoAccount } from "../src/demo/account";
import { demoEnvironment } from "../src/demo/config";
import { LocalStorage } from "../src/storage/local-storage";

async function main() {
  if (process.env.CHEDDAR_DEMO !== "true")
    throw new Error("시연 실행은 Docker Compose로 시작하세요.");
  const env = demoEnvironment(
    parseEnv(await readFile("/run/cheddar/source.env", "utf8")),
  );
  // AI 제공자는 process.env에서 키를 읽는다. 전달 파일의 나머지 값은 복사하지 않는다.
  Object.assign(process.env, env);
  const config = readEnv(env);
  const folder = resolve(process.cwd(), "migrations");
  const database = new DatabaseService(config);
  try {
    await migrate(database.db, { migrationsFolder: folder });
    await ensureDemoAccount(database);
  } finally {
    await database.onModuleDestroy();
  }
  const app = await createApp(config, folder);
  try {
    await app.get(LocalStorage).initialize();
    app.enableShutdownHooks();
    await app.listen(config.port, "0.0.0.0");
    process.stdout.write(
      "시연 API 준비 완료. 웹 주소: http://127.0.0.1:5173\n",
    );
  } catch (error) {
    await app.close();
    throw error;
  }
}
main().catch(() => {
  process.stderr.write(
    "시연 준비에 실패했습니다. 전달받은 apps/api/.env.local과 DB 실행 상태를 확인하세요. 기존 데이터는 초기화하지 않았습니다.\n",
  );
  process.exitCode = 1;
});
