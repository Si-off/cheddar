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
  await database.pool.query("SELECT project_id FROM project_analysis LIMIT 0");
  await database.pool.query("SELECT id FROM files LIMIT 0");
  await database.pool.query(
    "SELECT finished_at, duration_ms FROM generation_jobs LIMIT 0",
  );
  await database.pool.query(
    "SELECT id, flow_job_id FROM ai_call_usage LIMIT 0",
  );
  await database.pool.query("SELECT provider FROM ai_provider_costs LIMIT 0");
  await database.pool.query("SELECT id FROM uploads LIMIT 0");
  await database.pool.query("SELECT id FROM upload_frames LIMIT 0");
  await database.pool.query("SELECT id FROM ia_items LIMIT 0");
  await database.pool.query("SELECT project_id FROM project_templates LIMIT 0");
  await database.pool.query("SELECT id FROM test_scenarios LIMIT 0");
  await database.pool.query("SELECT id FROM test_scenario_columns LIMIT 0");
  await database.pool.query(
    "SELECT column_id FROM test_scenario_column_views LIMIT 0",
  );
  await database.pool.query("SELECT id FROM test_cases LIMIT 0");
  await database.pool.query("SELECT case_id FROM test_case_values LIMIT 0");
  await database.pool.query(
    "SELECT case_id FROM test_case_frame_links LIMIT 0",
  );
  await database.pool.query("SELECT case_id FROM test_case_ia_links LIMIT 0");
}
