import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq, inArray } from "drizzle-orm";
import { generationJobs } from "../src/database/schema";
import { GenerationWorker } from "../src/generation/generation.worker";
import { readPiConfig } from "../src/generation/pi/config";
import { PiGenerationService } from "../src/generation/pi/pi.service";
import type { PiRunOptions } from "../src/generation/pi/runtime";
import { PiWorkspace } from "../src/generation/pi/workspace";
import { AiFailure } from "../src/generation/providers/ai-provider";
import {
  GENERATION_QUEUE,
  QueueService,
} from "../src/generation/queue.service";
import { generationFixture } from "./generation-fixture";

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20000;
  while (!(await check())) {
    assert.ok(
      Date.now() < deadline,
      "대기열 작업이 제한 시간 안에 진행되어야 함",
    );
    await delay(50);
  }
}
async function generate(options: PiRunOptions) {
  const workspace = new PiWorkspace(
    options.input,
    options.state.draft,
    options.image,
    options.checkpoint,
  );
  const values = Object.fromEntries(
    options.input.columns
      .filter(
        (c) =>
          c.systemKey === "title" ||
          ["steps", "expected"].includes(c.presetKey ?? ""),
      )
      .map((c) => [
        c.id,
        c.systemKey === "title"
          ? options.input.memo
          : c.presetKey === "steps"
            ? "1. 조회 선택"
            : "조회 결과 확인",
      ]),
  );
  const save = workspace.tools().find((t) => t.name === "save_cases");
  assert.ok(save);
  await save.execute(
    randomUUID(),
    { cases: [{ key: "result", values }] },
    undefined,
    undefined,
    {} as never,
  );
  options.state.draft.complete = true;
  await options.checkpoint();
  return workspace.output();
}

test("실제 pg-boss에서 pi 5건을 접수하고 2건씩 실행하며 오래 기다린 작업과 개별 실패를 격리한다", {
  timeout: 40000,
}, async () => {
  const f = await generationFixture({ workers: true });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let active = 0,
    peak = 0;
  const runs = new Map<string, number>();
  try {
    f.app.get(QueueService).env.pi = readPiConfig({});
    f.app.get(PiGenerationService).execute = async (options) => {
      const memo = options.input.memo;
      runs.set(memo, (runs.get(memo) ?? 0) + 1);
      active++;
      peak = Math.max(peak, active);
      try {
        await gate;
        if (memo === "요청-2") throw new AiFailure("TEST_MODEL_FAILURE", false);
        return await generate(options);
      } finally {
        active--;
      }
    };
    const sets = await Promise.all(
      Array.from({ length: 5 }, () => f.makeSet()),
    );
    const requests = sets.map((_, i) => ({
      kind: "append" as const,
      memo: `요청-${i}`,
      clientRequestId: randomUUID(),
    }));
    // HTTP를 통한 접수부터 실제 워커와 최종 저장까지 검증한다.
    const jobs = await Promise.all(
      sets.map(async (set, i) => {
        const response = await fetch(
          `${f.base}/test-sets/${set.id}/generations`,
          {
            method: "POST",
            headers: { Cookie: f.cookie, "Content-Type": "application/json" },
            body: JSON.stringify(requests[i]),
          },
        );
        assert.equal(response.status, 202);
        return (await response.json()) as { jobId: string };
      }),
    );
    await until(async () => active === 2);
    const rows = await f.db
      .select()
      .from(generationJobs)
      .where(
        inArray(
          generationJobs.id,
          jobs.map((j) => j.jobId),
        ),
      );
    assert.equal(rows.filter((r) => r.status === "running").length, 2);
    const waiting = rows.filter((r) => r.status === "pending");
    assert.equal(waiting.length, 3);
    await f.db
      .update(generationJobs)
      .set({ expiresAt: new Date(0) })
      .where(
        inArray(
          generationJobs.id,
          waiting.map((r) => r.id),
        ),
      );
    await f.generation.recover(); // 중복 큐 전달과 과거 만료 시각이 결과에 영향을 주지 않아야 한다.
    const queuedCount = async () => {
      const items = await f.app
        .get(QueueService)
        .boss.findJobs<{ jobId: string }>(GENERATION_QUEUE);
      return items.filter(
        (item) =>
          jobs.some((job) => job.jobId === item.data.jobId) &&
          ["created", "retry", "active"].includes(item.state),
      ).length;
    };
    const beforeRecovery = await queuedCount();
    for (let i = 0; i < 20; i++) await f.generation.recover();
    assert.equal(
      await queuedCount(),
      beforeRecovery,
      "복구 스캔을 반복해도 큐 항목 수는 늘지 않아야 함",
    );
    const repeat = await f.generation.create(
      sets[0].id,
      f.accountId,
      requests[0],
    );
    assert.equal(repeat.jobId, jobs[0].jobId);
    release();
    await until(async () =>
      (
        await f.db
          .select()
          .from(generationJobs)
          .where(
            inArray(
              generationJobs.id,
              jobs.map((j) => j.jobId),
            ),
          )
      ).every((r) => ["completed", "failed"].includes(r.status)),
    );
    assert.equal(peak, 2);
    assert.equal(runs.size, 5);
    assert.ok([...runs.values()].every((n) => n === 1));
    for (let i = 0; i < sets.length; i++) {
      const [job] = await f.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobs[i].jobId));
      const cases = await f.generation.store.cases(sets[i].id);
      assert.equal(job.status, i === 2 ? "failed" : "completed");
      assert.equal(cases.length, i === 2 ? 0 : 1);
      if (i !== 2)
        assert.ok(Object.values(cases[0].values).includes(`요청-${i}`));
    }
  } finally {
    release();
    await f.close();
  }
});

test("워커가 없을 때 접수한 pi 요청은 시작 시 복구되어 모두 저장된다", {
  timeout: 40000,
}, async () => {
  const f = await generationFixture();
  try {
    const queue = f.app.get(QueueService);
    queue.env.pi = readPiConfig({});
    f.app.get(PiGenerationService).execute = generate;
    const sets = await Promise.all([f.makeSet(), f.makeSet(), f.makeSet()]);
    const jobs = await Promise.all(
      sets.map((set, i) =>
        f.generation.create(set.id, f.accountId, {
          kind: "append",
          memo: `복구-${i}`,
        }),
      ),
    );
    await f.db
      .update(generationJobs)
      .set({ expiresAt: new Date(0) })
      .where(
        inArray(
          generationJobs.id,
          jobs.map((j) => j.jobId),
        ),
      );
    queue.env.workersEnabled = true;
    queue.enqueue = QueueService.prototype.enqueue.bind(queue);
    await queue.onModuleInit();
    await f.app.get(GenerationWorker).onApplicationBootstrap();
    await until(async () =>
      (
        await f.db
          .select()
          .from(generationJobs)
          .where(
            inArray(
              generationJobs.id,
              jobs.map((j) => j.jobId),
            ),
          )
      ).every((j) => j.status === "completed"),
    );
    for (const set of sets)
      assert.equal((await f.generation.store.cases(set.id)).length, 1);
  } finally {
    await f.close();
  }
});
