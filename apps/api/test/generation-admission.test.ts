import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import test from "node:test";
import { eq } from "drizzle-orm";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import { readEnv } from "../src/config/env";
import { generationJobs, reviewItems } from "../src/database/schema";
import { GenerationService } from "../src/generation/generation.service";
import { QueueService } from "../src/generation/queue.service";
import { ReviewItemsService } from "../src/review-items/review-items.service";
import { TempUploadsService } from "../src/temp-uploads/temp-uploads.service";
import { TestSetsStore } from "../src/test-sets/test-sets.store";
import { generationFixture } from "./generation-fixture";

test("전역 한도와 공급자 관리 키 환경변수는 원본 범위를 검증한다", () => {
  const base = {
    DATABASE_URL: "postgresql://test@127.0.0.1/test",
    FILE_STORAGE_ROOT: tmpdir(),
    AI_PROVIDER: "fake",
  };
  assert.equal(readEnv(base).generationConcurrency, 2);
  assert.equal(readEnv(base).costSync?.intervalMs, 3600000);
  for (const value of ["0", "9", "1.5", "NaN", ""])
    assert.throws(() => readEnv({ ...base, AI_GENERATION_CONCURRENCY: value }));
  for (const value of ["59", "86401", "NaN"])
    assert.throws(() =>
      readEnv({ ...base, AI_COST_SYNC_INTERVAL_SECONDS: value }),
    );
  assert.equal(
    readEnv({
      ...base,
      AI_GENERATION_CONCURRENCY: "8",
      AI_COST_SYNC_INTERVAL_SECONDS: "60",
    }).costSync?.intervalMs,
    60000,
  );
  for (const [key, scope] of [
    ["OPENAI_ADMIN_KEY", "OPENAI_COST_PROJECT_ID"],
    ["ANTHROPIC_ADMIN_KEY", "ANTHROPIC_COST_WORKSPACE_ID"],
  ]) {
    assert.throws(() => readEnv({ ...base, [key]: "synthetic" }));
    assert.throws(() => readEnv({ ...base, [scope]: "proj_test" }));
    assert.throws(() =>
      readEnv({ ...base, [key]: "synthetic", [scope]: "bad scope" }),
    );
    assert.doesNotThrow(() =>
      readEnv({ ...base, [key]: "synthetic", [scope]: "valid_scope" }),
    );
  }
});

test("독립 API 풀의 동시 요청은 전역 한도를 공유하고 재전송은 같은 작업을 반환한다", {
  timeout: 30000,
}, async (t) => {
  const f = await generationFixture();
  const other = await createApp(f.config, f.lease.folder);
  other.get(QueueService).enqueue = async () => undefined;
  await other.init();
  const services = [f.generation, other.get(GenerationService)];
  try {
    const sets = await Promise.all([f.makeSet(), f.makeSet(), f.makeSet()]);
    const requests = sets.map(() => ({
      kind: "append" as const,
      memo: "동시 생성",
      clientRequestId: randomUUID(),
    }));
    const results = await Promise.allSettled(
      sets.map((set, i) =>
        services[i % 2].create(set.id, f.accountId, requests[i]),
      ),
    );
    const accepted = results.flatMap((r, index) =>
      r.status === "fulfilled" ? [{ index, ...r.value }] : [],
    );
    const rejected = results.findIndex((r) => r.status === "rejected");
    assert.equal(accepted.length, 2);
    assert.ok(rejected >= 0);
    const reason = results[rejected];
    assert.ok(
      reason.status === "rejected" &&
        reason.reason instanceof ApiError &&
        reason.reason.code === "GENERATION_CAPACITY" &&
        reason.reason.getStatus() === 429,
    );
    await f.db
      .update(generationJobs)
      .set({ status: "running" })
      .where(eq(generationJobs.id, accepted[0].jobId));
    const first = accepted[0];
    const repeats = await Promise.all(
      services.map((service) =>
        service.create(
          sets[first.index].id,
          f.accountId,
          requests[first.index],
        ),
      ),
    );
    assert.ok(repeats.every((r) => r.jobId === first.jobId));
    await assert.rejects(
      services[1].create(sets[first.index].id, f.accountId, {
        ...requests[first.index],
        memo: "다른 입력",
      }),
      (e) => e instanceof ApiError && e.code === "REQUEST_REUSED",
    );
    await assert.rejects(
      f.generation.create(sets[first.index].id, f.accountId, {
        kind: "append",
        memo: "새 요청",
      }),
      (e) =>
        e instanceof ApiError &&
        e.getStatus() === 409 &&
        e.code === "GENERATION_RUNNING",
    );
    const uploads = t.mock.method(
      f.app.get(TempUploadsService),
      "owned",
      async () => {
        throw new Error("입장 전 업로드를 읽음");
      },
    );
    const columns = t.mock.method(
      f.app.get(TestSetsStore),
      "columns",
      async () => {
        throw new Error("입장 전 양식을 읽음");
      },
    );
    const post = (path: string, body: unknown) =>
      fetch(`${f.base}${path}`, {
        method: "POST",
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    for (const body of [
      { kind: "initial", uploadId: randomUUID() },
      { kind: "append", memo: "설명" },
    ]) {
      const response = await post(
        `/test-sets/${sets[rejected].id}/generations`,
        body,
      );
      assert.equal(response.status, 429);
      const error = (
        (await response.json()) as { error: { code: string; message: string } }
      ).error;
      assert.equal(error.code, "GENERATION_CAPACITY");
      assert.equal(
        error.message,
        "현재 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.",
      );
    }
    const [item] = await f.db
      .insert(reviewItems)
      .values({
        testSetId: sets[rejected].id,
        screenDescription: "화면",
        questions: [],
        draft: {},
      })
      .returning();
    const rewriteResponse = await post(`/review-items/${item.id}/rewrite`, {
      answer: "답변",
      clientRequestId: randomUUID(),
    });
    assert.equal(rewriteResponse.status, 429);
    assert.equal(uploads.mock.callCount(), 0);
    assert.equal(columns.mock.callCount(), 0);
    uploads.mock.restore();
    columns.mock.restore();
    await f.generation.fail(first.jobId, "TEST_FINISHED");
    const rewriteRequest = { answer: "답변", clientRequestId: randomUUID() };
    const rewrites = await Promise.all([
      f.reviews.rewrite(item.id, f.accountId, rewriteRequest),
      other
        .get(ReviewItemsService)
        .rewrite(item.id, f.accountId, rewriteRequest),
    ]);
    assert.equal(rewrites[0].jobId, rewrites[1].jobId);
    const [itemAfter] = await f.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, item.id));
    assert.equal(itemAfter.status, "rewriting");
    await f.generation.fail(rewrites[0].jobId, "TEST_FINISHED");
    assert.equal(
      (await f.reviews.rewrite(item.id, f.accountId, rewriteRequest)).jobId,
      rewrites[0].jobId,
    );
    const retry = await services[1].create(
      sets[rejected].id,
      f.accountId,
      requests[rejected],
    );
    assert.ok(retry.jobId);
    await f.generation.fail(retry.jobId, "TEST_FINISHED");
    await f.generation.fail(accepted[1].jobId, "TEST_FINISHED");
    // 빈 한도에서도 같은 요청이 동시에 오면 한 작업만 만든다.
    const same = {
      kind: "append" as const,
      memo: "중복 입장",
      clientRequestId: randomUUID(),
    };
    const duplicates = await Promise.all(
      services.map((service) => service.create(sets[0].id, f.accountId, same)),
    );
    assert.equal(duplicates[0].jobId, duplicates[1].jobId);
    await f.generation.fail(duplicates[0].jobId, "TEST_FINISHED");
  } finally {
    await other.close();
    await f.close();
  }
});
