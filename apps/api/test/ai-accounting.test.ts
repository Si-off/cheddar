import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { ApiEnv } from "../src/config/env";
import { generate, type PreparedInput } from "../src/generation/provider";
import { fetchCosts } from "../src/generation/provider-costs";
import { ProviderCostsService } from "../src/generation/provider-costs.service";
import {
  type CallObservation,
  estimateCost,
  money,
  normalizeUsage,
} from "../src/generation/usage";
import { openTestDatabase } from "./database";

test("usage pricing counts cached/write tokens once and reasoning within output", () => {
  const usage = normalizeUsage("openai", {
    input_tokens: 1000,
    output_tokens: 200,
    input_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 },
    output_tokens_details: { reasoning_tokens: 150 },
    confidential: "must not be recorded",
  });
  assert.equal(usage.inputTokens, 1000);
  assert.equal(usage.reasoningTokens, 150);
  assert.equal(JSON.stringify(usage.raw).includes("confidential"), false);
  const result = estimateCost("openai", "gpt-6-luna", usage);
  assert.equal(result?.cost, "0.000166500");
  assert.equal(result?.pricing.version, "2026-10-15");
  assert.equal(estimateCost("openai", "unknown-model", usage), null);
  assert.equal(estimateCost("openai", "gpt-6-luna", usage, "priority"), null);
  for (const raw of [
    undefined,
    {},
    { input_tokens: -1, output_tokens: 0 },
    {
      input_tokens: 10,
      output_tokens: 2,
      input_tokens_details: { cached_tokens: 11 },
    },
  ]) {
    const missing = normalizeUsage("openai", raw);
    assert.equal(missing.known, false);
    assert.equal(estimateCost("openai", "gpt-6-luna", missing), null);
  }
  assert.equal(normalizeUsage("openai", undefined).cachedInputTokens, null);
  assert.equal(normalizeUsage("openai", undefined).cacheWriteTokens, null);
});

test("Anthropic usage includes separate caches and prices all input at the long-context rate", () => {
  const raw = {
    input_tokens: 100,
    output_tokens: 100,
    cache_read_input_tokens: 100000,
    cache_creation_input_tokens: 500,
    cache_creation: {
      ephemeral_5m_input_tokens: 300,
      ephemeral_1h_input_tokens: 200,
    },
  };
  const usage = normalizeUsage("anthropic", raw);
  assert.equal(usage.inputTokens, 100600);
  assert.equal(
    estimateCost("anthropic", "claude-haiku-5-5", usage)?.cost,
    "0.005687500",
  );
  assert.equal(
    normalizeUsage("anthropic", { ...raw, cache_creation_input_tokens: 499 })
      .known,
    false,
  );
});

test("provider money conversion preserves decimal cents, small dollar values and credits", () => {
  assert.equal(money("123.78912", true), "1.237891200000");
  assert.equal(money(1.2345e-7), "0.000000123450");
  assert.equal(money("-0.25"), "-0.250000000000");
  assert.equal(money("0.062551042553524"), "0.062551042553524");
  assert.equal(money("0.0000000000001", true), "0.000000000000001");
  for (const value of ["NaN", "Infinity", null, "1e200"])
    assert.throws(() => money(value));
});

test("call hooks retain usage from incomplete responses and measure transport errors without leaking text", async () => {
  const original = global.fetch;
  const observations: CallObservation[] = [];
  const input: PreparedInput = {
    text: "private prompt",
    images: [],
    frameIds: [],
    screenIds: [],
    columns: [],
  };
  const hooks = {
    onStart: async () => undefined,
    onFinish: async (row: CallObservation) => {
      observations.push(row);
    },
  };
  try {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          id: "resp_example",
          model: "gpt-6-luna",
          status: "incomplete",
          usage: { input_tokens: 123, output_tokens: 16 },
          output: [],
        }),
        { headers: { "x-request-id": "req_example" } },
      );
    await assert.rejects(
      generate(
        "openai",
        "gpt-6-luna",
        "private key",
        input,
        new AbortController().signal,
        undefined,
        hooks,
      ),
      /완료되지/,
    );
    assert.equal(observations[0].errorCode, "AI_INCOMPLETE");
    assert.equal(observations[0].requestId, "req_example");
    assert.equal(
      normalizeUsage("openai", observations[0].usage).inputTokens,
      123,
    );
    assert.ok(observations[0].durationMs >= 0);
    assert.equal(JSON.stringify(observations).includes("private"), false);
    global.fetch = async () => {
      throw new Error("secret transport details");
    };
    await assert.rejects(
      generate(
        "openai",
        "gpt-6-luna",
        "key",
        input,
        new AbortController().signal,
        undefined,
        hooks,
      ),
    );
    assert.equal(observations[1].errorCode, "TRANSPORT_OR_RESPONSE_ERROR");
    assert.equal(observations[1].usage, undefined);
    assert.equal(normalizeUsage("openai", observations[1].usage).known, false);
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          status: "completed",
          output: [{ content: [{ type: "output_text", text: "ok" }] }],
        }),
      );
    const broken = {
      onStart: async () => {
        throw new Error("record failure");
      },
      onFinish: async () => {
        throw new Error("record failure");
      },
    };
    assert.equal(
      await generate(
        "openai",
        "model",
        "key",
        input,
        new AbortController().signal,
        undefined,
        broken,
      ),
      "ok",
    );
  } finally {
    global.fetch = original;
  }
});

test("cost reports handle pagination, scope isolation and differing currency units", async () => {
  const original = global.fetch;
  const start = new Date("2026-10-14T00:00:00Z"),
    end = new Date("2026-10-15T00:00:00Z");
  try {
    let requests = 0;
    global.fetch = async (input) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("project_ids"), "proj_test");
      assert.equal(
        url.searchParams.get("start_time"),
        String(start.getTime() / 1000),
      );
      const page = requests++;
      assert.equal(url.searchParams.get("page"), page ? "next" : null);
      return Response.json({
        has_more: page === 0,
        next_page: page ? null : "next",
        data: [
          {
            start_time: start.getTime() / 1000,
            end_time: end.getTime() / 1000,
            results: [
              {
                project_id: "proj_test",
                line_item: page ? "output" : "input",
                amount: { value: 0.123, currency: "usd" },
              },
              { project_id: "other", amount: { value: 99, currency: "usd" } },
            ],
          },
        ],
      });
    };
    const rows = await fetchCosts(
      "openai",
      { adminKey: "key", scopeId: "proj_test" },
      start,
      end,
      new AbortController().signal,
    );
    assert.equal(rows.length, 2);
    assert.equal(rows[0].amountUsd, "0.123000000000");
    global.fetch = async () =>
      Response.json({
        has_more: false,
        data: [
          {
            starting_at: start.toISOString(),
            ending_at: end.toISOString(),
            results: [
              {
                workspace_id: null,
                description: "Input tokens",
                amount: "123.78912",
                currency: "USD",
              },
            ],
          },
        ],
      });
    const anthropic = await fetchCosts(
      "anthropic",
      { adminKey: "key", scopeId: "default" },
      start,
      end,
      new AbortController().signal,
    );
    assert.equal(anthropic[0].amountUsd, "1.237891200000");
    global.fetch = async () =>
      Response.json({ has_more: true, next_page: "loop", data: [] });
    await assert.rejects(
      fetchCosts(
        "openai",
        { adminKey: "key", scopeId: "proj_test" },
        start,
        end,
        new AbortController().signal,
      ),
      /cursor/,
    );
  } finally {
    global.fetch = original;
  }
});

test("cost DB sync replaces changed and removed items, avoids duplicates and retains data on incomplete reports", async () => {
  const lease = await openTestDatabase();
  const original = global.fetch;
  const scopeId = `proj_${randomUUID()}`;
  const config: ApiEnv = {
    ...lease.config,
    costSync: {
      intervalMs: 3600000,
      openai: { scopeId, adminKey: "synthetic" },
    },
  };
  const service = new ProviderCostsService(config, lease.database);
  const start = new Date("2026-10-14T00:00:00Z"),
    end = new Date("2026-10-15T00:00:00Z");
  let amount = 0.1,
    empty = false,
    malformed = false,
    automaticCalls = 0;
  try {
    global.fetch = async () =>
      Response.json(
        malformed
          ? { data: [] }
          : {
              has_more: false,
              data: [
                {
                  start_time: start.getTime() / 1000,
                  end_time: end.getTime() / 1000,
                  results: empty
                    ? []
                    : [
                        {
                          project_id: scopeId,
                          line_item: "input",
                          amount: { value: amount, currency: "usd" },
                        },
                      ],
                },
              ],
            },
      );
    const records = async () =>
      (
        await lease.lock.query(
          "SELECT * FROM ai_provider_costs WHERE provider='openai' AND scope_id=$1",
          [scopeId],
        )
      ).rows;
    await service.sync(start, end);
    await service.sync(start, end);
    assert.equal((await records()).length, 1);
    amount = 0.2;
    await service.sync(start, end);
    assert.equal((await records())[0].amount_usd, "0.200000000000");
    malformed = true;
    await assert.rejects(service.sync(start, end));
    assert.equal((await records())[0].amount_usd, "0.200000000000");
    malformed = false;
    amount = 0.062551042553524;
    await service.sync(start, end);
    assert.equal((await records())[0].amount_usd, "0.062551042553524");
    empty = true;
    await service.sync(start, end);
    assert.equal((await records()).length, 0);
    global.fetch = async () => {
      automaticCalls++;
      return Response.json({ has_more: false, data: [] });
    };
    service.onApplicationBootstrap();
    await service.sync();
    assert.equal(
      automaticCalls,
      1,
      "Application startup automatically synchronizes configured billing",
    );
  } finally {
    global.fetch = original;
    await service.onModuleDestroy();
    await lease.lock.query(
      "DELETE FROM ai_provider_costs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.close();
  }
});
