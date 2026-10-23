import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthService } from "../src/auth/auth.service";
import { configureApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import {
  AcceptReviewItemDto,
  CreateGenerationDto,
  PatchReviewItemDto,
  RewriteReviewItemDto,
} from "../src/contracts/generation.dto";
import { GenerationController } from "../src/generation/generation.controller";
import { GenerationService } from "../src/generation/generation.service";
import { readAiConfig, STAGES } from "../src/generation/model-config";
import {
  caseSchema,
  formSchema,
  validateDraft,
  validateSchema,
} from "../src/generation/output-schema";
import { costFor } from "../src/generation/pricing";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  emptyUsage,
} from "../src/generation/providers/ai-provider";
import { FakeProvider } from "../src/generation/providers/fake";
import { heartbeat, jobEvent } from "../src/generation/sse";
import { boundedMap } from "../src/generation/stage-runner";
import { DEFINITIONS } from "../src/generation/steps";
import type { GenerationInput } from "../src/generation/types";
import { validatedOutput } from "../src/generation/validated-output";
import { defaultColumns } from "../src/projects/template";
import { ReviewItemsController } from "../src/review-items/review-items.controller";
import { ReviewItemsService } from "../src/review-items/review-items.service";
import {
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  parseManifest,
} from "../src/temp-uploads/manifest";
import { TempUploadsController } from "../src/temp-uploads/temp-uploads.controller";
import { TempUploadsService } from "../src/temp-uploads/temp-uploads.service";

const input = (): GenerationInput => ({
  columns: [
    ...defaultColumns(),
    {
      id: randomUUID(),
      name: "태그",
      systemKey: null,
      presetKey: null,
      type: "tags",
      description: "허용 태그",
      options: ["화면", "업무"],
    },
    {
      id: randomUUID(),
      name: "확인",
      systemKey: null,
      presetKey: null,
      type: "checkbox",
      description: "",
      options: [],
    },
  ],
  memo: "가입",
  frames: [
    {
      id: randomUUID(),
      name: "가입 화면",
      screenDocument: '{"text":"가입"}',
      imageStorageKeys: [],
    },
  ],
  featureGroups: [],
  viewpoints: [
    { id: "screen_entry", name: "화면 진입", when: "진입 화면이 있을 때" },
  ],
  screenStructure: [],
  existingCases: [],
  styleExamples: [],
});
const request = (context = input()): AiRequest => ({
  definition: DEFINITIONS.cases,
  model: readAiConfig({}).models.cases,
  schema: caseSchema(context),
  context,
  sourceData: {},
  images: [],
});
test("생성과 확인 필요 DTO는 종류, UUID, 길이, null과 알 수 없는 항목을 검증", async () => {
  for (const [ctor, value] of [
    [CreateGenerationDto, {}],
    [CreateGenerationDto, { kind: "rewrite" }],
    [CreateGenerationDto, { kind: "initial", uploadId: "bad" }],
    [CreateGenerationDto, { kind: "append", memo: null }],
    [CreateGenerationDto, { kind: "append", memo: "a".repeat(10001) }],
    [CreateGenerationDto, { kind: "append", model: "bad" }],
    [CreateGenerationDto, { kind: "append", clientRequestId: "bad" }],
    [CreateGenerationDto, { kind: "append", clientRequestId: null }],
    [PatchReviewItemDto, { draft: [] }],
    [PatchReviewItemDto, { status: "resolved" }],
    [PatchReviewItemDto, { answer: null }],
    [PatchReviewItemDto, { answer: "a".repeat(2001) }],
    [AcceptReviewItemDto, {}],
    [RewriteReviewItemDto, { answer: "" }],
    [RewriteReviewItemDto, { answer: "a".repeat(2001) }],
    [RewriteReviewItemDto, { answer: "답변", clientRequestId: "bad" }],
  ] as [new () => object, unknown][])
    assert.ok(
      (
        await validate(plainToInstance(ctor, value), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    );
  assert.equal(
    (
      await validate(
        plainToInstance(CreateGenerationDto, {
          kind: "append",
          memo: "a".repeat(10000),
          clientRequestId: randomUUID(),
        }),
      )
    ).length,
    0,
  );
  assert.equal(
    (
      await validate(
        plainToInstance(RewriteReviewItemDto, { answer: "a".repeat(2000) }),
      )
    ).length,
    0,
  );
});
test("양식 스키마는 UUID 키, 선택 enum, 태그 중복과 필수 항목을 검사", async () => {
  const context = input(),
    r = request(context);
  const schema = formSchema(context.columns);
  assert.equal(schema.additionalProperties, false);
  assert.ok(!schema.required?.includes(context.columns[0].id));
  const output = JSON.parse((await new FakeProvider().generate(r)).text);
  validateSchema(r.schema, output);
  const draft = output.cases[0];
  validateDraft(context.columns, draft);
  const select = context.columns.find((column) => column.type === "select");
  const tags = context.columns.find((column) => column.type === "tags");
  const checkbox = context.columns.find((column) => column.type === "checkbox");
  assert.ok(select && tags && checkbox);
  for (const bad of [
    {
      ...draft,
      [select.id]: "なし",
    },
    {
      ...draft,
      [tags.id]: ["화면", "화면"],
    },
    {
      ...draft,
      [checkbox.id]: null,
    },
    { ...draft, [randomUUID()]: "외부 열" },
    {},
  ])
    assert.throws(() => validateSchema(schema, bad));
  assert.throws(() =>
    validateDraft(context.columns, { [randomUUID()]: "다른 열" }),
  );
  const long = { ...draft, [context.columns[1].id]: "a".repeat(20001) };
  assert.throws(() => validateSchema(schema, long));
});
test("출력 검증은 파싱과 열 형식 실패를 한 번만 수정하고 두 번째 실패는 종료", async () => {
  const r = request();
  const good = await new FakeProvider().generate(r);
  let calls = 0,
    repairs = 0;
  const provider: AiProvider = {
    async generate(q) {
      calls++;
      if (calls === 1) return { text: "{}", usage: emptyUsage() };
      assert.ok(q.repair?.error);
      assert.equal(q.repair?.output, "{}");
      return good;
    },
  };
  const result = await validatedOutput(
    provider,
    r,
    () => {},
    async () => {},
    async () => {
      repairs++;
    },
  );
  assert.equal(result.repairCount, 1);
  assert.equal(calls, 2);
  assert.equal(repairs, 1);
  calls = 0;
  await assert.rejects(
    validatedOutput(
      {
        async generate() {
          calls++;
          return { text: "[bad", usage: emptyUsage() };
        },
      },
      r,
    ),
    (e) =>
      e instanceof AiFailure && !e.retryable && e.code === "AI_OUTPUT_INVALID",
  );
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(
    validatedOutput(
      {
        async generate() {
          calls++;
          throw new AiFailure("AI_REFUSAL", false);
        },
      },
      r,
    ),
  );
  assert.equal(calls, 1);
});
test("단계별 모델과 effort는 짧은 이름이나 전체 이름으로 바꾸고 잘못된 값은 거부", () => {
  const defaults = readAiConfig({});
  for (const stage of STAGES) {
    assert.ok(
      ["anthropic", "openai"].includes(defaults.models[stage].provider),
    );
    assert.ok(defaults.models[stage].effort);
  }
  assert.deepEqual(
    readAiConfig({ AI_MODEL_FLOWS: "luna", AI_EFFORT_FLOWS: "max" }).models
      .flows,
    { provider: "openai", model: "gpt-6-luna", effort: "max" },
  );
  assert.deepEqual(readAiConfig({ AI_MODEL_SCREENS: "haiku" }).models.screens, {
    provider: "anthropic",
    model: "claude-haiku-5-5",
    effort: defaults.models.screens.effort,
  });
  assert.equal(
    readAiConfig({ AI_MODEL_CASES: "terra" }).models.cases.model,
    "gpt-5.6-terra",
  );
  assert.deepEqual(
    readAiConfig({
      AI_MODEL_CASES: "openai:configured-model",
      AI_PROVIDER: "fake",
    }).models.cases,
    {
      provider: "openai",
      model: "configured-model",
      effort: defaults.models.cases.effort,
    },
  );
  assert.equal(readAiConfig({ AI_PROVIDER: "fake" }).fake, true);
  for (const value of [
    "",
    "openai",
    "other:model",
    "openai:bad model",
    "openai:a:b",
    "gemini",
  ])
    assert.throws(() => readAiConfig({ AI_MODEL_CASES: value }));
  for (const value of ["", "none", "HIGH", "extreme"])
    assert.throws(() => readAiConfig({ AI_EFFORT_CASES: value }));
  assert.throws(() => readAiConfig({ AI_PROVIDER: "other" }));
});
test("fake는 모든 단계에서 결정적인 양식 결과와 확인 필요를 만들고 재작성 답변을 반영", async () => {
  const context = input(),
    provider = new FakeProvider();
  const outputs: Record<string, unknown> = {};
  for (const stage of STAGES) {
    const r = {
      ...request(context),
      definition: DEFINITIONS[stage],
      schema: DEFINITIONS[stage].schema(context),
      sourceData: stage === "finish" ? { outputs: [outputs.cases] } : {},
    };
    const first = await provider.generate(r),
      second = await provider.generate(r);
    assert.deepEqual(first, second);
    validateSchema(r.schema, JSON.parse(first.text));
    outputs[stage] = JSON.parse(first.text);
  }
  const cases = outputs.cases as { cases: unknown[]; reviews: unknown[] };
  assert.equal(cases.cases.length, 2);
  assert.equal(cases.reviews.length, 1);
});
test("SSE는 화면 단계와 종료 정보만 내보내고 heartbeat는 주석", () => {
  const base = {
    jobId: randomUUID(),
    kind: "initial",
    stage: "cases",
    addedCount: 2,
    reviewCount: 1,
    errorMessage: null,
  };
  assert.equal(
    jobEvent({ ...base, status: "running" }),
    'event: progress\ndata: {"stage":"cases","status":"running"}\n\n',
  );
  assert.equal(
    jobEvent({ ...base, status: "succeeded" }),
    'event: done\ndata: {"status":"succeeded","addedCount":2,"reviewCount":1}\n\n',
  );
  assert.equal(
    jobEvent({ ...base, status: "failed", errorMessage: "다시 시도해주세요." }),
    'event: done\ndata: {"status":"failed","errorMessage":"다시 시도해주세요."}\n\n',
  );
  assert.equal(heartbeat, ": keep-alive\n\n");
});
test("업로드 manifest는 프레임 수, 이미지 순서 수와 실제 서명, 파일 크기를 검증", () => {
  const bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const image = {
    buffer: bytes,
    size: bytes.length,
    mimetype: "image/png",
  } as Express.Multer.File;
  const manifest = JSON.stringify({
    frames: [
      {
        name: "화면",
        document: { schemaVersion: 2, text: "안내" },
        imageCount: 1,
      },
    ],
  });
  assert.equal(parseManifest(manifest, [image])[0].imageCount, 1);
  for (const value of [
    "bad",
    "{}",
    JSON.stringify({ frames: [] }),
    JSON.stringify({
      frames: Array(201).fill({
        name: "화면",
        document: { schemaVersion: 2 },
        imageCount: 0,
      }),
    }),
    JSON.stringify({ frames: [{ name: "화면", imageCount: 0 }] }),
  ])
    assert.throws(() => parseManifest(value, []));
  assert.throws(() => parseManifest(manifest, []));
  assert.throws(() =>
    parseManifest(manifest, [{ ...image, mimetype: "image/jpeg" }]),
  );
  assert.throws(() =>
    parseManifest(manifest, [{ ...image, size: MAX_IMAGE_BYTES + 1 }]),
  );
});
test("화면 문서는 schemaVersion 2와 프레임당 크기 상한만 확인하고 내용은 가공하지 않음", () => {
  const manifest = (document: unknown) =>
    JSON.stringify({ frames: [{ name: "화면", document, imageCount: 0 }] });
  const document = { schemaVersion: 2, texts: ["안내"], extra: { kept: true } };
  assert.deepEqual(parseManifest(manifest(document), [])[0].document, document);
  const fill = "가".repeat(Math.ceil(MAX_DOCUMENT_BYTES / 3));
  for (const value of [
    null,
    { text: "안내" },
    { schemaVersion: 1 },
    { schemaVersion: "2" },
    [{ schemaVersion: 2 }],
    { schemaVersion: 2, texts: [fill] },
  ])
    assert.throws(() => parseManifest(manifest(value), []));
  assert.equal(
    parseManifest(manifest({ schemaVersion: 2, texts: [fill.slice(100)] }), [])
      .length,
    1,
  );
});
test("비용은 캐시 토큰과 Haiku 길이 경계를 반영하고 미등록 모델은 null", () => {
  const u = {
    inputTokens: 100000,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
  };
  assert.equal(costFor("anthropic:claude-haiku-5-5", u), "0.0100500000");
  assert.equal(
    costFor("anthropic:claude-haiku-5-5", { ...u, cacheReadTokens: 1 }),
    "0.0502500500",
  );
  assert.equal(costFor("unknown", u), null);
  assert.equal(costFor("unknown", u, true), "0.0000000000");
});
test("병렬 실행은 상한을 지키며 실패 시 진행 중 실행이 끝난 뒤 반환", async () => {
  let active = 0,
    peak = 0;
  const result = await boundedMap(
    [1, 2, 3, 4, 5],
    async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 2));
      active--;
      return n * 2;
    },
    2,
  );
  assert.deepEqual(result, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
  await assert.rejects(
    boundedMap(
      [1, 2, 3],
      async (n) => {
        if (n === 1) throw new Error("중단");
        active++;
        await new Promise((r) => setTimeout(r, 2));
        active--;
      },
      2,
    ),
  );
  assert.equal(active, 0);
});
test("HTTP DTO 검증과 SSE OpenAPI는 DB 없이 확인", async () => {
  let called = false;
  const service = {
    create() {
      called = true;
      return {};
    },
    current() {
      return null;
    },
  };
  const module = await Test.createTestingModule({
    controllers: [
      GenerationController,
      ReviewItemsController,
      TempUploadsController,
    ],
    providers: [
      { provide: GenerationService, useValue: service },
      { provide: AuthService, useValue: {} },
      { provide: ReviewItemsService, useValue: {} },
      {
        provide: TempUploadsService,
        useValue: {
          create(
            _accountId: string,
            manifest: string,
            images: Express.Multer.File[],
          ) {
            parseManifest(manifest, images);
            return { frames: [] };
          },
        },
      },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  configureApp(app, {
    databaseUrl: "unused",
    storageRoot: "unused",
    port: 3101,
    host: "127.0.0.1",
    cookieSameSite: "lax",
    corsOrigins: [],
  });
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(),
      id = randomUUID();
    for (const path of [
      "/api/v1/temp-uploads",
      "/api/v1/temp-uploads/",
      "/API/V1/TEMP-UPLOADS/",
    ]) {
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          `${base}${path}`,
          {
            method: "POST",
            headers: { "Content-Length": String(MAX_UPLOAD_BYTES + 1) },
          },
          (res) => {
            res.resume();
            res.on("end", () => resolve(res.statusCode ?? 0));
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.equal(status, 413);
    }
    for (const [path, method, body] of [
      [`test-sets/${id}/generations`, "POST", { kind: "rewrite" }],
      [`test-sets/${id}/generations`, "POST", { kind: "append", memo: 10 }],
      [`review-items/${id}`, "PATCH", { status: "resolved" }],
      [`review-items/${id}/accept`, "POST", {}],
      [`review-items/${id}/rewrite`, "POST", { answer: "" }],
    ] as const) {
      const response = await fetch(`${base}/api/v1/${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal(
        ((await response.json()) as { error: { code: string } }).error.code,
        "VALIDATION_ERROR",
      );
    }
    assert.equal(called, false);
    const multipart = new FormData();
    multipart.append(
      "manifest",
      JSON.stringify({
        frames: [
          { name: "화면", document: { schemaVersion: 2 }, imageCount: 0 },
        ],
      }),
    );
    assert.equal(
      (
        await fetch(`${base}/api/v1/temp-uploads`, {
          method: "POST",
          body: multipart,
        })
      ).status,
      201,
    );
    const document = createDocument(app);
    for (const path of [
      "/api/v1/test-sets/{testSetId}/generations",
      "/api/v1/review-items/{itemId}/rewrite",
    ])
      assert.ok(document.paths[path].post?.responses["429"]);
    assert.ok(
      document.paths["/api/v1/generations/{jobId}/events"].get?.responses[
        "200"
      ],
    );
    const response =
      document.paths["/api/v1/generations/{jobId}/events"].get?.responses[
        "200"
      ];
    assert.ok(
      response &&
        !("$ref" in response) &&
        response.content?.["text/event-stream"],
    );
    for (const ctor of [
      "CreateGenerationDto",
      "PatchReviewItemDto",
      "AcceptReviewItemDto",
      "RewriteReviewItemDto",
    ])
      assert.ok(document.components?.schemas?.[ctor]);
  } finally {
    await app.close();
  }
});
