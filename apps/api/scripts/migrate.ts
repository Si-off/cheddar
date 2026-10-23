import "reflect-metadata";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";

async function main() {
  const database = new DatabaseService(readEnv());
  try {
    await migrate(database.db, {
      migrationsFolder: resolve(process.cwd(), "migrations"),
    });
    process.stdout.write("Migrations applied.\n");
  } finally {
    await database.onModuleDestroy();
  }
}
main().catch(() => {
  process.stderr.write("Migration failed. Database contents were not reset.\n");
  process.exitCode = 1;
});
