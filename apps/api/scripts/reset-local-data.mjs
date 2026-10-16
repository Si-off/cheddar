import assert from "node:assert/strict";
import pg from "pg";

// Explicit local-only reset. Never imported by the API or migration runner.
const [target, confirmation] = process.argv.slice(2);
assert.ok(target === "runtime" || target === "test", "Choose runtime or test.");
assert.equal(
  confirmation,
  "--confirm-reset",
  "Pass --confirm-reset explicitly.",
);
const value =
  process.env[target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL"];
assert.ok(value, "The selected database URL is required.");
const url = new URL(value);
const expected = target === "test" ? "cheddar_stage1_test" : "cheddar_stage1";
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
assert.equal(decodeURIComponent(url.pathname), `/${expected}`);
assert.equal(decodeURIComponent(url.username), "cheddar_stage1");
const client = new pg.Client({
  connectionString: value,
  statement_timeout: 10000,
});
try {
  await client.connect();
  const identity = (
    await client.query(
      "SELECT pg_get_userbyid(datdba) owner, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser FROM pg_database WHERE datname=current_database()",
    )
  ).rows[0];
  assert.equal(identity.owner, "cheddar_stage1");
  assert.equal(identity.superuser, false);
  assert.equal(
    (await client.query("SELECT pg_try_advisory_lock(31015432) locked")).rows[0]
      .locked,
    true,
    "Another test/reset process owns this DB.",
  );
  await client.query("BEGIN");
  // Fixed allowlist and child-first order, supporting either side of the rename.
  const tables = [
    "test_case_frame_links",
    "test_case_ia_links",
    "test_case_values",
    "sheet_column_views",
    "test_scenario_column_views",
    "generation_jobs",
    "project_evidence",
    "project_analysis",
    "test_cases",
    "sheet_columns",
    "test_scenario_columns",
    "sheets",
    "test_scenarios",
    "ia_items",
    "project_templates",
    "upload_frames",
    "uploads",
    "files",
    "projects",
  ];
  const existing = (
    await client.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public'",
    )
  ).rows.map((r) => r.tablename);
  assert.ok(
    existing.every((table) => tables.includes(table)),
    "This DB contains another schema or branch's tables. Use a dedicated Cheddar environment instead of resetting it.",
  );
  if (existing.length) {
    await client.query(
      `LOCK TABLE ${existing.map((t) => `"${t}"`).join(", ")} IN ACCESS EXCLUSIVE MODE`,
    );
    for (const table of tables.filter((t) => existing.includes(t))) {
      // Parent references use ON DELETE RESTRICT; detach the IA tree first.
      if (table === "ia_items")
        await client.query('UPDATE "ia_items" SET parent_id = NULL');
      await client.query(`DELETE FROM "${table}"`);
    }
  }
  await client.query("COMMIT");
  console.log(
    `Reset ${expected}: ${existing.length} business tables. Migration history and stored file bytes retained.`,
  );
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(
    error instanceof assert.AssertionError
      ? error.message
      : "Local reset failed; transaction rolled back.",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
