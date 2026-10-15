import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { DatabaseService } from "../src/database/database.service";
import { checkMigrations } from "../src/database/migrations";

/** A dedicated test DB lease; register only project UUIDs created by this test. */
export async function openTestDatabase() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(databaseUrl, "TEST_DATABASE_URL is required; no skipped DB tests.");
  const target = new URL(databaseUrl);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname), "/cheddar_stage1_test");
  assert.equal(decodeURIComponent(target.username), "cheddar_stage1");
  const runtime = new URL(process.env.DATABASE_URL ?? databaseUrl);
  assert.notEqual(
    decodeURIComponent(runtime.pathname),
    decodeURIComponent(target.pathname),
    "Runtime DB must differ from test DB.",
  );
  const storageRoot = await mkdtemp(
    join(await realpath(tmpdir()), "cheddar-api-test-"),
  );
  const config = {
    databaseUrl,
    storageRoot,
    port: 3101,
    corsOrigins: ["http://127.0.0.1:5173"],
  };
  const database = new DatabaseService(config);
  const projects: string[] = [];
  let lock: PoolClient | undefined;
  let locked = false,
    closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    try {
      if (lock && locked && projects.length) {
        // Child-first deletion, scoped only to this lease's project UUIDs.
        for (const table of ["test_case_frame_links", "test_case_ia_links"])
          await lock.query(
            `DELETE FROM ${table} WHERE project_id = ANY($1::uuid[])`,
            [projects],
          );
        await lock.query(
          "DELETE FROM test_case_values WHERE sheet_id IN (SELECT id FROM sheets WHERE project_id = ANY($1::uuid[]))",
          [projects],
        );
        await lock.query(
          "DELETE FROM sheet_column_views WHERE sheet_id IN (SELECT id FROM sheets WHERE project_id = ANY($1::uuid[]))",
          [projects],
        );
        for (const table of [
          "test_cases",
          "sheet_columns",
          "sheets",
          "ia_items",
          "project_templates",
          "upload_frames",
          "uploads",
          "files",
        ])
          await lock.query(
            `DELETE FROM ${table} WHERE project_id = ANY($1::uuid[])`,
            [projects],
          );
        await lock.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [
          projects,
        ]);
      }
    } finally {
      try {
        if (lock && locked)
          await lock.query("SELECT pg_advisory_unlock(31015432)");
      } finally {
        lock?.release();
        await database.onModuleDestroy();
        await rm(storageRoot, { recursive: true, force: true });
      }
    }
  };
  try {
    lock = await database.pool.connect();
    const identity = await lock.query<{ owner: string; superuser: boolean }>(
      "SELECT pg_get_userbyid(datdba) owner, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser FROM pg_database WHERE datname=current_database()",
    );
    assert.equal(identity.rows[0].owner, "cheddar_stage1");
    assert.equal(identity.rows[0].superuser, false);
    locked = (
      await lock.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(31015432) locked",
      )
    ).rows[0].locked;
    assert.equal(
      locked,
      true,
      "Another test process owns this DB; coordinate a slot.",
    );
    const folder = resolve(
      process.env.API_SOURCE_ROOT ?? process.cwd(),
      "migrations",
    );
    await migrate(database.db, { migrationsFolder: folder });
    await migrate(database.db, { migrationsFolder: folder });
    await checkMigrations(database, folder);
    return { config, database, lock, projects, folder, close };
  } catch (error) {
    await close();
    throw error;
  }
}
