import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import {
  generationSteps,
  projectQaReferences,
  reviewItems,
} from "../src/database/schema";
import { readPiConfig } from "../src/generation/pi/config";
import { PiInfrastructureError } from "../src/generation/pi/errors";
import { PiGenerationService } from "../src/generation/pi/pi.service";
import { readQaReference } from "../src/generation/pi/reference";
import {
  accountSessionUsage,
  newCheckpoint,
  type PiRunOptions,
} from "../src/generation/pi/runtime";
import { emptyPiDraft, PiWorkspace } from "../src/generation/pi/workspace";
import { AiFailure } from "../src/generation/providers/ai-provider";
import { QueueService } from "../src/generation/queue.service";
import type { GenerationInput } from "../src/generation/types";
import { defaultColumns } from "../src/projects/template";
import { generationFixture } from "./generation-fixture";

function input(): GenerationInput {
  return {
    columns: defaultColumns(),
    memo: "",
    frames: [
      {
        id: randomUUID(),
        name: "주문",
        screenDocument: JSON.stringify({
          text: "최대 5개",
          textStyles: [{ decoration: "STRIKETHROUGH" }],
        }),
        imageStorageKeys: ["image"],
      },
    ],
    featureGroups: [],
    screenStructure: [],
    viewpoints: [],
    existingCases: [],
    styleExamples: [],
    pi: readPiConfig({ AI_GENERATION_ENGINE: "pi" }),
  };
}
function row(source: GenerationInput, title = "주문 조회") {
  return Object.fromEntries(
    source.columns
      .filter(
        (c) =>
          c.systemKey === "title" ||
          ["steps", "expected"].includes(c.presetKey ?? ""),
      )
      .map((c) => [
        c.id,
        c.systemKey === "title"
          ? title
          : c.presetKey === "steps"
            ? "1. [조회] 선택"
            : "- 주문이 조회되는지 확인",
      ]),
  );
}
async function call(workspace: PiWorkspace, name: string, args: unknown) {
  const tool = workspace.tools().find((t) => t.name === name);
  assert.ok(tool);
  return tool.execute(randomUUID(), args, undefined, undefined, {} as never);
}

test("pi 도구는 선택한 화면과 기준 문서만 읽고, 초안을 수정하며 QA 기록 쓰기를 거부한다", async () => {
  const source = input(),
    state = emptyPiDraft();
  const workspace = new PiWorkspace(
    source,
    state,
    async () => ({ data: "test", mimeType: "image/png" }),
    async () => {},
  );
  await assert.rejects(
    call(workspace, "read_frame", { frameId: randomUUID() }),
  );
  const raw = await call(workspace, "read_frame", {
    frameId: source.frames[0].id,
  });
  assert.match(JSON.stringify(raw), /STRIKETHROUGH/);
  await call(workspace, "save_cases", {
    cases: [{ key: "order-1", values: row(source) }],
  });
  await call(workspace, "save_cases", {
    cases: [{ key: "order-1", values: row(source, "주문 조회 수정") }],
  });
  assert.equal(workspace.output().cases.length, 1);
  const qa = source.columns.find((c) => c.presetKey === "qa_result");
  assert.ok(qa);
  await assert.rejects(
    call(workspace, "save_cases", {
      cases: [{ key: "bad", values: { ...row(source), [qa.id]: "PASS" } }],
    }),
  );
  assert.equal(workspace.output().cases.length, 1);
  await call(workspace, "complete", {
    audit:
      "원문과 수행 절차, 예상 결과를 대조하여 주문 조회 검증을 마쳤습니다.",
  });
  assert.equal(state.complete, true);
});

test("기준 XLSX는 원문·셀 위치·병합을 보존하며 지정한 시트만 등록한다", async () => {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("기준 QA");
  sheet.addRow(["테스트 케이스", "수행 절차", "예상 결과"]);
  sheet.addRow(["주문 조회", "1. [검색] 선택", "주문이 표시되는지 확인"]);
  sheet.addRow(["", "2. [초기화] 선택", "검색 조건이 초기화되는지 확인"]);
  sheet.mergeCells("A2:A3");
  book.addWorksheet("제외").addRow(["다른 자료"]);
  const bytes = Buffer.from(await book.xlsx.writeBuffer());
  const document = await readQaReference(bytes, "업무 양식.xlsx", ["기준 QA"]);
  assert.equal(document.sheets.length, 1);
  assert.equal(document.sheets[0].rows[2].cells.A3, "주문 조회");
  assert.deepEqual(document.sheets[0].merges, ["A2:A3"]);
  await assert.rejects(readQaReference(bytes, "업무 양식.xlsx", ["없는 시트"]));
});

test("pi 작업은 프로젝트 기준을 고정하고 설정 변경 후에도 같은 엔진으로 저장하며 중복 실행을 막는다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    f.app.get(QueueService).env.pi = readPiConfig({
      AI_GENERATION_ENGINE: "pi",
    });
    const reference = {
      name: "기준",
      sha256: "old",
      sheets: [
        {
          name: "QA",
          rows: [{ row: 1, cells: { A1: "기존 문체" } }],
          merges: [],
        },
      ],
    };
    await f.db
      .insert(projectQaReferences)
      .values({ projectId: set.project.id, document: reference });
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "주문 조회",
    });
    await f.db
      .update(projectQaReferences)
      .set({ document: { ...reference, sha256: "new" } })
      .where(eq(projectQaReferences.projectId, set.project.id));
    f.app.get(QueueService).env.pi = readPiConfig({});
    let runs = 0;
    f.app.get(PiGenerationService).execute = async (options) => {
      runs++;
      assert.equal(options.input.qaReference?.sha256, "old");
      const workspace = new PiWorkspace(
        options.input,
        options.state.draft,
        options.image,
        options.checkpoint,
      );
      await call(workspace, "read_reference", {});
      await call(workspace, "save_cases", {
        cases: [{ key: "order", values: row(options.input) }],
      });
      await call(workspace, "complete", {
        audit:
          "프로젝트 기준 문서와 메모를 대조하고 조회 시나리오 작성을 완료했습니다.",
      });
      return workspace.output();
    };
    await f.runner.process(jobId, "screens");
    await f.runner.process(jobId, "cases");
    assert.equal(runs, 1);
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.addedCount,
      1,
    );
    const saved = await f.generation.store.cases(set.id);
    const qa = set.columns.find((c) => c.presetKey === "qa_result");
    assert.ok(qa);
    assert.equal(saved[0].values[qa.id], null);
    assert.ok(
      (
        await f.db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.jobId, jobId))
      ).every((s) => s.input === null && s.output === null),
    );
  } finally {
    await f.close();
  }
});

test("pi 실행 제한 시 작성된 케이스를 보존하고 미완료 범위를 확인 필요로 남긴다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    f.app.get(QueueService).env.pi = readPiConfig({
      AI_GENERATION_ENGINE: "pi",
    });
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "주문 조회와 취소",
    });
    f.app.get(PiGenerationService).execute = async (options) => {
      const workspace = new PiWorkspace(
        options.input,
        options.state.draft,
        options.image,
        options.checkpoint,
      );
      await call(workspace, "save_cases", {
        cases: [{ key: "order", values: row(options.input) }],
      });
      throw new AiFailure("AI_AGENT_BUDGET", false);
    };
    await f.runner.process(jobId, "screens");
    const current = await f.generation.current(set.id, f.accountId);
    assert.equal(current?.status, "succeeded");
    assert.equal(current?.addedCount, 1);
    assert.equal(current?.reviewCount, 1);
  } finally {
    await f.close();
  }
});

test("완료 초안 체크포인트로 복구하면 모델을 다시 호출하지 않는다", async () => {
  const source = input(),
    state = newCheckpoint();
  state.draft.complete = true;
  state.draft.cases = [{ key: "order", values: row(source) }];
  const { runPi } = await import("../src/generation/pi/runtime");
  const result = await runPi({
    input: source,
    state,
    signal: new AbortController().signal,
    image: async () => {
      throw new Error("이미지 재조회 불필요");
    },
    usage: async () => {
      throw new Error("모델 재호출 불필요");
    },
    checkpoint: async () => {},
  });
  assert.equal(result.cases.length, 1);
});

test("pi 기본 설정은 pi를 사용하고 잘못된 예산을 거절한다", () => {
  assert.equal(readPiConfig({}).engine, "pi");
  assert.equal(readPiConfig({}).maxTokens, 1000000);
  assert.throws(() => readPiConfig({ AI_PI_MAX_TURNS: "0" }));
  assert.throws(() => readPiConfig({ AI_GENERATION_ENGINE: "unknown" }));
});

test("저장 장애는 부분 성공으로 바꾸지 않으며 최초 큐 작업 재시도로 초안을 복구한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    f.app.get(QueueService).env.pi = readPiConfig({
      AI_GENERATION_ENGINE: "pi",
    });
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "주문",
    });
    let runs = 0;
    f.app.get(PiGenerationService).execute = async (options) => {
      const workspace = new PiWorkspace(
        options.input,
        options.state.draft,
        options.image,
        options.checkpoint,
      );
      if (++runs === 1) {
        await call(workspace, "save_cases", {
          cases: [{ key: "order", values: row(options.input) }],
        });
        throw new Error("일시적인 DB 저장 장애");
      }
      assert.equal(options.state.draft.cases.length, 1);
      await call(workspace, "complete", {
        audit:
          "중단 전에 저장된 초안을 복구하여 원문과 결과 검토를 완료했습니다.",
      });
      return workspace.output();
    };
    await assert.rejects(
      f.runner.process(jobId, "screens"),
      PiInfrastructureError,
    );
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.status,
      "running",
    );
    assert.equal((await f.generation.store.cases(set.id)).length, 0);
    await f.runner.process(jobId, "screens");
    assert.equal(runs, 2);
    assert.equal((await f.generation.store.cases(set.id)).length, 1);
  } finally {
    await f.close();
  }
});

test("미완료 확인 항목은 업로드 정리 후에도 긴 화면 원문을 모두 보존한다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    f.app.get(QueueService).env.pi = readPiConfig({
      AI_GENERATION_ENGINE: "pi",
    });
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "조회",
    });
    const frame = {
      ...input().frames[0],
      screenDocument: `${"원문".repeat(12000)}마지막 요구사항`,
    };
    f.app.get(PiGenerationService).execute = async (options) => {
      options.input.frames = [frame];
      options.state.draft.cases.push({
        key: "order",
        values: row(options.input),
      });
      throw new AiFailure("AI_AGENT_BUDGET", false);
    };
    await f.runner.process(jobId, "screens");
    const reviews = await f.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.testSetId, set.id));
    const combined = reviews.map((r) => r.screenDescription).join("");
    assert.ok(combined.includes("마지막 요구사항"));
    assert.equal(combined.split("원문").length - 1, 12000);
    assert.ok(reviews.every((r) => r.screenDescription.length <= 20000));
  } finally {
    await f.close();
  }
});

test("대화 요약 사용량도 예산과 사용량 기록에 한 번 포함한다", async () => {
  const state = newCheckpoint();
  let calls = 0;
  const options = {
    state,
    usage: async () => {
      calls++;
    },
  } as unknown as PiRunOptions;
  const entries = [
    { type: "compaction", id: "summary-1", usage: { totalTokens: 123 } },
  ] as unknown as PiRunOptions["state"]["entries"];
  await accountSessionUsage(options, entries);
  await accountSessionUsage(options, entries);
  assert.equal(state.tokens, 123);
  assert.equal(calls, 1);
});

test("최종 저장 장애 후 완료 초안으로 재시도하며 모델을 재호출하지 않는다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    f.app.get(QueueService).env.pi = readPiConfig({
      AI_GENERATION_ENGINE: "pi",
    });
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "주문 조회",
    });
    const service = f.app.get(PiGenerationService);
    let generated = 0;
    service.execute = async (options) => {
      if (options.state.draft.complete) {
        const { runPi } = await import("../src/generation/pi/runtime");
        return runPi(options);
      }
      generated++;
      const workspace = new PiWorkspace(
        options.input,
        options.state.draft,
        options.image,
        options.checkpoint,
      );
      await call(workspace, "save_cases", {
        cases: [{ key: "order", values: row(options.input) }],
      });
      await call(workspace, "complete", {
        audit:
          "원문과 생성 결과를 대조하여 주문 조회 시나리오 검토를 마쳤습니다.",
      });
      return workspace.output();
    };
    const finish = f.runner.finish.bind(f.runner);
    f.runner.finish = async () => {
      throw new Error("최종 저장 연결 끊김");
    };
    await assert.rejects(
      f.runner.process(jobId, "screens"),
      PiInfrastructureError,
    );
    assert.equal(
      (await f.generation.current(set.id, f.accountId))?.status,
      "running",
    );
    f.runner.finish = finish;
    await f.runner.process(jobId, "screens");
    assert.equal(generated, 1);
    assert.equal((await f.generation.store.cases(set.id)).length, 1);
  } finally {
    await f.close();
  }
});

test("요약 사용량 저장 실패 후 재시도할 때 유실하거나 중복 합산하지 않는다", async () => {
  const state = newCheckpoint();
  let attempts = 0;
  const options = {
    state,
    usage: async () => {
      if (++attempts === 1) throw new Error("저장 장애");
    },
  } as unknown as PiRunOptions;
  const entries = [
    { type: "compaction", id: "summary", usage: { totalTokens: 123 } },
  ] as unknown as PiRunOptions["state"]["entries"];
  await assert.rejects(accountSessionUsage(options, entries));
  assert.equal(state.tokens, 0);
  await accountSessionUsage(options, entries);
  await accountSessionUsage(options, entries);
  assert.equal(state.tokens, 123);
  assert.equal(attempts, 2);
});

test("완료 체크포인트의 영수증 저장 장애는 재시도 대상으로 남고 모델을 호출하지 않는다", async () => {
  const source = input(),
    state = newCheckpoint();
  state.draft.complete = true;
  state.draft.cases = [{ key: "order", values: row(source) }];
  state.observations = [{ id: randomUUID(), startedAt: Date.now() }];
  const { runPi } = await import("../src/generation/pi/runtime");
  const options: PiRunOptions = {
    input: source,
    state,
    signal: new AbortController().signal,
    checkpoint: async () => {},
    image: async () => {
      throw new Error("이미지 재조회 불필요");
    },
    usage: async () => {
      throw new Error("모델 재호출 불필요");
    },
    observe: async () => {
      throw new Error("영수증 DB 저장 장애");
    },
  };
  await assert.rejects(runPi(options), PiInfrastructureError);
  let receipts = 0;
  const output = await runPi({
    ...options,
    observe: async () => {
      receipts++;
    },
  });
  assert.equal(receipts, 1);
  assert.equal(output.cases.length, 1);
});

test("재시도해도 최초 실행의 시간 예산을 초기화하지 않는다", async () => {
  const source = input(),
    state = newCheckpoint();
  state.startedAt = Date.now() - (source.pi?.timeoutMs ?? 0) - 100;
  const { runPi } = await import("../src/generation/pi/runtime");
  await assert.rejects(
    runPi({
      input: source,
      state,
      signal: new AbortController().signal,
      checkpoint: async () => {},
      image: async () => {
        throw new Error("시간 만료 이후 조회 금지");
      },
      usage: async () => {
        throw new Error("시간 만료 이후 호출 금지");
      },
    }),
    (error: unknown) =>
      error instanceof AiFailure && error.code === "AI_AGENT_TIMEOUT",
  );
});
