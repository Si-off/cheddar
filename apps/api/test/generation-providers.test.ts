import assert from "node:assert/strict";
import test from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readAiConfig, STAGES } from "../src/generation/model-config";
import { validateSchema } from "../src/generation/output-schema";
import {
  AiFailure,
  type AiRequest,
  failureLog,
} from "../src/generation/providers/ai-provider";
import { AnthropicProvider } from "../src/generation/providers/anthropic";
import { OpenAiProvider } from "../src/generation/providers/openai";
import { requestSchema } from "../src/generation/providers/request-schema";
import { DEFINITIONS } from "../src/generation/steps";
import type { GenerationInput, JsonSchema } from "../src/generation/types";
import { defaultColumns } from "../src/projects/template";

const context: GenerationInput = {
  columns: [
    ...defaultColumns(),
    {
      id: "7a0bb214-2038-4ac5-8aa3-b75ca61b76b8",
      name: "태그",
      systemKey: null,
      presetKey: null,
      type: "tags",
      options: ["화면", "업무"],
      description: "허용 태그",
    },
  ],
  memo: "",
  frames: [],
  featureGroups: [],
  viewpoints: [],
  screenStructure: [],
  styleExamples: [],
  existingCases: [],
};
const request = (): AiRequest => ({
  definition: DEFINITIONS.cases,
  model: readAiConfig({}).models.cases,
  schema: DEFINITIONS.cases.schema(context),
  context,
  sourceData: {},
  images: [],
});
const providers = (fetch: typeof globalThis.fetch) => [
  new AnthropicProvider(
    new Anthropic({ apiKey: "test", maxRetries: 0, fetch }),
  ),
  new OpenAiProvider(new OpenAI({ apiKey: "test", maxRetries: 0, fetch })),
];
function checkSchema(schema: JsonSchema) {
  for (const key of [
    "minLength",
    "maxLength",
    "minItems",
    "maxItems",
    "uniqueItems",
    "minimum",
  ])
    assert.ok(!Object.hasOwn(schema, key), key);
  // 선택 항목처럼 null을 허용하는 enum도 Anthropic이 거부하지 않는 형태여야 한다
  if (schema.enum) assert.equal(typeof schema.type, "string");
  if (schema.type === "object") {
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, Object.keys(schema.properties ?? {}));
  }
  for (const child of Object.values(schema.properties ?? {}))
    checkSchema(child);
  if (schema.items) checkSchema(schema.items);
  schema.anyOf?.forEach(checkSchema);
}
test("두 SDK의 모든 단계 전송 스키마는 공통 지원 키워드만 포함하고 원본을 보존", async () => {
  let body: {
    output_config?: { format: { schema: JsonSchema } };
    text?: { format: { schema: JsonSchema } };
  } = {};
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      '{"error":{"message":"검사 종료","type":"invalid_request_error"}}',
      { status: 400 },
    );
  };
  for (const provider of providers(fetch)) {
    for (const stage of STAGES) {
      const r = {
        ...request(),
        definition: DEFINITIONS[stage],
        schema: DEFINITIONS[stage].schema(context),
      };
      const original = structuredClone(r.schema);
      await assert.rejects(
        provider.generate(r),
        (e) => e instanceof AiFailure && !e.retryable,
      );
      const schema =
        body.output_config?.format.schema ?? body.text?.format.schema;
      assert.ok(schema);
      checkSchema(schema);
      assert.deepEqual(schema, requestSchema(original));
      assert.deepEqual(r.schema, original);
    }
  }
  const original = {
    type: "array",
    maxItems: 1,
    uniqueItems: true,
    items: { type: "string", maxLength: 2 },
  };
  const sent = requestSchema(original);
  assert.match(sent.description ?? "", /최대 1개/);
  validateSchema(sent, ["길이가 긴 값", "길이가 긴 값"]);
  for (const value of [["긴 문자열"], ["가", "나"], ["가", "가"]])
    assert.throws(() => validateSchema(original, value));
  assert.throws(() => validateSchema({ type: "integer", minimum: 0 }, -1));
  assert.throws(() => validateSchema({ type: "string", minLength: 1 }, ""));
});

test("단계에 정한 effort를 Claude와 GPT 요청에 그대로 보낸다", async () => {
  const sent: unknown[] = [];
  const fetch: typeof globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body));
    sent.push(body.output_config?.effort ?? body.reasoning?.effort);
    return new Response(
      '{"error":{"message":"검사 종료","type":"invalid_request_error"}}',
      { status: 400 },
    );
  };
  for (const provider of providers(fetch))
    await assert.rejects(
      provider.generate({
        ...request(),
        model: { ...request().model, effort: "xhigh" },
      }),
    );
  assert.deepEqual(sent, ["xhigh", "xhigh"]);
  // effort를 받지 않는 모델은 default로 두면 보내지 않는다
  sent.length = 0;
  for (const provider of providers(fetch))
    await assert.rejects(
      provider.generate({
        ...request(),
        model: { ...request().model, effort: "default" },
      }),
    );
  assert.deepEqual(sent, [undefined, undefined]);
});

test("SDK 사용자 중단 오류로 감싸진 시간 초과는 재시도하고 서버 종료는 재시도하지 않음", async () => {
  const fetch: typeof globalThis.fetch = async (_url, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(signal.reason);
      else
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
    });
  for (const provider of providers(fetch)) {
    const r = request();
    await assert.rejects(
      provider.generate({
        ...r,
        definition: { ...r.definition, timeoutMs: 30 },
      }),
      (e) => e instanceof AiFailure && e.code === "AI_TIMEOUT" && e.retryable,
    );
    const shutdown = new AbortController();
    const timer = setTimeout(() => shutdown.abort(), 20);
    try {
      await assert.rejects(
        provider.generate({ ...r, signal: shutdown.signal }),
        (e) =>
          e instanceof AiFailure && e.code === "AI_ABORTED" && !e.retryable,
      );
    } finally {
      clearTimeout(timer);
    }
  }
});

test("제공자 오류 기록에는 키가 남지 않음", () => {
  const log = failureLog(
    401,
    "Incorrect API key provided: sk-proj-abc1****wxyz. You can find your API key at ...",
  );
  assert.match(log, /^401 /);
  assert.doesNotMatch(log, /sk-|abc1|wxyz/);
  assert.doesNotMatch(
    failureLog(400, "invalid x-api-key sk-ant-api03-Zz_9"),
    /sk-ant|Zz_9/,
  );
});

test("SDK의 잘린 응답은 사용량과 공급자 식별자를 보존하고 본문은 계측에서 제외", async () => {
  const openai = new OpenAiProvider(
    new OpenAI({
      apiKey: "synthetic",
      maxRetries: 0,
      fetch: async () =>
        Response.json(
          {
            id: "resp_synthetic",
            model: "gpt-5.4",
            status: "incomplete",
            service_tier: "default",
            incomplete_details: { reason: "max_output_tokens" },
            output: [],
            output_text: "출력 비밀",
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              input_tokens_details: { cached_tokens: 30 },
              output_tokens_details: { reasoning_tokens: 10 },
            },
          },
          { headers: { "x-request-id": "req_openai" } },
        ),
    }),
  );
  const events = [
    {
      type: "message_start",
      message: {
        id: "msg_synthetic",
        type: "message",
        role: "assistant",
        model: "claude-haiku-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 100,
          output_tokens: 0,
          cache_read_input_tokens: 30,
          cache_creation_input_tokens: 10,
          service_tier: "standard",
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
      delta: { type: "text_delta", text: "출력 비밀" },
    },
    { type: "content_block_stop", index: 0 },
    {
      type: "message_delta",
      delta: { stop_reason: "max_tokens", stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: "message_stop" },
  ];
  const anthropic = new AnthropicProvider(
    new Anthropic({
      apiKey: "synthetic",
      maxRetries: 0,
      fetch: async () =>
        new Response(
          events
            .map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
            .join(""),
          {
            headers: {
              "content-type": "text/event-stream",
              "request-id": "req_anthropic",
            },
          },
        ),
    }),
  );
  for (const [provider, code, requestId] of [
    [openai, "AI_INCOMPLETE", "req_openai"],
    [anthropic, "AI_MAX_TOKENS", "req_anthropic"],
  ] as const) {
    await assert.rejects(provider.generate(request()), (e) => {
      assert.ok(e instanceof AiFailure);
      assert.equal(e.code, code);
      assert.equal(e.usage?.outputTokens, 20);
      assert.equal(e.observation?.requestId, requestId);
      assert.ok(e.observation?.usage);
      assert.doesNotMatch(JSON.stringify(e), /비밀|synthetic.*key/);
      return true;
    });
  }
});
