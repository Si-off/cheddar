import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import {
  aiCallUsage,
  generationJobs,
  generationSteps,
  reviewItems,
} from "../src/database/schema";
import { costFor, pricingFor } from "../src/generation/pricing";
import {
  AiFailure,
  type AiRequest,
  type Usage,
} from "../src/generation/providers/ai-provider";
import { AnthropicProvider } from "../src/generation/providers/anthropic";
import { DEFINITIONS } from "../src/generation/steps";
import type { GenerationInput } from "../src/generation/types";
import { money, normalizeUsage } from "../src/generation/usage";
import { AiUsageService } from "../src/generation/usage.service";
import { generationFixture } from "./generation-fixture";

test("사용량은 허용된 숫자만 저장하고 캐시와 추론을 중복 계산하지 않는다", () => {
  const usage = normalizeUsage("openai", {
    input_tokens: 1000,
    output_tokens: 200,
    input_tokens_details: { cached_tokens: 400 },
    output_tokens_details: { reasoning_tokens: 150 },
    confidential: "비밀",
  });
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.reasoningTokens, 150);
  assert.ok(!JSON.stringify(usage.raw).includes("비밀"));
  assert.equal(
    costFor("openai:gpt-5.4", {
      inputTokens: 600,
      outputTokens: 200,
      cacheReadTokens: 400,
      cacheCreationTokens: 0,
    }),
    "0.0046000000",
  );
  // 새로 쓰는 GPT 모델도 비용을 계산하고, 272K 입력을 넘으면 장문 가격을 쓴다
  const long = {
    inputTokens: 1000000,
    outputTokens: 1000000,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  assert.equal(costFor("openai:gpt-6-luna", long), "0.9500000000");
  assert.equal(costFor("openai:gpt-5.6-terra", long), "22.0000000000");
  assert.equal(
    costFor("openai:gpt-5.6-terra", { ...long, inputTokens: 200000 }),
    "12.4000000000",
  );
  for (const raw of [
    undefined,
    {},
    { input_tokens: -1, output_tokens: 0 },
    {
      input_tokens: 10,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 11 },
    },
  ])
    assert.equal(normalizeUsage("openai", raw).known, false);
  const anthropic = normalizeUsage("anthropic", {
    input_tokens: 100,
    output_tokens: 100,
    cache_read_input_tokens: 100000,
    cache_creation_input_tokens: 500,
  });
  assert.equal(anthropic.inputTokens, 100600);
  assert.equal(normalizeUsage("openai", undefined).cachedInputTokens, null);
  assert.equal(
    costFor("unknown", {
      inputTokens: 1,
      outputTokens: 2,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    }),
    null,
  );
});

test("Sonnet 비용은 캐시 읽기 0.10달러 단가로 계산한다", () => {
  const usage = {
    inputTokens: 32,
    outputTokens: 62160,
    cacheReadTokens: 1215401,
    cacheCreationTokens: 196967,
  };
  assert.equal(costFor("anthropic:claude-sonnet-5-5", usage), "1.2356216000");
  assert.equal(
    pricingFor("anthropic:claude-sonnet-5-5", usage)?.version,
    "2026-10-27",
  );
});

test("공급자 비용의 센트, 작은 달러와 크레딧 변환은 정밀도를 보존한다", () => {
  assert.equal(money("123.78912", true), "1.237891200000");
  assert.equal(money(1.2345e-7), "0.000000123450");
  assert.equal(money("-0.25"), "-0.250000000000");
  assert.equal(money("0.062551042553524"), "0.062551042553524");
  for (const value of ["NaN", "Infinity", null, "1e200"])
    assert.throws(() => money(value));
});

test("실제 PostgreSQL 호출 계측은 모든 시도와 종료를 보존한다", {
  timeout: 30000,
}, async (t) => {
  const f = await generationFixture();
  const set = await f.makeSet();
  const original = f.providers.fake.generate.bind(f.providers.fake);
  const start = async () => {
    const { jobId } = await f.generation.create(set.id, f.accountId, {
      kind: "append",
      memo: "입력 비밀",
    });
    const [snapshot] = await f.db
      .select()
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, jobId),
          eq(generationSteps.stage, "context"),
        ),
      );
    return { jobId, context: snapshot.input as GenerationInput };
  };
  const calls = (jobId: string) =>
    f.db
      .select()
      .from(aiCallUsage)
      .where(eq(aiCallUsage.jobId, jobId))
      .orderBy(aiCallUsage.startedAt);
  try {
    await t.test(
      "재개 시 중단된 호출은 unknown이고 이후 성공해도 단계 비용은 미확인",
      async () => {
        const { jobId } = await start();
        const [step] = await f.db
          .insert(generationSteps)
          .values({
            jobId,
            stage: "screens",
            workKey: "memo",
            status: "running",
            attempts: 1,
          })
          .returning();
        await f.db.insert(aiCallUsage).values({
          id: randomUUID(),
          jobId,
          stepId: step.id,
          provider: "fake",
          requestedModel: "fake",
          startedAt: new Date(),
        });
        await f.runner.process(jobId, "screens");
        const rows = await calls(jobId);
        assert.deepEqual(
          rows.map((row) => row.status),
          ["unknown", "completed"],
        );
        assert.equal(rows[0].durationMs, null);
        const [sum] = await f.db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.id, step.id));
        assert.equal(sum.status, "completed");
        assert.equal(sum.cost, null);
        await f.generation.fail(jobId, "TEST_FINISHED");
      },
    );
    await t.test(
      "새 요청은 만료한 이전 작업을 정리하고 입력을 다시 등록할 수 있음",
      async () => {
        const { jobId } = await start();
        const [step] = await f.db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.jobId, jobId));
        await f.db.insert(aiCallUsage).values({
          id: randomUUID(),
          jobId,
          stepId: step.id,
          provider: "fake",
          requestedModel: "fake",
          startedAt: new Date(),
        });
        await f.db
          .update(generationJobs)
          .set({ status: "running", expiresAt: new Date(Date.now() - 1000) })
          .where(eq(generationJobs.id, jobId));
        const next = await start();
        assert.notEqual(next.jobId, jobId);
        assert.equal((await calls(jobId))[0].status, "unknown");
        const [expired] = await f.db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, jobId));
        assert.equal(expired.status, "failed");
        await f.generation.fail(next.jobId, "TEST_FINISHED");
      },
    );
    await t.test(
      "재시도와 1회 수정 요청은 각각 한 행이고 단계 합계와 일치",
      async () => {
        // 캐시 쓰기 계측은 이를 지원하는 공급자로 고정한다. 제품 기본 모델과 무관하다.
        const previousModel = f.config.ai.models.screens;
        f.config.ai.models.screens = {
          provider: "anthropic",
          model: "claude-haiku-5-5",
          effort: "low",
        };
        const { jobId, context } = await start();
        let count = 0;
        f.providers.fake.generate = async (r) => {
          count++;
          const rows = await calls(jobId);
          assert.equal(
            rows.filter((row) => row.status === "running").length,
            1,
          );
          const usage: Usage = {
            inputTokens: count * 10,
            outputTokens: count * 2,
            cacheReadTokens: count * 3,
            cacheCreationTokens: count * 4,
          };
          if (count === 1) throw new AiFailure("AI_UNAVAILABLE", true, usage);
          return {
            ...(await original(r)),
            text: count === 2 ? "출력 비밀" : (await original(r)).text,
            usage,
          };
        };
        try {
          await f.runner.step(jobId, "screens", "memo", context, {});
          await f.runner.step(jobId, "screens", "memo", context, {});
          assert.equal(count, 3);
          const rows = await calls(jobId);
          assert.deepEqual(
            rows.map((r) => r.status),
            ["failed", "completed", "completed"],
          );
          const [step] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, rows[0].stepId as string));
          assert.equal(step.attempts, 2);
          assert.equal(step.repairCount, 1);
          assert.equal(step.inputTokens, 60);
          assert.equal(step.outputTokens, 12);
          assert.equal(step.cacheReadTokens, 18);
          assert.equal(step.cacheCreationTokens, 24);
          assert.equal(
            rows.reduce(
              (sum, r) =>
                sum +
                (r.inputTokens ?? 0) -
                (r.cachedInputTokens ?? 0) -
                (r.cacheWriteTokens ?? 0),
              0,
            ),
            step.inputTokens,
          );
          assert.equal(
            Number(step.cost),
            rows.reduce((sum, r) => sum + Number(r.calculatedCostUsd), 0),
          );
          assert.ok(
            rows.every(
              (r) => r.finishedAt && (r.durationMs ?? -1) >= 0 && r.usageKnown,
            ),
          );
          assert.doesNotMatch(JSON.stringify(rows), /입력 비밀|출력 비밀/);
        } finally {
          f.config.ai.models.screens = previousModel;
          f.providers.fake.generate = original;
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "잘림, 거절, 검증 실패와 통신 실패도 실제 사용량만 합산",
      async () => {
        const { jobId, context } = await start();
        let count = 0;
        f.providers.fake.generate = async () => {
          count++;
          throw new AiFailure(
            count === 1 ? "AI_MAX_TOKENS" : "AI_REFUSAL",
            count === 1,
            {
              inputTokens: 7,
              outputTokens: 3,
              cacheReadTokens: 2,
              cacheCreationTokens: 1,
            },
          );
        };
        try {
          await assert.rejects(
            f.runner.step(jobId, "screens", "memo", context, {}),
            (e) => e instanceof AiFailure && e.code === "AI_REFUSAL",
          );
          const rows = await calls(jobId);
          assert.equal(rows.length, 2);
          assert.ok(rows.every((r) => r.status === "failed" && r.usageKnown));
          const [step] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, rows[0].stepId as string));
          assert.equal(step.inputTokens, 14);
          assert.equal(step.outputTokens, 6);
        } finally {
          f.providers.fake.generate = original;
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
        const other = await start();
        f.providers.fake.generate = async () => ({
          text: "형식 오류",
          usage: {
            inputTokens: 5,
            outputTokens: 2,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
          },
        });
        try {
          await assert.rejects(
            f.runner.step(other.jobId, "screens", "memo", other.context, {}),
            (e) => e instanceof AiFailure && e.code === "AI_OUTPUT_INVALID",
          );
          const rows = await calls(other.jobId);
          assert.equal(rows.length, 2);
          const [step] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, rows[0].stepId as string));
          assert.equal(step.inputTokens, 10);
          assert.equal(step.outputTokens, 4);
        } finally {
          f.providers.fake.generate = original;
          await f.generation.fail(other.jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "호출 당시 단가, 미확인 모델과 사용량, 알 수 없는 비용의 합계",
      async () => {
        const { jobId, context } = await start();
        const [step] = await f.db
          .insert(generationSteps)
          .values({ jobId, stage: "screens", workKey: "가격" })
          .returning();
        const service = f.app.get(AiUsageService);
        const request: AiRequest = {
          definition: DEFINITIONS.screens,
          model: { provider: "openai", model: "gpt-5.4", effort: "high" },
          schema: {},
          context,
          sourceData: {},
          images: [],
        };
        const usage = {
          inputTokens: 600,
          outputTokens: 200,
          cacheReadTokens: 400,
          cacheCreationTokens: 0,
        };
        const target = { jobId, stepId: step.id, fake: false };
        try {
          await service.generate(
            target,
            {
              generate: async () => ({
                text: "출력 비밀",
                usage,
                observation: {
                  usage: {
                    input_tokens: 1000,
                    output_tokens: 200,
                    input_tokens_details: { cached_tokens: 400 },
                    confidential: "비밀",
                  },
                  responseId: "response-test",
                  requestId: "request-test",
                  responseModel: "gpt-5.4",
                },
              }),
            },
            request,
          );
          let rows = await calls(jobId);
          assert.equal(rows[0].calculatedCostUsd, "0.004600000000");
          assert.equal(
            (rows[0].pricing as { version: string }).version,
            "2026-10-20",
          );
          assert.doesNotMatch(JSON.stringify(rows), /비밀/);
          await service.generate(
            target,
            { generate: async () => ({ text: "", usage }) },
            {
              ...request,
              model: { provider: "openai", model: "unknown", effort: "high" },
            },
          );
          await assert.rejects(
            service.generate(
              target,
              {
                generate: async () => {
                  throw new AiFailure("AI_REQUEST_FAILED", false);
                },
              },
              request,
            ),
          );
          await service.generate(
            target,
            { generate: async () => ({ text: "", usage }) },
            request,
          );
          rows = await calls(jobId);
          assert.equal(rows[1].calculatedCostUsd, null);
          assert.equal(rows[2].usageKnown, false);
          assert.equal(rows[2].inputTokens, null);
          assert.equal(rows[2].calculatedCostUsd, null);
          const [sum] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, step.id));
          assert.equal(sum.inputTokens, 1800);
          assert.equal(sum.cost, null);
        } finally {
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "Anthropic 스트림 실패는 부분 사용량을 보존하고 최종 사용량이 없으면 비용은 미확인",
      async () => {
        const { jobId, context } = await start();
        const service = f.app.get(AiUsageService);
        const request: AiRequest = {
          definition: DEFINITIONS.screens,
          model: {
            provider: "anthropic",
            model: "claude-haiku-5-5",
            effort: "low",
          },
          schema: {},
          context,
          sourceData: {},
          images: [],
        };
        try {
          for (const finalUsage of [false, true]) {
            const [step] = await f.db
              .insert(generationSteps)
              .values({
                jobId,
                stage: "screens",
                workKey: `스트림-${finalUsage}`,
              })
              .returning();
            const events = [
              {
                type: "message_start",
                message: {
                  id: "msg_partial",
                  type: "message",
                  role: "assistant",
                  model: "claude-haiku-5-5",
                  content: [],
                  stop_reason: null,
                  stop_sequence: null,
                  usage: {
                    input_tokens: 100,
                    output_tokens: 1,
                    cache_read_input_tokens: 30,
                    cache_creation_input_tokens: 10,
                  },
                },
              },
              {
                type: "content_block_start",
                index: 0,
                content_block: { type: "text", text: "" },
              },
              {
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: "부분 출력 비밀" },
              },
              ...(finalUsage
                ? [
                    {
                      type: "message_delta",
                      delta: { stop_reason: "end_turn", stop_sequence: null },
                      usage: { output_tokens: 200 },
                    },
                  ]
                : []),
              {
                type: "error",
                error: {
                  type: "overloaded_error",
                  message: "합성 스트림 오류",
                },
              },
            ];
            const provider = new AnthropicProvider(
              new Anthropic({
                apiKey: "synthetic",
                maxRetries: 0,
                fetch: async () =>
                  new Response(
                    events
                      .map(
                        (e) =>
                          `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`,
                      )
                      .join(""),
                    {
                      headers: {
                        "content-type": "text/event-stream",
                        "request-id": "req_partial",
                      },
                    },
                  ),
              }),
            );
            await assert.rejects(
              service.generate(
                { jobId, stepId: step.id, fake: false },
                provider,
                request,
              ),
              (error) => error instanceof AiFailure,
            );
            const [call] = await f.db
              .select()
              .from(aiCallUsage)
              .where(eq(aiCallUsage.stepId, step.id));
            assert.equal(call.status, "failed");
            assert.equal(call.requestId, "req_partial");
            assert.equal(call.responseId, "msg_partial");
            assert.equal(call.inputTokens, 140);
            assert.equal(call.outputTokens, finalUsage ? 200 : 1);
            assert.equal(call.usageKnown, finalUsage);
            assert.equal(call.calculatedCostUsd !== null, finalUsage);
            assert.equal(call.pricing !== null, finalUsage);
            assert.deepEqual(call.rawUsage, {
              input_tokens: 100,
              output_tokens: finalUsage ? 200 : 1,
              cache_read_input_tokens: 30,
              cache_creation_input_tokens: 10,
            });
            assert.doesNotMatch(JSON.stringify(call), /비밀|synthetic/);
            const [sum] = await f.db
              .select()
              .from(generationSteps)
              .where(eq(generationSteps.id, step.id));
            assert.equal(sum.cost !== null, finalUsage);
          }
        } finally {
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "단계 합계 저장 실패는 결과를 유지하고 다음 호출에서 누락된 토큰과 비용을 복구",
      async () => {
        const { jobId, context } = await start();
        const [step] = await f.db
          .insert(generationSteps)
          .values({ jobId, stage: "screens", workKey: "합계 복구" })
          .returning();
        const service = f.app.get(AiUsageService);
        const request: AiRequest = {
          definition: DEFINITIONS.screens,
          model: { provider: "openai", model: "gpt-5.4", effort: "high" },
          schema: {},
          context,
          sourceData: {},
          images: [],
        };
        const response = {
          text: "생성 결과",
          usage: {
            inputTokens: 600,
            outputTokens: 200,
            cacheReadTokens: 400,
            cacheCreationTokens: 0,
          },
        };
        const generate = () =>
          service.generate(
            { jobId, stepId: step.id, fake: false },
            { generate: async () => response },
            request,
          );
        let triggerInstalled = false;
        try {
          assert.equal(await generate(), response);
          await f.lease.database.pool.query(
            `CREATE FUNCTION usage_totals_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '합계 저장 비밀'; END $$`,
          );
          await f.lease.database.pool.query(
            `CREATE TRIGGER usage_totals_test_reject BEFORE UPDATE ON generation_steps FOR EACH ROW WHEN (NEW.id = '${step.id}'::uuid AND NEW.input_tokens IS NOT NULL) EXECUTE FUNCTION usage_totals_test_reject()`,
          );
          triggerInstalled = true;
          assert.equal(await generate(), response);
          let rows = await calls(jobId);
          assert.equal(rows.length, 2);
          assert.ok(
            rows.every(
              (row) => row.usageKnown && row.calculatedCostUsd !== null,
            ),
          );
          const [unknown] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, step.id));
          assert.equal(unknown.cost, null);
          assert.equal(unknown.inputTokens, null);
          assert.equal(unknown.outputTokens, null);
          await f.lease.database.pool.query(
            "DROP TRIGGER usage_totals_test_reject ON generation_steps",
          );
          triggerInstalled = false;
          assert.equal(await generate(), response);
          rows = await calls(jobId);
          assert.equal(rows.length, 3);
          const [sum] = await f.db
            .select()
            .from(generationSteps)
            .where(eq(generationSteps.id, step.id));
          assert.equal(sum.inputTokens, 1800);
          assert.equal(sum.outputTokens, 600);
          assert.equal(sum.cacheReadTokens, 1200);
          assert.equal(sum.cacheCreationTokens, 0);
          assert.equal(sum.cost, "0.0138000000");
          assert.equal(
            Number(sum.cost),
            rows.reduce(
              (total, row) => total + Number(row.calculatedCostUsd),
              0,
            ),
          );
        } finally {
          if (triggerInstalled)
            await f.lease.database.pool.query(
              "DROP TRIGGER usage_totals_test_reject ON generation_steps",
            );
          await f.lease.database.pool.query(
            "DROP FUNCTION IF EXISTS usage_totals_test_reject()",
          );
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "계측 저장 오류가 성공 결과나 원래 제공자 오류를 바꾸지 않음",
      async (st) => {
        const { jobId, context } = await start();
        const logs: string[] = [];
        st.mock.method(process.stderr, "write", (chunk: unknown) => {
          logs.push(String(chunk));
          return true;
        });
        // 테스트 작업만 거부한다. 본문이나 DB 오류 메시지는 로그에 남으면 안 된다.
        await f.lease.database.pool.query(
          `CREATE FUNCTION usage_test_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '저장 비밀'; END $$`,
        );
        await f.lease.database.pool.query(
          `CREATE TRIGGER usage_test_reject BEFORE INSERT OR UPDATE ON ai_call_usage FOR EACH ROW WHEN (NEW.job_id = '${jobId}'::uuid) EXECUTE FUNCTION usage_test_reject()`,
        );
        await f.lease.database.pool.query(
          `CREATE TRIGGER usage_step_test_reject BEFORE UPDATE ON generation_steps FOR EACH ROW WHEN (NEW.job_id = '${jobId}'::uuid AND NEW.input_tokens IS DISTINCT FROM OLD.input_tokens) EXECUTE FUNCTION usage_test_reject()`,
        );
        try {
          await f.runner.step(jobId, "screens", "memo", context, {});
          const [step] = await f.db
            .select()
            .from(generationSteps)
            .where(
              and(
                eq(generationSteps.jobId, jobId),
                eq(generationSteps.stage, "screens"),
              ),
            );
          assert.equal(step.status, "completed");
          assert.equal(step.inputTokens, null);
          const request: AiRequest = {
            definition: DEFINITIONS.screens,
            model: f.providers.config.models.screens,
            schema: {},
            context,
            sourceData: {},
            images: [],
          };
          await assert.rejects(
            f.app.get(AiUsageService).generate(
              { jobId, stepId: step.id, fake: true },
              {
                generate: async () => {
                  throw new AiFailure("AI_REFUSAL", false);
                },
              },
              request,
            ),
            (e) => e instanceof AiFailure && e.code === "AI_REFUSAL",
          );
          assert.ok(logs.length >= 4);
          assert.doesNotMatch(logs.join(""), /비밀|EXCEPTION/);
          assert.ok(logs.every((log) => JSON.parse(log).jobId === jobId));
        } finally {
          await f.lease.database.pool.query(
            "DROP TRIGGER usage_test_reject ON ai_call_usage",
          );
          await f.lease.database.pool.query(
            "DROP TRIGGER usage_step_test_reject ON generation_steps",
          );
          await f.lease.database.pool.query(
            "DROP FUNCTION usage_test_reject()",
          );
          await f.generation.fail(jobId, "TEST_FINISHED");
        }
      },
    );
    await t.test(
      "성공과 실패 작업은 종료 시각과 전체 실행 시간을 저장",
      async () => {
        const { jobId } = await start();
        for (const stage of ["screens", "flows", "cases", "finish"] as const)
          await f.runner.process(jobId, stage);
        const [job] = await f.db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, jobId));
        assert.equal(job.status, "completed");
        assert.ok(job.finishedAt && (job.durationMs ?? -1) >= 0);
        const other = await start();
        await f.generation.fail(other.jobId, "TEST_FAILED");
        const [failed] = await f.db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, other.jobId));
        assert.ok(failed.finishedAt && (failed.durationMs ?? -1) >= 0);
      },
    );
    await t.test(
      "다시 작성 호출도 계측하고 중단된 작업 만료 시 running은 unknown",
      async () => {
        const [item] = await f.db
          .insert(reviewItems)
          .values({
            testSetId: set.id,
            screenDescription: "화면",
            questions: [],
            draft: {},
          })
          .returning();
        const { jobId } = await f.reviews.rewrite(item.id, f.accountId, {
          answer: "답변",
        });
        await f.runner.process(jobId, "rewrite");
        assert.equal((await calls(jobId)).length, 1);
        const [finished] = await f.db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, jobId));
        assert.equal(finished.status, "completed");
        assert.ok(finished.finishedAt && (finished.durationMs ?? -1) >= 0);
        const other = await start();
        const [step] = await f.db
          .select()
          .from(generationSteps)
          .where(eq(generationSteps.jobId, other.jobId));
        const callId = randomUUID();
        await f.db.insert(aiCallUsage).values({
          id: callId,
          jobId: other.jobId,
          stepId: step.id,
          provider: "fake",
          requestedModel: "fake",
          startedAt: new Date(),
        });
        await f.db
          .update(generationJobs)
          .set({ status: "running", expiresAt: new Date(Date.now() - 1000) })
          .where(eq(generationJobs.id, other.jobId));
        const lease = await f.lease.database.pool.connect();
        try {
          await lease.query("select pg_advisory_lock(5105, hashtext($1))", [
            other.jobId,
          ]);
          await f.generation.expireJobs();
          assert.equal(
            (await calls(other.jobId))[0].status,
            "running",
            "실행 잠금을 가진 작업은 만료시키지 않는다",
          );
        } finally {
          await lease.query("select pg_advisory_unlock(5105, hashtext($1))", [
            other.jobId,
          ]);
          lease.release();
        }
        await f.generation.recover();
        assert.equal((await calls(other.jobId))[0].status, "unknown");
        const [expired] = await f.db
          .select()
          .from(generationJobs)
          .where(eq(generationJobs.id, other.jobId));
        assert.equal(expired.status, "failed");
        assert.equal(expired.errorCode, "GENERATION_EXPIRED");
        assert.ok(expired.finishedAt && (expired.durationMs ?? -1) >= 0);
      },
    );
  } finally {
    f.providers.fake.generate = original;
    await f.close();
  }
});
