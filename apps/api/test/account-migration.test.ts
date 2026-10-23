import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { openTestDatabase } from "./database";

test("0012는 이전 역할·상태 데이터를 옮기고 이전 테이블·컬럼을 제거한다", async () => {
  const lease = await openTestDatabase();
  const client = await lease.database.pool.connect();
  const schema = `migration_${randomUUID().replaceAll("-", "")}`;
  try {
    // 전용 스키마에서 실제 0000~0011을 실행하고 0012를 적용한다. 전체 작업을 롤백한다.
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrations = readMigrationFiles({ migrationsFolder: lease.folder });
    const run = async (index: number) => {
      for (const statement of migrations[index].sql)
        await client.query(statement.replaceAll('"public".', `"${schema}".`));
    };
    for (let i = 0; i < 12; i++) await run(i);
    const affiliation = randomUUID(),
      administrator = randomUUID(),
      custom = randomUUID();
    const ids = Array.from({ length: 7 }, () => randomUUID());
    await client.query(
      "INSERT INTO affiliations (id,name) VALUES ($1,'기존 소속')",
      [affiliation],
    );
    await client.query(
      "INSERT INTO roles (id,name,system_key) VALUES ($1,'관리자','administrator'),($2,'계정 관리자',NULL)",
      [administrator, custom],
    );
    await client.query(
      "INSERT INTO role_permissions (role_id,permission) VALUES ($1,'role.manage')",
      [custom],
    );
    for (const [index, id] of ids.entries())
      await client.query(
        "INSERT INTO accounts (id,name,login_id,affiliation_id,status,password_hash,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
        [
          id,
          `이전 계정 ${index}`,
          `old.${index}`,
          affiliation,
          index === 4 || index === 6
            ? "invited"
            : index === 3
              ? "inactive"
              : "active",
          index === 4 ? null : "legacy-hash",
          index === 5 ? new Date(0) : null,
        ],
      );
    for (const [index, scope, role] of [
      [0, "global", administrator],
      [1, "projects", administrator],
      [2, "global", custom],
      [3, "global", administrator],
      [4, "global", administrator],
    ] as const)
      await client.query(
        "INSERT INTO role_assignments (account_id,role_id,scope) VALUES ($1,$2,$3)",
        [ids[index], role, scope],
      );
    await client.query(
      "INSERT INTO auth_tokens (account_id,purpose,token_hash,expires_at) VALUES ($1,'invite',$2,now()+interval '1 day')",
      [ids[4], "a".repeat(64)],
    );
    const project = randomUUID(),
      set = randomUUID();
    await client.query(
      "INSERT INTO projects (id,name,created_by) VALUES ($1,'기존 프로젝트',$2)",
      [project, ids[0]],
    );
    await client.query(
      "INSERT INTO test_sets (id,name,project_id,owner_id,visibility,link_token,link_access) VALUES ($1,'기존 세트',$2,$3,'public',$4,'edit')",
      [set, project, ids[1], "b".repeat(43)],
    );
    await client.query(
      "INSERT INTO test_set_members (test_set_id,account_id,access) VALUES ($1,$2,'view')",
      [set, ids[2]],
    );
    await client.query(
      "INSERT INTO sessions (account_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '1 day')",
      [ids[0], "c".repeat(64)],
    );
    await run(12);
    const migrated = await client.query<{
      id: string;
      role: string;
      status: string;
      password_hash: string | null;
    }>("SELECT id,role,status,password_hash FROM accounts");
    const byId = new Map(migrated.rows.map((r) => [r.id, r]));
    assert.deepEqual(
      ids.map((id) => byId.get(id)?.role),
      ["admin", "member", "member", "admin", "admin", "member", "member"],
    );
    assert.deepEqual(
      ids.map((id) => byId.get(id)?.status),
      [
        "active",
        "active",
        "active",
        "inactive",
        "inactive",
        "active",
        "active",
      ],
    );
    assert.equal(byId.get(ids[0])?.password_hash, "legacy-hash");
    assert.equal(byId.get(ids[4])?.password_hash, null);
    const preserved = (
      await client.query(
        "SELECT owner_id,visibility,link_token,link_access FROM test_sets WHERE id=$1",
        [set],
      )
    ).rows[0];
    assert.deepEqual(preserved, {
      owner_id: ids[1],
      visibility: "public",
      link_token: "b".repeat(43),
      link_access: "edit",
    });
    assert.equal(
      (await client.query("SELECT count(*)::int AS n FROM sessions")).rows[0].n,
      1,
    );
    for (const table of [
      "roles",
      "role_permissions",
      "role_assignments",
      "role_assignment_projects",
      "affiliations",
      "auth_tokens",
      "test_set_members",
    ])
      assert.equal(
        (
          await client.query("SELECT to_regclass($1) AS name", [
            `${schema}.${table}`,
          ])
        ).rows[0].name,
        null,
        table,
      );
    const columns = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='accounts'",
      [schema],
    );
    assert.deepEqual(
      columns.rows.map((r) => r.column_name).sort(),
      [
        "id",
        "name",
        "login_id",
        "password_hash",
        "role",
        "status",
        "created_at",
        "updated_at",
      ].sort(),
    );
    await assert.rejects(
      client.query(
        "INSERT INTO accounts (name,login_id,status) VALUES ('비밀번호 없음','no-password','active')",
      ),
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await lease.close();
  }
});

test("0012는 계정 관리 권한을 전체 범위로 가진 사용자 정의 역할도 관리자로 옮기고, 활성 관리자가 남지 않으면 중단한다", async () => {
  const lease = await openTestDatabase();
  const client = await lease.database.pool.connect();
  const migrations = readMigrationFiles({ migrationsFolder: lease.folder });
  // 각 시나리오를 전용 스키마에서 0000~0011까지 만든 뒤 0012를 적용하고 롤백한다.
  const scenario = async (
    seed: (role: string, affiliation: string) => Promise<void>,
  ) => {
    const schema = `migration_${randomUUID().replaceAll("-", "")}`;
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const run = async (index: number) => {
      for (const statement of migrations[index].sql)
        await client.query(statement.replaceAll('"public".', `"${schema}".`));
    };
    for (let i = 0; i < 12; i++) await run(i);
    const role = randomUUID(),
      affiliation = randomUUID();
    await client.query(
      "INSERT INTO affiliations (id,name) VALUES ($1,'기존 소속')",
      [affiliation],
    );
    await client.query(
      "INSERT INTO roles (id,name,system_key) VALUES ($1,'계정 담당',NULL)",
      [role],
    );
    await client.query(
      "INSERT INTO role_permissions (role_id,permission) VALUES ($1,'account.manage')",
      [role],
    );
    await seed(role, affiliation);
    return run(12);
  };
  const insertAccount = (
    id: string,
    affiliation: string,
    status: "active" | "inactive",
  ) =>
    client.query(
      "INSERT INTO accounts (id,name,login_id,affiliation_id,status,password_hash) VALUES ($1,'이전 계정',$2,$3,$4,'legacy-hash')",
      [id, `old.${id.slice(0, 8)}`, affiliation, status],
    );
  try {
    const manager = randomUUID();
    await scenario(async (role, affiliation) => {
      await insertAccount(manager, affiliation, "active");
      await client.query(
        "INSERT INTO role_assignments (account_id,role_id,scope) VALUES ($1,$2,'global')",
        [manager, role],
      );
    });
    assert.equal(
      (await client.query("SELECT role FROM accounts WHERE id=$1", [manager]))
        .rows[0].role,
      "admin",
    );
    await client.query("ROLLBACK");

    // 계정 관리 권한을 가진 계정이 비활성뿐이면 이전 뒤 활성 관리자가 없다
    await assert.rejects(
      scenario(async (role, affiliation) => {
        const inactive = randomUUID();
        await insertAccount(inactive, affiliation, "inactive");
        await insertAccount(randomUUID(), affiliation, "active");
        await client.query(
          "INSERT INTO role_assignments (account_id,role_id,scope) VALUES ($1,$2,'global')",
          [inactive, role],
        );
      }),
      /활성 관리자가 없습니다/,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await lease.close();
  }
});
