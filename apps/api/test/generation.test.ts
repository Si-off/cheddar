import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import Ajv from "ajv";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import type { GenerationDto } from "../src/contracts/generation.dto";
import type { TestScenarioSnapshotDto } from "../src/contracts/test-scenarios.dto";
import { generate, type PreparedInput } from "../src/generation/provider";
import { createResultSchema, parseResult } from "../src/generation/result";
import { createDefaultTemplate } from "../src/projects/default-template";
import { openTestDatabase } from "./database";

function snapshot(): TestScenarioSnapshotDto {
  // These tests exercise the no-custom-column schema. Project defaults also
  // contain editable text columns, covered by the custom-value schema test.
  const template = createDefaultTemplate();
  const columns = template.columns.filter((column) => column.kind === "system");
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    name: "TestScenario",
    kind: "unit",
    uploadId: null,
    contentRevision: 1,
    viewRevision: 1,
    sourceTemplateRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns,
    view: template.view.filter((entry) =>
      columns.some((column) => column.id === entry.columnId),
    ),
    cases: [],
    references: { frames: [], iaItems: [] },
  };
}
const content = () => ({
  title: "Login",
  customValues: {},
});
test("generation follows configured types and rejects unconfigured columns, options and references", () => {
  const frameId = randomUUID(),
    iaId = randomUUID();
  const option = { id: randomUUID(), name: "긴급" };
  const columns = (["text", "select", "checkbox", "tags"] as const).map(
    (valueType) => ({
      id: randomUUID(),
      kind: "custom" as const,
      name: valueType,
      valueType,
      ...(["select", "tags"].includes(valueType) ? { options: [option] } : {}),
    }),
  );
  const [text, select, checkbox, tags] = columns.map((column) => column.id);
  const validate = new Ajv().compile(
    createResultSchema([frameId], [iaId], columns),
  );
  const row = {
    title: "Login",
    relatedFrameIds: [frameId],
    screenIds: [iaId],
    customValues: {
      [text]: "절차",
      [select]: option.id,
      [checkbox]: true,
      [tags]: [option.id],
    },
  };
  assert.equal(validate({ cases: [row], candidates: [] }), true);
  assert.equal(
    validate({
      cases: [
        { ...row, customValues: { ...row.customValues, [select]: null } },
      ],
      candidates: [],
    }),
    true,
  );
  for (const patch of [
    { relatedFrameIds: [randomUUID()] },
    { screenIds: [randomUUID()] },
    { priority: "high" },
    { steps: "fixed" },
    { title: "   " },
    { customValues: { ...row.customValues, [select]: randomUUID() } },
    { customValues: { ...row.customValues, [checkbox]: "true" } },
    { customValues: { ...row.customValues, [tags]: [randomUUID()] } },
    { customValues: {} },
  ])
    assert.equal(
      validate({ cases: [{ ...row, ...patch }], candidates: [] }),
      false,
    );
  const empty = new Ajv().compile(createResultSchema([], [], []));
  assert.equal(empty({ cases: [content()], candidates: [] }), true);
  assert.equal(
    empty({ cases: [{ ...content(), priority: null }], candidates: [] }),
    false,
  );
});
test("AI result parsing normalizes repeated UUID references but still rejects invented references and blank cases", () => {
  const testScenario = snapshot(),
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
    testScenario,
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
    [{ title: " " }, "empty_case_text"],
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
          testScenario,
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
    columns: [],
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

test("generation HTTP lifecycle preserves testScenarios on failure and serializes writes and candidate review", async () => {
  const lease = await openTestDatabase();
  const originalFetch = global.fetch;
  let app: INestApplication | undefined;
  let release: (() => void) | undefined;
  let calls = 0;
  let invalid = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    global.fetch = async (url, options) => {
      if (!String(url).startsWith("https://api.anthropic.com/"))
        return originalFetch(url, options);
      calls++;
      const body = JSON.parse(String(options?.body));
      const customIds = Object.keys(
        body.output_config.format.schema.properties.cases.items.properties
          .customValues.properties,
      );
      const row = {
        ...content(),
        customValues: Object.fromEntries(customIds.map((id) => [id, ""])),
      };
      await gate;
      return new Response(
        JSON.stringify({
          id: "msg_synthetic",
          model: "claude-haiku-5-5",
          usage: {
            input_tokens: 100,
            output_tokens: 40,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 50,
          },
          stop_reason: "end_turn",
          content: [
            {
              type: "text",
              text: JSON.stringify({
                cases: [
                  invalid ? { ...row, relatedFrameIds: [randomUUID()] } : row,
                ],
                candidates: [{ reason: "Confirm behavior", content: row }],
              }),
            },
          ],
        }),
      );
    };
    const config = {
      ...lease.config,
      ai: {
        anthropicKey: "synthetic-key",
        anthropicModel: "synthetic-model",
        openaiModel: "synthetic-model",
      },
    };
    const module = await Test.createTestingModule({
      imports: [appModule(config, lease.folder)],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, config);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const request = (path: string, method = "GET", body?: unknown) =>
      fetch(`${base}/api/v1${path}`, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
    const projectResponse = await request("/projects", "POST", {
      name: "Generation lifecycle",
    });
    assert.equal(projectResponse.status, 201);
    const project = (await projectResponse.json()) as { id: string };
    lease.projects.push(project.id);
    const prefix = `/projects/${project.id}/test-scenarios`;
    async function create() {
      const response = await request(prefix, "POST", {
        name: "Test testScenario",
        kind: "unit",
      });
      assert.equal(response.status, 201);
      return response.json() as Promise<TestScenarioSnapshotDto>;
    }
    const testScenario = await create();
    const other = await create();
    const path = `${prefix}/${testScenario.id}`;
    const jobsPath = `${path}/generations`;
    const start = {
      clientRequestId: randomUUID(),
      provider: "anthropic",
      expectedRevision: testScenario.contentRevision,
      description: "Synthetic login flow",
    };
    const response = await request(jobsPath, "POST", start);
    assert.equal(response.status, 202, await response.clone().text());
    const job = (await response.json()) as GenerationDto;
    const repeated = await request(jobsPath, "POST", start);
    assert.equal(repeated.status, 202);
    assert.equal(((await repeated.json()) as GenerationDto).id, job.id);
    assert.equal(
      (await request(jobsPath, "POST", { ...start, description: "Changed" }))
        .status,
      409,
    );
    assert.equal(
      (
        await request(jobsPath, "POST", {
          ...start,
          clientRequestId: randomUUID(),
        })
      ).status,
      409,
    );
    const saveBody = {
      expectedRevision: testScenario.contentRevision,
      columns: testScenario.columns,
      cases: [],
    };
    assert.equal(
      (await request(`${path}/content`, "PUT", saveBody)).status,
      409,
    );
    assert.equal(
      (
        await request(`${path}/view`, "PUT", {
          expectedRevision: testScenario.viewRevision,
          columns: testScenario.view,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await request(`${prefix}/${other.id}/content`, "PUT", {
          ...saveBody,
          columns: other.columns,
        })
      ).status,
      200,
    );
    release?.();
    async function finished(id: string) {
      for (let attempt = 0; attempt < 100; attempt++) {
        const response = await request(jobsPath);
        assert.equal(response.status, 200);
        const jobs = (await response.json()) as { items: GenerationDto[] };
        const current = jobs.items.find((item) => item.id === id);
        if (current && current.status !== "running") return current;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Generation did not finish");
    }
    let completed = await finished(job.id);
    assert.equal(completed.status, "succeeded", completed.error ?? "");
    assert.equal(calls, 1, "Repeated request must not call the provider again");
    const callRecords = async (jobId: string) =>
      (
        await lease.lock.query("SELECT * FROM ai_call_usage WHERE job_id=$1", [
          jobId,
        ])
      ).rows;
    const [call] = await callRecords(job.id);
    assert.equal((await callRecords(job.id)).length, 1);
    assert.equal(call.input_tokens, "170");
    assert.equal(call.output_tokens, "40");
    assert.equal(call.calculated_cost_usd, "0.000036450000");
    assert.equal(call.status, "succeeded");
    assert.equal(call.usage_known, true);
    const timing = (
      await lease.lock.query(
        "SELECT finished_at,duration_ms FROM generation_jobs WHERE id=$1",
        [job.id],
      )
    ).rows[0];
    assert.ok(timing.finished_at instanceof Date);
    assert.ok(Number(timing.duration_ms) >= Number(call.duration_ms));
    const generated = (await (
      await request(path)
    ).json()) as TestScenarioSnapshotDto;
    assert.equal(generated.cases.length, 1);
    assert.equal(generated.cases[0].title, content().title);
    const candidatePath = `${jobsPath}/${job.id}/results/${completed.results[0].id}`;
    for (const action of ["exclude", "restore", "edit", "add"] as const) {
      const before = completed.revision;
      const review = await request(candidatePath, "PUT", {
        expectedRevision: before,
        action,
        ...(action === "edit"
          ? {
              content: {
                ...completed.results[0].content,
                title: "Reviewed",
              },
            }
          : {}),
      });
      assert.equal(review.status, 200, await review.clone().text());
      completed = (await review.json()) as GenerationDto;
      assert.equal(completed.revision, before + 1);
      assert.equal(
        completed.results[0].status,
        action === "exclude"
          ? "excluded"
          : action === "add"
            ? "added"
            : "pending",
      );
    }
    assert.equal(
      (
        await request(candidatePath, "PUT", {
          expectedRevision: completed.revision,
          action: "add",
        })
      ).status,
      409,
    );
    const reviewed = (await (
      await request(path)
    ).json()) as TestScenarioSnapshotDto;
    assert.equal(reviewed.cases.length, 2);
    assert.equal(reviewed.cases[1].title, "Reviewed");
    invalid = true;
    const failedResponse = await request(jobsPath, "POST", {
      ...start,
      clientRequestId: randomUUID(),
      expectedRevision: reviewed.contentRevision,
    });
    assert.equal(failedResponse.status, 202);
    const failedJob = (await failedResponse.json()) as GenerationDto;
    assert.equal((await finished(failedJob.id)).status, "failed");
    const [failedCall] = await callRecords(failedJob.id);
    assert.equal(failedCall.usage_known, true);
    assert.equal(failedCall.calculated_cost_usd, call.calculated_cost_usd);
    assert.equal(
      failedCall.status,
      "succeeded",
      "Provider success remains recorded when result validation fails",
    );
    const preserved = (await (
      await request(path)
    ).json()) as TestScenarioSnapshotDto;
    assert.deepEqual(preserved.cases, reviewed.cases);
    assert.equal(preserved.contentRevision, reviewed.contentRevision);
    assert.equal(
      (
        await request(`${path}/content`, "PUT", {
          expectedRevision: preserved.contentRevision,
          columns: preserved.columns,
          cases: preserved.cases,
        })
      ).status,
      200,
      "Failed generation must release the testScenario lock",
    );
    const interruptedCallId = randomUUID();
    await lease.lock.query(
      "UPDATE generation_jobs SET status='running',finished_at=NULL,duration_ms=NULL,expires_at=now()-interval '1 second' WHERE id=$1",
      [failedJob.id],
    );
    await lease.lock.query(
      "INSERT INTO ai_call_usage(id,job_id,project_id,provider,requested_model,started_at) VALUES ($1,$2,$3,'anthropic','synthetic-model',now())",
      [interruptedCallId, failedJob.id, project.id],
    );
    await request(jobsPath);
    const interrupted = (await callRecords(failedJob.id)).find(
      (row) => row.id === interruptedCallId,
    );
    assert.equal(interrupted.status, "unknown");
    assert.equal(interrupted.usage_known, false);
    assert.equal(interrupted.duration_ms, null);
    assert.equal(interrupted.calculated_cost_usd, null);
    assert.equal(
      (await callRecords(failedJob.id)).find((row) => row.id === failedCall.id)
        .status,
      "succeeded",
    );
  } finally {
    release?.();
    await app?.close();
    global.fetch = originalFetch;
    await lease.close();
  }
});
