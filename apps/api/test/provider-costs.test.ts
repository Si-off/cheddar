import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { ApiEnv } from "../src/config/env";
import { readAiConfig } from "../src/generation/model-config";
import { fetchCosts } from "../src/generation/provider-costs";
import { ProviderCostsService } from "../src/generation/provider-costs.service";
import { openTestDatabase } from "./database";

test("비용 자동 동기화는 시작 시와 주기마다 최근 7 UTC 일을 읽고 fake와 테스트에서는 멈춘다", async () => {
  const lease = await openTestDatabase();
  const original = global.fetch;
  const originalProvider = process.env.AI_PROVIDER,
    originalMode = process.env.NODE_ENV;
  const scopeId = `proj_${randomUUID()}`;
  const config: ApiEnv = {
    ...lease.config,
    costSync: {
      intervalMs: 15,
      openai: { scopeId, adminKey: "synthetic" },
    },
  };
  let calls = 0;
  const services: ProviderCostsService[] = [];
  try {
    global.fetch = async (input) => {
      calls++;
      const url = new URL(String(input));
      const start = Number(url.searchParams.get("start_time")) * 1000,
        end = Number(url.searchParams.get("end_time")) * 1000;
      assert.equal(end - start, 7 * 86400000);
      assert.equal(start % 86400000, 0);
      assert.equal(end % 86400000, 0);
      return Response.json({ has_more: false, data: [] });
    };
    delete process.env.AI_PROVIDER;
    process.env.NODE_ENV = "test";
    const testing = new ProviderCostsService(config, lease.database);
    services.push(testing);
    testing.onApplicationBootstrap();
    await delay(30);
    assert.equal(calls, 0);
    process.env.NODE_ENV = "production";
    const fake = new ProviderCostsService(
      { ...config, ai: readAiConfig({ AI_PROVIDER: "fake" }) },
      lease.database,
    );
    services.push(fake);
    fake.onApplicationBootstrap();
    await fake.sync();
    await delay(30);
    assert.equal(calls, 0);
    process.env.AI_PROVIDER = "fake";
    const fakeEnvironment = new ProviderCostsService(config, lease.database);
    services.push(fakeEnvironment);
    fakeEnvironment.onApplicationBootstrap();
    await delay(30);
    assert.equal(calls, 0);
    delete process.env.AI_PROVIDER;
    const automatic = new ProviderCostsService(config, lease.database);
    services.push(automatic);
    automatic.onApplicationBootstrap();
    await automatic.sync();
    assert.equal(calls, 1);
    for (let i = 0; calls < 2 && i < 40; i++) await delay(10);
    assert.ok(calls >= 2);
  } finally {
    for (const service of services) await service.onModuleDestroy();
    global.fetch = original;
    if (originalProvider === undefined) delete process.env.AI_PROVIDER;
    else process.env.AI_PROVIDER = originalProvider;
    if (originalMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalMode;
    await lease.database.pool.query(
      "DELETE FROM ai_provider_cost_syncs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.close();
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
        await lease.database.pool.query(
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
      "Explicit sync uses the configured synthetic fetch",
    );
  } finally {
    global.fetch = original;
    await service.onModuleDestroy();
    await lease.database.pool.query(
      "DELETE FROM ai_provider_costs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.database.pool.query(
      "DELETE FROM ai_provider_cost_syncs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.close();
  }
});

test("다른 프로세스의 최신 빈 보고서는 기간이 겹치는 오래된 비용의 재삽입을 막는다", async () => {
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
  const older = new ProviderCostsService(config, lease.database);
  const newer = new ProviderCostsService(config, lease.database);
  const start = new Date("2026-10-14T00:00:00Z"),
    next = new Date("2026-10-15T00:00:00Z"),
    end = new Date("2026-10-16T00:00:00Z");
  const records = () =>
    lease.database.pool.query(
      "SELECT * FROM ai_provider_costs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
  const watermarks = () =>
    lease.database.pool.query(
      "SELECT * FROM ai_provider_cost_syncs WHERE provider='openai' AND scope_id=$1 ORDER BY bucket_start",
      [scopeId],
    );
  let release: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  try {
    for (const overlapping of [false, true]) {
      // 기존 비용이 있어도 빈 보고서를 적용하면 비용 행은 모두 삭제된다.
      const report = {
        has_more: false,
        data: [
          {
            start_time: start.getTime() / 1000,
            end_time: next.getTime() / 1000,
            results: [
              {
                project_id: scopeId,
                line_item: "input",
                amount: { value: 0.1, currency: "usd" },
              },
            ],
          },
        ],
      };
      global.fetch = async () => Response.json(report);
      await newer.sync(start, end);
      assert.equal((await records()).rows.length, 1);
      let markStarted: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        markStarted = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      global.fetch = async () => {
        markStarted?.();
        await gate;
        return Response.json(report);
      };
      pending = older.sync(start, overlapping ? end : next);
      await started;
      // JS 시각의 밀리초 경계를 넘긴 뒤 두 번째 프로세스의 동기화를 시작한다.
      await delay(10);
      global.fetch = async () => Response.json({ has_more: false, data: [] });
      await newer.sync(start, next);
      assert.equal((await records()).rows.length, 0);
      const latest = (await watermarks()).rows;
      assert.equal(latest.length, 2);
      release?.();
      await pending;
      pending = undefined;
      assert.equal((await records()).rows.length, 0);
      assert.deepEqual((await watermarks()).rows, latest);
      // 실패한 보고서는 빈 결과의 워터마크도 바꾸지 않는다.
      global.fetch = async () => Response.json({ data: [] });
      await assert.rejects(newer.sync(start, next));
      assert.deepEqual((await watermarks()).rows, latest);
      // 이후의 정상 보고서는 같은 범위를 다시 채울 수 있다.
      await delay(10);
      global.fetch = async () => Response.json(report);
      await newer.sync(start, next);
      assert.equal((await records()).rows.length, 1);
    }
  } finally {
    release?.();
    await pending?.catch(() => undefined);
    global.fetch = original;
    await older.onModuleDestroy();
    await newer.onModuleDestroy();
    await lease.database.pool.query(
      "DELETE FROM ai_provider_costs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.database.pool.query(
      "DELETE FROM ai_provider_cost_syncs WHERE provider='openai' AND scope_id=$1",
      [scopeId],
    );
    await lease.close();
  }
});
