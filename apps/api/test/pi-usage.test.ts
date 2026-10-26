import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { eq } from "drizzle-orm";
import { aiCallUsage, generationSteps } from "../src/database/schema";
import { PiObservation } from "../src/generation/pi/observation";
import { AiUsageService } from "../src/generation/usage.service";
import { generationFixture } from "./generation-fixture";

test("pi는 실제 스트림의 캐시 쓰기·추론·모델·시간을 보존하고 같은 호출을 재집계하지 않는다", async () => {
  const f = await generationFixture();
  try {
    const set = await f.makeSet();
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "주문",
    });
    const [step] = await f.db
      .select()
      .from(generationSteps)
      .where(eq(generationSteps.jobId, jobId));
    const service = f.app.get(AiUsageService),
      target = { jobId, stepId: step.id, fake: false };
    const model = { provider: "openai" as const, model: "gpt-6.1-sol" };
    const call = { id: randomUUID(), startedAt: Date.now() - 2000 };
    await service.recordObserved(target, model, call);
    const receipt = new PiObservation(call.startedAt, performance.now() - 2000);
    receipt.headers({
      status: 200,
      headers: { "x-request-id": "request", authorization: "never-store" },
    });
    receipt.event({
      type: "response.completed",
      response: {
        id: "response",
        model: model.model,
        service_tier: "default",
        output: [{ text: "never-store" }],
        usage: {
          input_tokens: 1000,
          output_tokens: 100,
          input_tokens_details: { cached_tokens: 600, cache_write_tokens: 300 },
          output_tokens_details: { reasoning_tokens: 80 },
        },
      },
    });
    const observation = receipt.finish({
      stopReason: "stop",
    } as AssistantMessage);
    await service.recordObserved(target, model, { ...call, observation });
    await service.recordObserved(target, model, { ...call, observation });
    await service.recordObserved(target, model, call);
    const rows = await f.db
      .select()
      .from(aiCallUsage)
      .where(eq(aiCallUsage.stepId, step.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "completed");
    assert.equal(rows[0].inputTokens, 1000);
    assert.equal(rows[0].cacheWriteTokens, 300);
    assert.equal(rows[0].reasoningTokens, 80);
    assert.equal(Number(rows[0].calculatedCostUsd), 0.00201);
    assert.ok(Number(rows[0].durationMs) >= 2000);
    assert.equal(rows[0].requestId, "request");
    assert.ok(!JSON.stringify(rows).includes("never-store"));
    const [total] = await f.db
      .select()
      .from(generationSteps)
      .where(eq(generationSteps.id, step.id));
    assert.equal(total.inputTokens, 100);
    assert.equal(total.cacheCreationTokens, 300);
    assert.equal(Number(total.cost), 0.00201);
    const lost = { id: randomUUID(), startedAt: Date.now() };
    await service.recordObserved(target, model, lost);
    await service.markUnknown(jobId);
    const [missing] = await f.db
      .select()
      .from(aiCallUsage)
      .where(eq(aiCallUsage.id, lost.id));
    assert.equal(missing.status, "unknown");
    assert.equal(missing.calculatedCostUsd, null);
    const [uncertain] = await f.db
      .select()
      .from(generationSteps)
      .where(eq(generationSteps.id, step.id));
    assert.equal(uncertain.cost, null);
  } finally {
    await f.close();
  }
});

test("pi는 최종 usage 또는 서비스 등급을 확인하지 못한 호출을 무료로 기록하지 않는다", async () => {
  const receipt = new PiObservation(Date.now());
  receipt.headers({ status: 200, headers: {} });
  const observation = receipt.finish({
    stopReason: "error",
    responseModel: "gpt-6.1-sol",
  } as AssistantMessage);
  assert.equal(observation.usageComplete, false);
  assert.equal(observation.usage, undefined);
  assert.equal(observation.status, "failed");
});
