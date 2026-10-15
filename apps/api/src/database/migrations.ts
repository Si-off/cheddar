import { readMigrationFiles } from "drizzle-orm/migrator";
import type { DatabaseService } from "./database.service";

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
  await database.pool.query("SELECT id FROM projects LIMIT 0");
  await database.pool.query("SELECT id FROM files LIMIT 0");
  await database.pool.query("SELECT id FROM uploads LIMIT 0");
  await database.pool.query("SELECT id FROM upload_frames LIMIT 0");
}
