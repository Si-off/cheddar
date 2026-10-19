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
      type: "tags",
      options: ["화면", "업무"],
      description: "허용 태그",
    },
  ],
  memo: "",
  frames: [],
  featureGroups: [],
  requiredCases: [],
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
