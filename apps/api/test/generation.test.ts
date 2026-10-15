import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Ajv from "ajv";
import { ApiError } from "../src/common/errors";
import type { SheetSnapshotDto } from "../src/contracts/sheets.dto";
import { generate, type PreparedInput } from "../src/generation/provider";
import { createResultSchema, parseResult } from "../src/generation/result";
import { createDefaultTemplate } from "../src/projects/default-template";

function snapshot(): SheetSnapshotDto {
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    name: "Sheet",
    kind: "unit",
    uploadId: null,
    contentRevision: 1,
    viewRevision: 1,
    sourceTemplateRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...createDefaultTemplate(),
    cases: [],
    references: { frames: [], iaItems: [] },
  };
}
const content = () => ({
  title: "Login",
  preconditions: "",
  steps: "Submit credentials",
  expectedResult: "Home is displayed",
  priority: null,
});
test("generation schema permits nullable priorities and restricts references to the selected input", () => {
  const frameId = randomUUID(),
    iaId = randomUUID(),
    columnId = randomUUID();
  const validate = new Ajv().compile(
    createResultSchema([frameId], [iaId], [columnId]),
  );
  const row = {
    ...content(),
    relatedFrameIds: [frameId],
    screenIds: [iaId],
    customValues: [{ columnId, value: "Text" }],
  };
  assert.equal(validate({ cases: [row], candidates: [] }), true);
  for (const priority of ["high", "medium", "low"])
    assert.equal(
      validate({ cases: [{ ...row, priority }], candidates: [] }),
      true,
    );
  for (const patch of [
    { relatedFrameIds: [randomUUID()] },
    { screenIds: [randomUUID()] },
    { customValues: [{ columnId: randomUUID(), value: "Text" }] },
    { steps: "   " },
  ])
    assert.equal(
      validate({ cases: [{ ...row, ...patch }], candidates: [] }),
      false,
    );
  const emptySchema = new Ajv().compile(createResultSchema([], [], []));
  assert.equal(emptySchema({ cases: [content()], candidates: [] }), true);
  assert.equal(
    emptySchema({
      cases: [{ ...content(), screenIds: [iaId] }],
      candidates: [],
    }),
    false,
  );
});
test("AI result parsing normalizes repeated UUID references but still rejects invented references and blank cases", () => {
  const sheet = snapshot(),
    frameId = randomUUID();
  const result = parseResult(
    JSON.stringify({
      cases: [
        { ...content(), relatedFrameIds: [frameId, frameId.toUpperCase()] },
      ],
      candidates: [
        {
          reason: "Confirm behavior",
          content: { ...content(), relatedFrameIds: [] },
        },
      ],
    }),
    sheet,
    [frameId],
    [],
  );
  assert.deepEqual(result.cases[0].relatedFrameIds, [frameId]);
  assert.deepEqual(result.cases[0].screenIds, []);
  assert.deepEqual(result.cases[0].customValues, {});
  assert.equal(result.candidates[0].status, "pending");
  for (const [patch, reason] of [
    [{ relatedFrameIds: [randomUUID()] }, "frame_reference"],
    [{ screenIds: [randomUUID()] }, "ia_reference"],
    [{ steps: " " }, "empty_case_text"],
  ] as const)
    assert.throws(
      () =>
        parseResult(
          JSON.stringify({
            cases: [
              Object.assign({}, content(), { relatedFrameIds: [] }, patch),
            ],
            candidates: [],
          }),
          sheet,
          [frameId],
          [],
        ),
      (error) =>
        error instanceof ApiError &&
        (error.details as { reason: string }).reason === reason,
    );
});
test("both provider payloads use the selected reference schema and provider errors expose only categories", async () => {
  const original = global.fetch;
  const frameId = randomUUID();
  const input: PreparedInput = {
    text: "Synthetic input",
    images: [],
    frameIds: [frameId],
    screenIds: [],
    customColumnIds: [],
  };
  try {
    for (const provider of ["anthropic", "openai"] as const) {
      global.fetch = async (_url, options) => {
        const body = JSON.parse(String(options?.body));
        const schema =
          provider === "anthropic"
            ? body.output_config.format.schema
            : body.text.format.schema;
        assert.deepEqual(schema, createResultSchema([frameId], [], []));
        const result = JSON.stringify({
          cases: [{ ...content(), relatedFrameIds: [frameId] }],
          candidates: [],
        });
        return new Response(
          JSON.stringify(
            provider === "anthropic"
              ? {
                  stop_reason: "end_turn",
                  content: [{ type: "text", text: result }],
                }
              : {
                  status: "completed",
                  output: [
                    { content: [{ type: "output_text", text: result }] },
                  ],
                },
          ),
        );
      };
      const raw = await generate(
        provider,
        "test-model",
        "test-key",
        input,
        new AbortController().signal,
      );
      assert.equal(parseResult(raw, snapshot(), [frameId], []).cases.length, 1);
    }
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            message:
              "output_config.format.schema: invalid schema; confidential text",
          },
        }),
        { status: 400 },
      );
    await assert.rejects(
      () =>
        generate(
          "anthropic",
          "test-model",
          "test-key",
          input,
          new AbortController().signal,
        ),
      (error) => {
        assert.ok(error instanceof ApiError);
        assert.deepEqual(error.details, {
          provider: "anthropic",
          status: 400,
          category: "schema",
        });
        assert.equal(error.message.includes("confidential"), false);
        return true;
      },
    );
  } finally {
    global.fetch = original;
  }
});
