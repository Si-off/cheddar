import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { PoolClient } from "pg";
import {
  findPresetColumn,
  PRESET_COLUMNS,
  validateSetColumns,
  validateTemplate,
} from "../src/projects/template";
import { openTestDatabase } from "./database";

type StoredColumn = {
  id: string;
  name: string;
  type: string;
  presetKey: string | null;
  systemKey: string | null;
  enabled: boolean;
  description: string;
  options: string[];
  colors?: Record<string, string>;
};

const custom = (name: string, type = "text"): StoredColumn => ({
  id: randomUUID(),
  name,
  type,
  presetKey: null,
  systemKey: null,
  enabled: true,
  description: "직접 정한 작성 기준",
  options: type === "select" ? ["높음", "낮음"] : [],
  colors: type === "select" ? { 높음: "red", 낮음: "gray" } : {},
});
// 0007이 presetKey를 비운 뒤의 양식 모양. 이전 작성 기준과 사용자가 정한 순서를 그대로 둔다.
const legacy = (skip: string[] = []): StoredColumn[] => {
  const order = ["test_id", "title", "test_env", "test_case"];
  return [
    ...order.map((key) => findPresetColumn(key)),
    ...PRESET_COLUMNS.filter((c) => !order.includes(c.presetKey ?? "")),
  ]
    .filter((preset) => preset && !skip.includes(preset.presetKey ?? ""))
    .map((preset) => ({
      id: randomUUID(),
      name: preset?.name ?? "",
      type: preset?.type ?? "text",
      presetKey: null,
      systemKey: preset?.systemKey ?? null,
      enabled: true,
      description: "이전 작성 기준",
      options: [...(preset?.options ?? [])],
    }));
};
const valid = (columns: StoredColumn[]) =>
  assert.doesNotThrow(() => validateTemplate({ revision: 1, columns }));

test("0017은 사전 정의 열을 현재 정의로 맞추고 이전 양식과 세트의 같은 이름 열을 사전 정의 열로 되돌린다", async () => {
  const lease = await openTestDatabase();
  const client: PoolClient = await lease.database.pool.connect();
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  try {
    // 전용 스키마에서 실제 0000~0016을 실행하고 0017을 적용한다. 전체 작업을 롤백한다.
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrations = readMigrationFiles({ migrationsFolder: lease.folder });
    const run = async (index: number) => {
      for (const statement of migrations[index].sql)
        await client.query(statement.replaceAll('"public".', `"${schema}".`));
    };
    for (let i = 0; i < 17; i++) await run(i);
    const owner = randomUUID();
    await client.query(
      "INSERT INTO accounts (id,name,login_id,password_hash) VALUES ($1,'작성자','owner',$2)",
      [owner, "hash"],
    );
    const projects: Record<string, string> = {};
    const templates: Record<string, StoredColumn[]> = {
      legacy: [...legacy(), custom("우선순위", "select")],
      // 최근 양식은 사전 정의 열이 있지만 이전 작성 기준을 담고 있다. 켜고 끈 상태는 사용자 설정이다.
      recent: PRESET_COLUMNS.map((preset) => ({
        ...preset,
        id: randomUUID(),
        options: [...preset.options],
        colors: { ...preset.colors },
        description: "이전 작성 기준",
        enabled: preset.presetKey === "screen_id" ? false : preset.enabled,
      })),
      // 이름은 같지만 형식이 달라 되돌릴 수 없는 사용자 열이 있고, 비켜 줄 이름도 이미 쓰고 있다.
      collision: [
        ...legacy(["test_env"]),
        custom("테스트 환경 (사용자 열)"),
        custom("테스트 환경", "checkbox"),
      ],
      empty: [],
      // 사전 정의 열을 모두 더하면 열 제한(50개)을 넘는다.
      full: [
        ...legacy().filter((c) => c.systemKey),
        ...Array.from({ length: 48 }, (_, i) => custom(`사용자 열 ${i + 1}`)),
      ],
    };
    for (const [key, columns] of Object.entries(templates)) {
      projects[key] = randomUUID();
      await client.query(
        "INSERT INTO projects (id,name,created_by) VALUES ($1,$2,$3)",
        [projects[key], key, owner],
      );
      await client.query(
        "INSERT INTO project_templates (project_id,columns) VALUES ($1,$2)",
        [projects[key], JSON.stringify(columns)],
      );
    }
    const set = randomUUID();
    await client.query(
      "INSERT INTO test_sets (id,name,project_id,owner_id) VALUES ($1,'이전 세트',$2,$3)",
      [set, projects.legacy, owner],
    );
    for (const [position, column] of templates.legacy.entries())
      await client.query(
        "INSERT INTO test_set_columns (id,test_set_id,name,type,system_key,preset_key,description,options,colors,position) VALUES ($1,$2,$3,$4,$5,NULL,$6,$7,$8,$9)",
        [
          column.id,
          set,
          column.name,
          column.type,
          column.systemKey,
          column.description,
          JSON.stringify(column.options),
          JSON.stringify(column.colors ?? {}),
          position,
        ],
      );
    await run(17);

    const read = async () =>
      new Map(
        (
          await client.query<{
            project_id: string;
            columns: StoredColumn[];
            revision: number;
          }>("SELECT project_id,columns,revision FROM project_templates")
        ).rows.map((r) => [r.project_id, r]),
      );
    const after = await read();
    const migrated = after.get(projects.legacy);
    assert.ok(migrated);
    // 사용자가 정한 열 순서와 ID는 그대로이고 사전 정의 열이 모두 하나씩 있다.
    assert.deepEqual(
      migrated.columns.map((c) => c.id),
      templates.legacy.map((c) => c.id),
    );
    valid(migrated.columns);
    for (const column of migrated.columns.filter((c) => c.presetKey)) {
      const preset = findPresetColumn(column.presetKey ?? "");
      assert.equal(column.description, preset?.description);
      assert.deepEqual(column.colors, preset?.colors);
    }
    assert.deepEqual(migrated.columns.at(-1), templates.legacy.at(-1));
    assert.equal(migrated.revision, 2);

    const recent = after.get(projects.recent);
    assert.ok(recent);
    valid(recent.columns);
    assert.equal(
      recent.columns.find((c) => c.presetKey === "title")?.description,
      findPresetColumn("title")?.description,
    );
    assert.equal(
      recent.columns.find((c) => c.presetKey === "screen_id")?.enabled,
      false,
    );

    const collision = after.get(projects.collision);
    assert.ok(collision);
    valid(collision.columns);
    const kept = templates.collision.at(-1);
    assert.deepEqual(
      collision.columns.find((c) => c.id === kept?.id),
      { ...kept, name: "테스트 환경 (사용자 열 2)" },
    );
    assert.equal(collision.columns.at(-1)?.presetKey, "test_env");

    const empty = after.get(projects.empty);
    assert.ok(empty);
    valid(empty.columns);
    assert.deepEqual(
      empty.columns.map((c) => c.presetKey),
      PRESET_COLUMNS.map((c) => c.presetKey),
    );

    const full = after.get(projects.full);
    assert.deepEqual(full?.columns, templates.full);
    assert.equal(full?.revision, 1);

    const setColumns = (
      await client.query<{
        id: string;
        name: string;
        type: string;
        system_key: string | null;
        preset_key: string | null;
        description: string;
        options: string[];
        colors: Record<string, string>;
      }>(
        "SELECT id,name,type,system_key,preset_key,description,options,colors FROM test_set_columns WHERE test_set_id=$1 ORDER BY position",
        [set],
      )
    ).rows;
    assert.deepEqual(
      setColumns.map((c) => c.preset_key),
      migrated.columns.map((c) => c.presetKey),
    );
    assert.equal(
      setColumns.at(-1)?.description,
      templates.legacy.at(-1)?.description,
    );
    // 세트 열 검증을 통과해야 이후 열 편집과 케이스 생성이 막히지 않는다.
    assert.doesNotThrow(() =>
      validateSetColumns({
        revision: 1,
        columns: setColumns.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          systemKey: c.system_key,
          presetKey: c.preset_key,
          enabled: true,
          description: c.description,
          options: c.options,
          colors: c.colors,
        })),
      }),
    );

    // 다시 실행해도 바뀌는 것이 없다.
    await run(17);
    const again = await read();
    for (const [id, row] of after)
      assert.deepEqual(again.get(id), row, `${id} 양식이 다시 바뀌었습니다.`);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await lease.close();
  }
});
