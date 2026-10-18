import { getTableName, is, Table } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { DatabaseService } from "./database.service";
import * as schema from "./schema";
export async function checkMigrations(
  database: DatabaseService,
  folder: string,
) {
  const expected = readMigrationFiles({ migrationsFolder: folder });
  const applied = await database.pool.query<{ hash: string }>(
    "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, id",
  );
  if (
    !expected.length ||
    expected.length !== applied.rows.length ||
    expected.some((m, i) => m.hash !== applied.rows[i].hash)
  )
    throw new Error("Migration history differs.");
  // Only names exported from the local Drizzle schema enter this SQL.
  for (const table of Object.values(schema)) {
    if (is(table, Table))
      await database.pool.query(
        `SELECT 1 FROM "${getTableName(table)}" LIMIT 0`,
      );
  }
}
