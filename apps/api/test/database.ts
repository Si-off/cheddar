import assert from "node:assert/strict";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { PoolClient } from "pg";
import { DatabaseService } from "../src/database/database.service";
import { checkMigrations } from "../src/database/migrations";

export async function openTestDatabase() {
  const databaseUrl = process.env.TEST_DATABASE_URL;
  assert.ok(
    databaseUrl,
    "TEST_DATABASE_URL이 필요합니다. 실제 PostgreSQL 검증을 건너뛰지 않습니다.",
  );
  const target = new URL(databaseUrl);
  assert.ok(["postgres:", "postgresql:"].includes(target.protocol));
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname), "/cheddar_stage1_test");
  assert.equal(decodeURIComponent(target.username), "cheddar_stage1");
  if (process.env.DATABASE_URL) {
    const runtime = new URL(process.env.DATABASE_URL);
    assert.notEqual(
      decodeURIComponent(runtime.pathname),
      decodeURIComponent(target.pathname),
      "실행 DB와 테스트 DB가 달라야 합니다.",
    );
  }
  const storageRoot = await mkdtemp(
    join(await realpath(tmpdir()), "cheddar-foundation-tests-"),
  );
  const config = {
    databaseUrl,
    storageRoot,
    port: 3101,
    corsOrigins: ["http://127.0.0.1:5173"],
    production: false,
  };
  const database = new DatabaseService(config);
  const accountIds: string[] = [],
    roleIds: string[] = [],
    affiliationIds: string[] = [];
  let lock: PoolClient | undefined;
  let locked = false;
  const close = async () => {
    try {
      if (lock && locked && accountIds.length) {
        // Only this test's UUIDs; no TRUNCATE, DROP or global data reset.
        await lock.query(
          "DELETE FROM test_sets WHERE owner_id = ANY($1::uuid[])",
          [accountIds],
        );
        await lock.query(
          "DELETE FROM projects WHERE created_by = ANY($1::uuid[])",
          [accountIds],
        );
        await lock.query("DELETE FROM accounts WHERE id = ANY($1::uuid[])", [
          accountIds,
        ]);
      }
      if (lock && locked && roleIds.length)
        await lock.query("DELETE FROM roles WHERE id = ANY($1::uuid[])", [
          roleIds,
        ]);
      if (lock && locked && affiliationIds.length)
        await lock.query(
          "DELETE FROM affiliations WHERE id = ANY($1::uuid[])",
          [affiliationIds],
        );
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
    assert.ok(locked, "다른 테스트가 이 DB를 사용 중입니다.");
    const folder = resolve(
      process.env.API_SOURCE_ROOT ?? process.cwd(),
      "migrations",
    );
    const history = await lock.query<{ exists: string | null }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') AS exists",
    );
    if (history.rows[0].exists) {
      const applied = await lock.query<{ hash: string }>(
        "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at, id",
      );
      const expected = readMigrationFiles({ migrationsFolder: folder });
      assert.ok(
        applied.rows.length === 0 ||
          (applied.rows.length === expected.length &&
            applied.rows.every((r, i) => r.hash === expected[i].hash)),
        "구형 마이그레이션 DB입니다. 새 기준 전용 테스트 DB를 준비해주세요.",
      );
    }
    await migrate(database.db, { migrationsFolder: folder });
    await migrate(database.db, { migrationsFolder: folder });
    await checkMigrations(database, folder);
    assert.equal(
      (await lock.query("SELECT id FROM accounts LIMIT 1")).rows.length,
      0,
      "첫 관리자 테스트용 DB에 다른 계정이 있습니다. 데이터를 지우지 않습니다.",
    );
    return {
      config,
      database,
      folder,
      accountIds,
      roleIds,
      affiliationIds,
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
