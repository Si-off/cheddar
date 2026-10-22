import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { isCaseOp, isServerMessage } from "@cheddar/contracts";
import { and, eq } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type {
  OpsResultDto,
  TestSetDto,
  TestSetViewDto,
} from "../src/contracts/test-set.dto";
import {
  featureGroups,
  generationSteps,
  reviewItems,
} from "../src/database/schema";
import type { CaseOutput } from "../src/generation/types";
import { ProjectsService } from "../src/projects/projects.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { validateOps } from "../src/test-sets/values";
import { openTestDatabase } from "./database";
import { generationFixture } from "./generation-fixture";

test("기능 그룹 연산의 HTTP와 실시간 계약은 UUID, null, 생략을 구분한다", () => {
  const caseId = randomUUID(),
    featureGroupId = randomUUID();
  for (const op of [
    { type: "set_feature_group", caseId, featureGroupId },
    { type: "set_feature_group", caseId, featureGroupId: null },
    { type: "add_case", caseId, afterCaseId: null },
    { type: "add_case", caseId, afterCaseId: null, featureGroupId },
    { type: "add_case", caseId, afterCaseId: null, featureGroupId: null },
  ]) {
    assert.equal(isCaseOp(op), true);
    assert.deepEqual(JSON.parse(JSON.stringify(validateOps({ ops: [op] }))), [
      op,
    ]);
    assert.equal(
      isServerMessage({
        type: "ops",
        version: 1,
        ops: [op],
        connectionId: null,
        actor: { kind: "visitor", id: randomUUID(), name: "방문자" },
      }),
      true,
    );
  }
  for (const op of [
    { type: "set_feature_group", caseId },
    { type: "set_feature_group", caseId, featureGroupId: "wrong" },
    { type: "set_feature_group", caseId, featureGroupId: false },
    { type: "add_case", caseId, afterCaseId: null, featureGroupId: "wrong" },
  ]) {
    assert.equal(isCaseOp(op), false);
    assert.throws(() => validateOps({ ops: [op] }));
  }
  assert.equal(
    validateOps({
      ops: [
        {
          type: "set_feature_group",
          caseId,
          featureGroupId: featureGroupId.toUpperCase(),
        },
      ],
    })[0].type,
    "set_feature_group",
  );
});

test("실제 API는 기능 그룹 저장·상속·변경과 프로젝트 경계, 보기 기본값을 보장한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet(),
      other = await f.makeSet();
    const groups = [randomUUID(), randomUUID(), randomUUID()].sort();
    await f.db.insert(featureGroups).values([
      { id: groups[1], projectId: set.project.id, name: "뒤", position: 1 },
      {
        id: groups[2],
        projectId: set.project.id,
        name: "동순위 뒤",
        position: 0,
      },
      { id: groups[0], projectId: set.project.id, name: "앞", position: 0 },
    ]);
    const foreign = await f.app
      .get(ProjectsService)
      .saveGroup(other.project.id, { name: "다른 프로젝트", description: "" });
    const request = (path: string, method = "GET", body?: unknown) =>
      fetch(`${f.base}/test-sets/${set.id}${path}`, {
        method,
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response): Promise<T> => {
      assert.equal(response.status, 200, await response.clone().text());
      return response.json() as Promise<T>;
    };
    const apply = (ops: unknown[]) => request("/ops", "POST", { ops });
    // 목록은 position, id 순이며 케이스가 없어도 프로젝트 그룹을 반환한다.
    const initial = await json<TestSetDto>(await request(""));
    assert.deepEqual(
      initial.featureGroups.map((g) => g.id),
      [groups[0], groups[2], groups[1]],
    );
    const first = randomUUID(),
      inherited = randomUUID(),
      front = randomUUID(),
      explicitNull = randomUUID();
    const added = await json<OpsResultDto>(
      await apply([
        {
          type: "add_case",
          caseId: first,
          afterCaseId: null,
          featureGroupId: groups[0],
        },
        { type: "add_case", caseId: inherited, afterCaseId: first },
        {
          type: "add_case",
          caseId: explicitNull,
          afterCaseId: inherited,
          featureGroupId: null,
        },
        { type: "add_case", caseId: front, afterCaseId: null },
      ]),
    );
    assert.equal(added.version, initial.version + 1);
    assert.deepEqual(
      added.cases.map((c) => [c.id, c.featureGroupId]),
      [
        [front, null],
        [first, groups[0]],
        [inherited, groups[0]],
        [explicitNull, null],
      ],
    );
    const self = randomUUID();
    assert.equal(
      (await apply([{ type: "add_case", caseId: self, afterCaseId: self }]))
        .status,
      400,
    );
    const changed = await json<OpsResultDto>(
      await apply([
        { type: "set_feature_group", caseId: first, featureGroupId: groups[1] },
      ]),
    );
    assert.equal(changed.version, added.version + 1);
    assert.equal(changed.cases[0].featureGroupId, groups[1]);
    const before = await json<TestSetDto>(await request(""));
    for (const op of [
      { type: "set_feature_group", caseId: first, featureGroupId: foreign.id },
      {
        type: "add_case",
        caseId: randomUUID(),
        afterCaseId: first,
        featureGroupId: foreign.id,
      },
      {
        type: "set_feature_group",
        caseId: first,
        featureGroupId: randomUUID(),
      },
      {
        type: "set_feature_group",
        caseId: randomUUID(),
        featureGroupId: groups[0],
      },
    ]) {
      const response = await apply([
        { type: "set_feature_group", caseId: inherited, featureGroupId: null },
        op,
      ]);
      assert.equal(response.status, 404);
      assert.deepEqual(await json<TestSetDto>(await request("")), before);
    }
    const cleared = await json<OpsResultDto>(
      await apply([
        { type: "set_feature_group", caseId: first, featureGroupId: null },
      ]),
    );
    assert.equal(cleared.cases[0].featureGroupId, null);
    await f.app
      .get(ProjectsService)
      .saveGroup(set.project.id, { name: "이름 변경" }, groups[0]);
    assert.equal(
      (await json<TestSetDto>(await request(""))).featureGroups[0].name,
      "이름 변경",
    );
    await f.app.get(ProjectsService).removeGroup(set.project.id, groups[0]);
    assert.equal(
      (await json<TestSetDto>(await request(""))).cases.find(
        (c) => c.id === inherited,
      )?.featureGroupId,
      null,
    );
    const defaults: TestSetViewDto = {
      view: "table",
      canvasGroup: "feature",
      canvasDensity: "brief",
      groupByColumnId: null,
      columnWidths: {},
      rowHeights: {},
    };
    assert.deepEqual(
      await json<TestSetViewDto>(await request("/view")),
      defaults,
    );
    const column = set.columns.find((c) => c.type === "select");
    assert.ok(column);
    for (const canvasGroup of ["feature", "column", "none"] as const) {
      const view: TestSetViewDto = {
        ...defaults,
        view: "canvas",
        canvasGroup,
        canvasDensity: "detail",
        groupByColumnId: canvasGroup === "column" ? column.id : null,
      };
      assert.deepEqual(await json(await request("/view", "PUT", view)), view);
      assert.deepEqual(await json(await request("/view")), view);
    }
    for (const patch of [
      { view: "card" },
      { canvasGroup: "unknown" },
      { canvasDensity: "unknown" },
      { canvasGroup: "column" },
      { canvasGroup: "column", groupByColumnId: set.columns[0].id },
      { canvasGroup: "column", groupByColumnId: other.columns[2].id },
    ])
      assert.equal(
        (await request("/view", "PUT", { ...defaults, ...patch })).status,
        400,
      );
    assert.deepEqual(
      await json(
        await request("/view", "PUT", {
          groupByColumnId: null,
          columnWidths: {},
          rowHeights: {},
        }),
      ),
      defaults,
    );
  } finally {
    await f.close();
  }
});

test("생성은 그룹 키를 최종 점검과 확인 필요 수락까지 보존하며 미등록 키는 null로 저장한다", async () => {
  const f = await generationFixture();
  try {
    const sets = f.app.get(TestSetsService);
    const set = await f.makeSet();
    const project = f.app.get(ProjectsService);
    const groups = [];
    for (const name of ["가입", "결제"])
      groups.push(
        await project.saveGroup(set.project.id, { name, description: "" }),
      );
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "그룹 연결",
    });
    for (const stage of ["screens", "flows", "cases", "finish"] as const)
      await f.runner.process(jobId, stage);
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.status,
      "succeeded",
    );
    const result = await sets.detail(set.id, f.accountId);
    assert.equal(result.cases.length, 4);
    assert.deepEqual(
      [...new Set(result.cases.map((c) => c.featureGroupId))].sort(),
      groups.map((g) => g.id).sort(),
    );
    const titleColumn = set.columns.find((c) => c.systemKey === "title");
    assert.ok(titleColumn);
    for (const c of result.cases) {
      assert.ok(
        groups.some(
          (g) =>
            String(c.values[titleColumn.id]).startsWith(g.name) &&
            c.featureGroupId === g.id,
        ),
      );
    }
    const [review] = await f.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.testSetId, set.id));
    assert.ok(groups.some((g) => g.id === review.featureGroupId));
    // 다시 작성해도 DB의 원래 그룹은 유지된다.
    const rewritten = await f.reviews.rewrite(review.id, f.accountId, {
      answer: "완료 화면",
      clientRequestId: randomUUID(),
    });
    await f.runner.process(rewritten.jobId, "rewrite");
    const item = (await f.reviews.list(set.id, f.accountId)).items[0];
    const accepted = await f.reviews.accept(item.id, f.accountId, {
      draft: item.draft,
    });
    assert.equal(accepted.case.featureGroupId, review.featureGroupId);
    const ungrouped = await f.makeSet();
    const ungroupedJob = await f.generation.create(ungrouped.id, f.accountId, {
      kind: "append",
      memo: "새 흐름 제안",
    });
    for (const stage of ["screens", "flows", "cases", "finish"] as const)
      await f.runner.process(ungroupedJob.jobId, stage);
    const noGroups = await sets.detail(ungrouped.id, f.accountId);
    assert.equal(noGroups.cases.length, 2);
    assert.ok(noGroups.cases.every((c) => c.featureGroupId === null));
    assert.deepEqual(noGroups.featureGroups, []);
    const [ungroupedReview] = await f.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.testSetId, ungrouped.id));
    const acceptedNull = await f.reviews.accept(
      ungroupedReview.id,
      f.accountId,
      { draft: ungroupedReview.draft as Record<string, string> },
    );
    assert.equal(acceptedNull.case.featureGroupId, null);
    // 입력 스냅샷 뒤 삭제된 그룹도 다른 그룹을 상속하지 않는다.
    const deleted = await project.saveGroup(set.project.id, {
      name: "삭제될 그룹",
      description: "",
    });
    const pending = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "삭제 직전",
    });
    for (const stage of ["screens", "flows", "cases"] as const)
      await f.runner.process(pending.jobId, stage);
    await project.removeGroup(set.project.id, deleted.id);
    await f.runner.process(pending.jobId, "finish");
    const after = await sets.detail(set.id, f.accountId);
    assert.ok(after.cases.some((c) => c.featureGroupId === null));
  } finally {
    await f.close();
  }
});

test("최종 점검은 케이스와 그룹 키의 누락·개수 불일치를 거부한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "검증",
    });
    for (const stage of ["screens", "flows", "cases"] as const)
      await f.runner.process(jobId, stage);
    const [step] = await f.db
      .select()
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, jobId),
          eq(generationSteps.stage, "cases"),
        ),
      );
    const [context] = await f.db
      .select()
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, jobId),
          eq(generationSteps.stage, "context"),
        ),
      );
    const output = step.output as CaseOutput;
    assert.throws(() =>
      f.runner.validate(
        "finish",
        context.input as Parameters<typeof f.runner.validate>[1],
        output,
      ),
    );
    assert.throws(() =>
      f.runner.validate(
        "finish",
        context.input as Parameters<typeof f.runner.validate>[1],
        { ...output, caseGroupKeys: [], reviewGroupKeys: [] },
      ),
    );
  } finally {
    await f.close();
  }
});

test("0013은 계정·방문자의 card 보기와 열 그룹화를 canvas로 이전하고 기존 케이스는 미분류로 둔다", async () => {
  const lease = await openTestDatabase();
  const client = await lease.database.pool.connect();
  const schema = `canvas_migration_${randomUUID().replaceAll("-", "")}`;
  try {
    await client.query("BEGIN");
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", public`);
    const migrations = readMigrationFiles({ migrationsFolder: lease.folder });
    const run = async (index: number) => {
      for (const statement of migrations[index].sql)
        await client.query(statement.replaceAll('"public".', `"${schema}".`));
    };
    for (let i = 0; i < 12; i++) await run(i);
    const account = randomUUID(),
      affiliation = randomUUID(),
      role = randomUUID();
    await client.query(
      "INSERT INTO affiliations (id,name) VALUES ($1,'이전 소속')",
      [affiliation],
    );
    await client.query(
      "INSERT INTO roles (id,name,system_key) VALUES ($1,'관리자','administrator')",
      [role],
    );
    await client.query(
      "INSERT INTO accounts (id,name,login_id,affiliation_id,status,password_hash) VALUES ($1,'관리자','migration-admin',$2,'active','hash')",
      [account, affiliation],
    );
    await client.query(
      "INSERT INTO role_assignments (account_id,role_id,scope) VALUES ($1,$2,'global')",
      [account, role],
    );
    await run(12);
    const project = randomUUID(),
      set = randomUUID(),
      column = randomUUID(),
      visitor = randomUUID(),
      caseId = randomUUID();
    await client.query(
      "INSERT INTO projects (id,name,created_by) VALUES ($1,'프로젝트',$2)",
      [project, account],
    );
    await client.query(
      "INSERT INTO test_sets (id,name,project_id,owner_id) VALUES ($1,'세트',$2,$3)",
      [set, project, account],
    );
    await client.query(
      "INSERT INTO test_set_columns (id,test_set_id,name,type,position) VALUES ($1,$2,'환경','select',0)",
      [column, set],
    );
    await client.query(
      "INSERT INTO visitor_sessions (id,test_set_id,browser_token_hash,name) VALUES ($1,$2,$3,'방문자')",
      [visitor, set, "a".repeat(64)],
    );
    await client.query(
      "INSERT INTO test_cases (id,test_set_id,position,author_name) VALUES ($1,$2,0,'기존 작성자')",
      [caseId, set],
    );
    await client.query(
      "INSERT INTO view_preferences (test_set_id,account_id,view,group_by_column_id,column_widths) VALUES ($1,$2,'card',$3,$4::jsonb)",
      [set, account, column, JSON.stringify({ [column]: 200 })],
    );
    await client.query(
      "INSERT INTO view_preferences (test_set_id,visitor_session_id,view) VALUES ($1,$2,'card')",
      [set, visitor],
    );
    await run(13);
    const prefs = (
      await client.query(
        "SELECT view,canvas_group,canvas_density,group_by_column_id,column_widths FROM view_preferences ORDER BY account_id NULLS LAST",
      )
    ).rows;
    assert.deepEqual(prefs, [
      {
        view: "canvas",
        canvas_group: "column",
        canvas_density: "brief",
        group_by_column_id: column,
        column_widths: { [column]: 200 },
      },
      {
        view: "canvas",
        canvas_group: "feature",
        canvas_density: "brief",
        group_by_column_id: null,
        column_widths: {},
      },
    ]);
    assert.equal(
      (
        await client.query(
          "SELECT feature_group_id FROM test_cases WHERE id=$1",
          [caseId],
        )
      ).rows[0].feature_group_id,
      null,
    );
    await client.query("SAVEPOINT invalid_view");
    await assert.rejects(
      client.query("UPDATE view_preferences SET view='card'"),
    );
    await client.query("ROLLBACK TO SAVEPOINT invalid_view");
    const group = randomUUID();
    await client.query(
      "INSERT INTO feature_groups (id,project_id,name,position) VALUES ($1,$2,'그룹',0)",
      [group, project],
    );
    await client.query(
      "UPDATE test_cases SET feature_group_id=$1 WHERE id=$2",
      [group, caseId],
    );
    await client.query("DELETE FROM feature_groups WHERE id=$1", [group]);
    assert.equal(
      (
        await client.query(
          "SELECT feature_group_id FROM test_cases WHERE id=$1",
          [caseId],
        )
      ).rows[0].feature_group_id,
      null,
    );
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await lease.close();
  }
});
