import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { ProjectsRepository } from "../src/projects/projects.repository";
import { openTestDatabase } from "./database";

test("shared testScenario and IA storage preserves project boundaries and template identity", async (t) => {
  const lease = await openTestDatabase();
  const { lock, database, projects, folder } = lease;
  try {
    await t.test(
      "project creation supplies one template and backfill never replaces edits",
      async () => {
        const row = await new ProjectsRepository(database).create({
          name: "양식 원본",
        });
        projects.push(row.id);
        const get = async () =>
          (
            await lock.query(
              "SELECT * FROM project_templates WHERE project_id=$1",
              [row.id],
            )
          ).rows[0];
        const original = await get();
        assert.equal(original.revision, 1);
        assert.deepEqual(
          original.columns.map((c: { name: string }) => c.name),
          ["테스트 ID", "테스트 항목"],
        );
        assert.equal(
          new Set(original.columns.map((c: { id: string }) => c.id)).size,
          2,
        );
        assert.deepEqual(
          original.view.map((v: { columnId: string }) => v.columnId),
          original.columns.map((c: { id: string }) => c.id),
        );
        const migration = await readFile(
          join(folder, "0002_shocking_wiccan.sql"),
          "utf8",
        );
        const backfill = migration.split("--> statement-breakpoint").at(-1);
        assert.ok(backfill && backfill.includes("WITH initial_fields"));
        const legacy = randomUUID();
        projects.push(legacy);
        await lock.query(
          "INSERT INTO projects(id,name) VALUES ($1,'이전 프로젝트')",
          [legacy],
        );
        await lock.query(
          "UPDATE project_templates SET revision=2, columns=jsonb_set(columns,'{0,name}','\"내 번호\"') WHERE project_id=$1",
          [row.id],
        );
        const edited = await get();
        await lock.query(backfill);
        await lock.query(backfill);
        assert.deepEqual(await get(), edited);
        const legacyTemplate = (
          await lock.query(
            "SELECT * FROM project_templates WHERE project_id=$1",
            [legacy],
          )
        ).rows[0];
        assert.equal(legacyTemplate.columns.length, 8);
        assert.equal(legacyTemplate.revision, 1);
        assert.ok(
          legacyTemplate.columns.every(
            (c: { id: string }) =>
              !original.columns.some((o: { id: string }) => o.id === c.id),
          ),
        );
      },
    );
    await t.test(
      "composite references, custom values and unique order/code constraints",
      async () => {
        await lock.query("BEGIN");
        try {
          const p = randomUUID(),
            q = randomUUID(),
            s = randomUUID(),
            otherTestScenario = randomUUID(),
            sameProjectTestScenario = randomUUID();
          await lock.query(
            "INSERT INTO projects(id,name) VALUES ($1,'A'),($2,'B')",
            [p, q],
          );
          const insertTestScenario =
            "INSERT INTO test_scenarios(id,project_id,name,kind,source_template_revision) VALUES ($1,$2,'시나리오','unit',1)";
          await lock.query(insertTestScenario, [s, p]);
          await lock.query(insertTestScenario, [otherTestScenario, q]);
          await lock.query(insertTestScenario, [sameProjectTestScenario, p]);
          const failures = async (
            query: string,
            values: unknown[],
            code: string,
          ) => {
            await lock.query("SAVEPOINT rejection");
            try {
              await assert.rejects(
                lock.query(query, values),
                (error: unknown) => (error as { code?: string }).code === code,
              );
            } finally {
              await lock.query("ROLLBACK TO SAVEPOINT rejection");
            }
          };
          const ia = randomUUID(),
            foreignIa = randomUUID();
          const iaSql =
            "INSERT INTO ia_items(id,project_id,screen_id,name,position,parent_id) VALUES ($1,$2,$3,'화면',0,$4)";
          await lock.query(iaSql, [ia, p, "ORD-01", null]);
          await lock.query(iaSql, [foreignIa, q, "ORD-01", null]);
          await lock.query(iaSql, [randomUUID(), p, "ord-01", null]);
          await failures(iaSql, [randomUUID(), p, "ORD-01", null], "23505");
          await failures(iaSql, [randomUUID(), p, "B", foreignIa], "23503");
          const self = randomUUID();
          await failures(iaSql, [self, p, "Self", self], "23514");
          const custom = randomUUID(),
            system = randomUUID(),
            foreignColumn = randomUUID(),
            otherColumn = randomUUID();
          const colSql =
            "INSERT INTO test_scenario_columns(id,project_id,test_scenario_id,kind,field,value_type,name) VALUES ($1,$2,$3,$4,$5,$6,'열')";
          await lock.query(colSql, [custom, p, s, "custom", null, "text"]);
          await lock.query(colSql, [system, p, s, "system", "title", null]);
          await lock.query(colSql, [
            foreignColumn,
            q,
            otherTestScenario,
            "custom",
            null,
            "text",
          ]);
          await lock.query(colSql, [
            otherColumn,
            p,
            sameProjectTestScenario,
            "custom",
            null,
            "text",
          ]);
          await failures(
            colSql,
            [randomUUID(), p, otherTestScenario, "custom", null, "text"],
            "23503",
          );
          await failures(
            colSql,
            [randomUUID(), p, s, "system", "title", null],
            "23505",
          );
          const a = randomUUID(),
            b = randomUUID();
          const caseSql =
            "INSERT INTO test_cases(id,project_id,test_scenario_id,position,case_code,title) VALUES ($1,$2,$3,$4,$5,'')";
          await lock.query(caseSql, [a, p, s, 0, "TC-001"]);
          await lock.query(caseSql, [b, p, s, 1, "TC-002"]);
          await failures(
            caseSql,
            [randomUUID(), p, otherTestScenario, 0, ""],
            "23503",
          );
          await failures(caseSql, [randomUUID(), p, s, 2, "TC-001"], "23505");
          await failures(caseSql, [randomUUID(), p, s, 1, "TC-003"], "23505");
          await lock.query(
            "UPDATE test_cases SET case_code='',position=position+100 WHERE test_scenario_id=$1",
            [s],
          );
          await lock.query(
            "UPDATE test_cases SET case_code='TC-002',position=1 WHERE id=$1",
            [a],
          );
          await lock.query(
            "UPDATE test_cases SET case_code='TC-001',position=0 WHERE id=$1",
            [b],
          );
          assert.deepEqual(
            (
              await lock.query(
                "SELECT id FROM test_cases WHERE test_scenario_id=$1 ORDER BY position",
                [s],
              )
            ).rows.map((r) => r.id),
            [b, a],
          );
          const valueSql =
            "INSERT INTO test_case_values(test_scenario_id,case_id,column_id,value) VALUES ($1,$2,$3,to_jsonb('메모'::text))";
          await lock.query(valueSql, [s, a, custom]);
          for (const column of [system, foreignColumn, otherColumn])
            await failures(valueSql, [s, b, column], "23503");
          const linkSql =
            "INSERT INTO test_case_ia_links(project_id,case_id,ia_item_id,position) VALUES ($1,$2,$3,0)";
          await lock.query(linkSql, [p, a, ia]);
          await failures(linkSql, [p, b, foreignIa], "23503");
          await failures("DELETE FROM ia_items WHERE id=$1", [ia], "23503");
          await lock.query(
            "UPDATE ia_items SET screen_id='RENAMED' WHERE id=$1",
            [ia],
          );
          assert.equal(
            (
              await lock.query(
                "SELECT ia_item_id FROM test_case_ia_links WHERE case_id=$1",
                [a],
              )
            ).rows[0].ia_item_id,
            ia,
          );
          await failures(
            "DELETE FROM test_scenario_columns WHERE id=$1",
            [custom],
            "23503",
          );
        } finally {
          await lock.query("ROLLBACK");
        }
      },
    );
  } finally {
    await lease.close();
  }
});
