import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { ApiError } from "../src/common/errors";
import type { TestSetColumnDto } from "../src/contracts/test-set.dto";
import {
  accounts,
  generationSteps,
  projectMemos,
  reviewItems,
  tempFrames,
  tempUploads,
  testSetMembers,
} from "../src/database/schema";
import { readAiConfig } from "../src/generation/model-config";
import {
  caseSchema,
  formSchema,
  validateSchema,
} from "../src/generation/output-schema";
import { stableInstructions } from "../src/generation/providers/ai-provider";
import { FakeProvider } from "../src/generation/providers/fake";
import { StageRunner } from "../src/generation/stage-runner";
import { DEFINITIONS } from "../src/generation/steps";
import { COLUMN_RULES, isQaRecord } from "../src/generation/steps/column-rules";
import {
  applicableViewpoints,
  VIEWPOINTS,
} from "../src/generation/steps/viewpoints";
import type { CaseOutput, GenerationInput } from "../src/generation/types";
import { validatedOutput } from "../src/generation/validated-output";
import { type LiveChange, LiveEvents } from "../src/live/live-events";
import { defaultColumns } from "../src/projects/template";
import { LocalStorage } from "../src/storage/local-storage";
import { CaseOperationsService } from "../src/test-sets/case-operations.service";
import { generationFixture } from "./generation-fixture";

const columns = (): TestSetColumnDto[] =>
  defaultColumns().map(({ enabled: _, ...c }) => c);
const context = (): GenerationInput => ({
  columns: columns(),
  memo: "",
  frames: [],
  featureGroups: [],
  viewpoints: applicableViewpoints([], []),
  screenStructure: [],
  styleExamples: [],
  existingCases: [],
});
const apiError = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;

test("AI 스키마는 세트의 모든 작성 열과 규칙을 포함하고 QA 기록은 제외한다", () => {
  const input = context();
  input.columns.push({
    id: randomUUID(),
    name: "사용자 열",
    type: "text",
    description: "근거를 기록",
    presetKey: null,
    systemKey: null,
    options: [],
  });
  const schema = formSchema(input.columns);
  for (const c of input.columns) {
    if (isQaRecord(c) || c.systemKey === "test_id")
      assert.equal(schema.properties?.[c.id], undefined);
    else {
      assert.ok(schema.required?.includes(c.id));
      assert.ok(
        schema.properties?.[c.id].description?.includes(
          c.presetKey ? COLUMN_RULES[c.presetKey] : "근거가 없으면 빈 값",
        ),
      );
    }
  }
  const request = {
    definition: DEFINITIONS.cases,
    context: input,
    schema,
    model: readAiConfig({}).models.cases,
    sourceData: {},
    images: [],
  };
  const instructions = stableInstructions(request);
  assert.ok(instructions.includes("화면 구조에 있는 ID만"));
  assert.ok(!instructions.includes('"presetKey":"qa_result"'));
});

test("fake coverage는 관점 ID를 검증하고 관리자 관점은 구조나 프레임 이름에 따라 포함한다", async () => {
  assert.equal(VIEWPOINTS.length, 12);
  assert.equal(applicableViewpoints([{ name: "Admin_Header" }], []).length, 12);
  const input = context();
  assert.equal(input.viewpoints.length, 9);
  assert.equal(applicableViewpoints([{ name: "관리자 주문" }], []).length, 12);
  assert.equal(
    applicableViewpoints([], [{ name: "Admin", screenId: "A1" }]).length,
    12,
  );
  assert.equal(applicableViewpoints([{ name: "주문 화면" }], []).length, 9);
  // DB에 의존하지 않는 출력 검증만 호출한다.
  const validate = (value: unknown) =>
    StageRunner.prototype.validate.call(
      {} as StageRunner,
      "finish",
      input,
      value,
    );
  const request = {
    definition: DEFINITIONS.finish,
    context: input,
    schema: caseSchema(input),
    model: readAiConfig({}).models.finish,
    sourceData: {},
    images: [],
  };
  const output = (await validatedOutput(new FakeProvider(), request, validate))
    .value as CaseOutput;
  assert.deepEqual(
    output.coverage.map((v) => v.viewpointId),
    input.viewpoints.map((v) => v.id),
  );
  assert.throws(() =>
    validate({ ...output, coverage: output.coverage.slice(1) }),
  );
  assert.throws(() =>
    validate({ ...output, coverage: [...output.coverage, output.coverage[0]] }),
  );
  assert.throws(() =>
    validateSchema(caseSchema(input), {
      ...output,
      coverage: [
        { viewpointId: "admin_listing", status: "covered", explanation: "" },
      ],
    }),
  );
  input.viewpoints = applicableViewpoints([{ name: "관리자" }], []);
  const adminRequest = { ...request, schema: caseSchema(input) };
  const admin = (
    await validatedOutput(new FakeProvider(), adminRequest, validate)
  ).value as CaseOutput;
  assert.equal(admin.coverage.length, 12);
});

async function addColumn(
  f: Awaited<ReturnType<typeof generationFixture>>,
  setId: string,
  after: string,
  type: TestSetColumnDto["type"] = "text",
) {
  const columnId = randomUUID();
  await f.app.get(CaseOperationsService).apply(setId, f.accountId, {
    ops: [
      {
        type: "add_column",
        columnId,
        afterColumnId: after,
        column: {
          name: `사용자 ${columnId}`,
          type,
          description: "자료에 있는 근거만",
          options: type === "select" || type === "tags" ? ["완료"] : [],
          presetKey: null,
        },
      },
    ],
  });
  return columnId;
}

test("열 채우기는 rewrite 한도와 세트 잠금을 공유하고 저장 직전 기존 값을 보호한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const columnId = await addColumn(f, set.id, set.columns[0].id);
    const operations = f.app.get(CaseOperationsService);
    const ids = Array.from({ length: 5 }, () => randomUUID());
    await operations.apply(set.id, f.accountId, {
      ops: ids.map((caseId, i) => ({
        type: "add_case",
        caseId,
        afterCaseId: null,
        values: i === 0 ? { [columnId]: "기존 내용" } : {},
      })),
    });
    await f.db
      .insert(projectMemos)
      .values({
        projectId: set.project.id,
        authorId: f.accountId,
        body: "프로젝트 작성 근거",
      })
      .onConflictDoUpdate({
        target: projectMemos.projectId,
        set: { body: "프로젝트 작성 근거" },
      });
    const changes: LiveChange[] = [];
    const unsubscribe = f.app.get(LiveEvents).subscribe(async (c) => {
      changes.push(c);
    });
    const response = await fetch(
      `${f.base}/test-sets/${set.id}/test-set-columns/${columnId}/fill`,
      { method: "POST", headers: { Cookie: f.cookie } },
    );
    assert.equal(response.status, 202);
    const job = (await response.json()) as { jobId: string };
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.kind,
      "fill_column",
    );
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.stage,
      null,
    );
    await assert.rejects(
      f.generation.create(set.id, f.accountId, {
        kind: "append",
        memo: "추가",
      }),
      apiError("GENERATION_RUNNING"),
    );
    const [snapshot] = await f.db
      .select()
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, job.jobId),
          eq(generationSteps.stage, "context"),
        ),
      );
    assert.equal(
      (snapshot.input as GenerationInput).memo,
      "프로젝트 작성 근거",
    );
    assert.equal((snapshot.input as GenerationInput).existingCases.length, 5);
    const other = await f.makeSet();
    const [item] = await f.db
      .insert(reviewItems)
      .values({
        testSetId: other.id,
        screenDescription: "화면",
        questions: [],
        draft: {},
      })
      .returning();
    const rewrite = await f.reviews.rewrite(item.id, f.accountId, {
      answer: "답변",
    });
    const third = await f.makeSet();
    await assert.rejects(
      f.generation.fillColumn(third.id, third.columns[1].id, f.accountId),
      apiError("GENERATION_CAPACITY"),
    );
    await operations.apply(set.id, f.accountId, {
      ops: [
        { type: "set_cell", caseId: ids[1], columnId, value: "생성 중 입력" },
        { type: "set_cell", caseId: ids[0], columnId, value: "" },
        { type: "delete_cases", caseIds: [ids[4]] },
      ],
    });
    const before = (await f.generation.store.visible(set.id, f.accountId)).row
      .version;
    f.providers.fake.generate = async (request) => ({
      text: JSON.stringify(
        Object.fromEntries(
          request.context.existingCases.map((c) => [
            c.id,
            c.id === ids[3] ? "" : "AI 값",
          ]),
        ),
      ),
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
    });
    await f.runner.process(job.jobId, "rewrite");
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.status,
      "succeeded",
    );
    const result = await f.generation.store.cases(set.id);
    const value = (id: string) =>
      result.find((c) => c.id === id)?.values[columnId];
    assert.equal(value(ids[0]), "");
    assert.equal(value(ids[1]), "생성 중 입력");
    assert.equal(value(ids[2]), "AI 값");
    assert.equal(value(ids[3]) ?? "", "");
    assert.ok(!result.some((c) => c.id === ids[4]));
    assert.equal(
      (await f.generation.store.visible(set.id, f.accountId)).row.version,
      before + 1,
    );
    assert.ok(
      changes.some((c) => c.type === "resync" && c.testSetId === set.id),
    );
    assert.equal(
      (
        await f.db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.testSetId, set.id))
      ).length,
      0,
    );
    await f.generation.fail(rewrite.jobId, "TEST_FINISHED");
    unsubscribe();
  } finally {
    await f.close();
  }
});

test("frameIds는 업로드 소속을 검증하고 선택 프레임만 저장하며 생략과 빈 배열은 전체다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    await f.app.get(LocalStorage).initialize();
    const post = (body: object) =>
      fetch(`${f.base}/test-sets/${set.id}/generations`, {
        method: "POST",
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const frameIds of [null, "bad", ["bad"], [42]]) {
      assert.equal(
        (await post({ kind: "append", memo: "자료", frameIds })).status,
        400,
      );
    }
    assert.equal(
      (await post({ kind: "append", memo: "자료", frameIds: [randomUUID()] }))
        .status,
      400,
    );
    for (const mode of ["subset", "empty", "omitted"]) {
      const [upload] = await f.db
        .insert(tempUploads)
        .values({ accountId: f.accountId })
        .returning();
      const frames = await f.db
        .insert(tempFrames)
        .values(
          [0, 1].map((position) => ({
            uploadId: upload.id,
            name: position ? "관리자" : "가입",
            screenDocument: "화면",
            imageStorageKeys: [],
            position,
          })),
        )
        .returning();
      assert.equal(
        (
          await post({
            kind: "initial",
            uploadId: upload.id,
            frameIds: [randomUUID()],
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await f.db
            .select()
            .from(tempUploads)
            .where(eq(tempUploads.id, upload.id))
        )[0].claimedAt,
        null,
      );
      const response = await post({
        kind: "initial",
        uploadId: upload.id,
        ...(mode === "omitted"
          ? {}
          : { frameIds: mode === "empty" ? [] : [frames[0].id.toUpperCase()] }),
      });
      assert.equal(response.status, 202);
      const { jobId } = (await response.json()) as { jobId: string };
      const [snapshot] = await f.db
        .select()
        .from(generationSteps)
        .where(eq(generationSteps.jobId, jobId));
      const input = snapshot.input as GenerationInput;
      assert.equal(input.frames.length, mode === "subset" ? 1 : 2);
      assert.equal(input.viewpoints.length, mode === "subset" ? 9 : 12);
      await f.generation.fail(jobId, "TEST_FINISHED");
    }
  } finally {
    await f.close();
  }
});

test("update_column은 사용자 열, 길이, 유일성, 편집 권한을 검사하고 version과 연산을 전파한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const columnId = await addColumn(f, set.id, set.columns[0].id);
    const operations = f.app.get(CaseOperationsService);
    const op = {
      type: "update_column",
      columnId,
      name: "새 이름",
      description: "새 기준",
    };
    const [admin] = await f.db
      .select()
      .from(accounts)
      .where(eq(accounts.id, f.accountId));
    const viewer = await f.app.get(AccountsService).create({
      name: "조회자",
      email: `${randomUUID()}@example.com`,
      affiliationId: admin.affiliationId,
      assignments: [],
    });
    f.lease.accountIds.push(viewer.account.id);
    await f.db.insert(testSetMembers).values({
      testSetId: set.id,
      accountId: viewer.account.id,
      access: "view",
    });
    await assert.rejects(
      operations.apply(set.id, viewer.account.id, { ops: [op] }),
      apiError("FORBIDDEN"),
    );
    await assert.rejects(
      f.generation.fillColumn(set.id, columnId, viewer.account.id),
      apiError("FORBIDDEN"),
    );
    await assert.rejects(
      operations.apply(set.id, f.accountId, {
        ops: [{ ...op, columnId: set.columns[0].id }],
      }),
      apiError("COLUMN_NOT_EDITABLE"),
    );
    for (const invalid of [
      { name: " " },
      { name: "a".repeat(51) },
      { description: "a".repeat(201) },
      { name: set.columns[0].name },
    ])
      await assert.rejects(
        operations.apply(set.id, f.accountId, { ops: [{ ...op, ...invalid }] }),
        apiError("VALIDATION_FAILED"),
      );
    const changes: LiveChange[] = [];
    const off = f.app.get(LiveEvents).subscribe(async (c) => {
      changes.push(c);
    });
    const version = (await f.generation.store.visible(set.id, f.accountId)).row
      .version;
    await f.db
      .update(testSetMembers)
      .set({ access: "edit" })
      .where(eq(testSetMembers.accountId, viewer.account.id));
    const result = await operations.apply(set.id, viewer.account.id, {
      ops: [op],
    });
    assert.equal(result.version, version + 1);
    assert.ok(
      changes.some(
        (c) =>
          c.type === "ops" &&
          c.version === result.version &&
          c.ops[0].type === "update_column",
      ),
    );
    const changed = (await f.generation.store.columns(set.id)).find(
      (c) => c.id === columnId,
    );
    assert.equal(changed?.name, op.name);
    assert.equal(changed?.description, op.description);
    const second = await addColumn(f, set.id, set.columns[0].id);
    await assert.rejects(
      operations.apply(set.id, f.accountId, {
        ops: [
          { ...op, columnId: second, name: "원자 변경" },
          { ...op, name: "원자 변경" },
        ],
      }),
      apiError("VALIDATION_FAILED"),
    );
    assert.equal(
      (await f.generation.store.columns(set.id))
        .find((c) => c.id === second)
        ?.name.startsWith("사용자"),
      true,
    );
    off();
  } finally {
    await f.close();
  }
});

test("열 채우기는 선택·태그·체크박스 형식을 지키고 false를 보존하며 QA 기록 열은 거부한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const operations = f.app.get(CaseOperationsService);
    for (const c of set.columns.filter(
      (c) => isQaRecord(c) || c.systemKey === "test_id",
    ))
      await assert.rejects(
        f.generation.fillColumn(set.id, c.id, f.accountId),
        apiError("COLUMN_NOT_EDITABLE"),
      );
    for (const type of ["select", "tags", "checkbox"] as const) {
      const columnId = await addColumn(f, set.id, set.columns[0].id, type);
      const caseId = randomUUID();
      const existingId = randomUUID();
      const existing =
        type === "select" ? "완료" : type === "tags" ? ["완료"] : false;
      await operations.apply(set.id, f.accountId, {
        ops: [
          { type: "add_case", caseId, afterCaseId: null, values: {} },
          {
            type: "add_case",
            caseId: existingId,
            afterCaseId: null,
            values: { [columnId]: existing },
          },
        ],
      });
      const { jobId } = await f.generation.fillColumn(
        set.id,
        columnId,
        f.accountId,
      );
      const generated =
        type === "select" ? "완료" : type === "tags" ? ["완료"] : true;
      f.providers.fake.generate = async (request) => ({
        text: JSON.stringify(
          Object.fromEntries(
            request.context.existingCases.map((c) => [c.id, generated]),
          ),
        ),
        usage: {
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheCreationTokens: 0,
        },
      });
      await f.runner.process(jobId, "rewrite");
      assert.equal(
        (await f.generation.current(set.id, f.accountId))?.status,
        "succeeded",
      );
      const result = await f.generation.store.cases(set.id);
      assert.deepEqual(
        result.find((c) => c.id === caseId)?.values[columnId],
        generated,
      );
      assert.deepEqual(
        result.find((c) => c.id === existingId)?.values[columnId],
        existing,
      );
    }
  } finally {
    await f.close();
  }
});

test("최종 생성은 QA 기록을 빈 값으로 저장하고 해당 기록이 있어도 중복을 만들지 않는다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "가입 확인",
    });
    for (const stage of ["screens", "flows", "cases", "finish"] as const)
      await f.runner.process(jobId, stage);
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.status,
      "succeeded",
    );
    const cases = await f.generation.store.cases(set.id);
    assert.ok(cases.length > 0);
    for (const c of cases)
      for (const column of set.columns.filter(isQaRecord))
        assert.ok(c.values[column.id] === "" || c.values[column.id] === null);
    const qa = set.columns.find((c) => c.presetKey === "result_comment");
    assert.ok(qa);
    await f.app.get(CaseOperationsService).apply(set.id, f.accountId, {
      ops: [
        {
          type: "set_cell",
          caseId: cases[0].id,
          columnId: qa.id,
          value: "사람이 기록",
        },
      ],
    });
    const second = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "가입 확인",
    });
    for (const stage of ["screens", "flows", "cases", "finish"] as const)
      await f.runner.process(second.jobId, stage);
    assert.equal((await f.generation.store.cases(set.id)).length, cases.length);
  } finally {
    await f.close();
  }
});
