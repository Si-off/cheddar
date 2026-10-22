import "reflect-metadata";
import { resolve } from "node:path";
import { createApp } from "./common/application";
import { readEnv } from "./config/env";
import { DatabaseService } from "./database/database.service";
import { checkMigrations } from "./database/migrations";
import { LocalStorage } from "./storage/local-storage";

async function main() {
  const config = readEnv();
  const app = await createApp(config, resolve(process.cwd(), "migrations"));
  try {
    await app.get(LocalStorage).initialize();
    const database = app.get(DatabaseService);
    await checkMigrations(database, resolve(process.cwd(), "migrations"));
    app.enableShutdownHooks();
    await app.listen(config.port, config.host);
    process.stdout.write(
      `Cheddar API listening on http://${config.host}:${config.port}\n`,
    );
  } catch {
    await app.close();
    throw new Error(
      "API startup failed. Check database migrations and storage access.",
    );
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "API startup failed."}\n`,
  );
  process.exitCode = 1;
});
