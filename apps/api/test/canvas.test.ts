import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import ExcelJS from "exceljs";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import type {
  CanvasSnapshotDto,
  FlowDocumentDto,
  FlowGenerationDto,
} from "../src/contracts/canvas.dto";
import type { TestScenarioSnapshotDto } from "../src/contracts/test-scenarios.dto";
import { projectAnalysis } from "../src/database/schema";
import { openTestDatabase } from "./database";

test("canvas stores independent flow/layout revisions, references, backups and AI drafts", async (t) => {
  const lease = await openTestDatabase();
  let app: INestApplication | undefined;
  const originalFetch = globalThis.fetch;
  let providerResult: unknown;
  let providerFail = false;
  let calls = 0;
  const inputs: Record<string, unknown>[] = [];
  globalThis.fetch = (async (input, init) => {
    if (
      typeof input === "string" &&
      (input.startsWith("https://api.anthropic.com/") ||
        input.startsWith("https://api.openai.com/"))
    ) {
      calls++;
      inputs.push(JSON.parse(String(init?.body)));
      if (providerFail) return new Response("{}", { status: 500 });
      return Response.json(
        input.includes("anthropic")
          ? {
              stop_reason: "end_turn",
              usage: { input_tokens: 120, output_tokens: 30 },
              content: [{ type: "text", text: JSON.stringify(providerResult) }],
            }
          : {
              status: "completed",
              output: [
                {
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify(providerResult),
                    },
                  ],
                },
              ],
            },
      );
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    const config = {
      ...lease.config,
      ai: {
        anthropicKey: "test-only",
        openaiKey: "test-only",
        anthropicModel: "synthetic",
        openaiModel: "synthetic",
      },
    };
    const module = await Test.createTestingModule({
      imports: [appModule(config, lease.folder)],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, config);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const req = (path: string, method = "GET", body?: unknown) =>
      fetch(`${base}/api/v1${path}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    const ok = async <T>(
      path: string,
      method = "GET",
      body?: unknown,
    ): Promise<T> => {
      const r = await req(path, method, body);
      assert.ok(r.ok, await r.clone().text());
      return r.json() as Promise<T>;
    };
    const p = await ok<{ id: string }>("/projects", "POST", {
      name: "캔버스 검증",
    });
    lease.projects.push(p.id);
    const prefix = `/projects/${p.id}/test-scenarios`;
    let snapshot = await ok<TestScenarioSnapshotDto>(prefix, "POST", {
      name: "로그인",
      kind: "integration",
    });
    const path = `${prefix}/${snapshot.id}`;
    const column = randomUUID(),
      option = randomUUID(),
      first = randomUUID(),
      second = randomUUID();
    const saveCases = async (
      cases = snapshot.cases,
      columns = snapshot.columns,
    ) => {
      snapshot = await ok(`${path}/content`, "PUT", {
        expectedRevision: snapshot.contentRevision,
        columns,
        cases,
      });
    };
    await saveCases(
      [first, second].map((id, i) => ({
        id,
        caseCode: `TC-${i + 1}`,
        title: `로그인 ${i + 1}`,
        relatedFrameIds: [],
        screenIds: [],
        customValues: { [column]: [option] },
      })),
      [
        ...snapshot.columns,
        {
          id: column,
          kind: "custom",
          name: "분류",
          valueType: "tags",
          options: [{ id: option, name: "인증" }],
        },
      ],
    );
    const casesBefore = structuredClone(snapshot.cases);
    let canvas = await ok<CanvasSnapshotDto>(`${path}/canvas`);
    const start = randomUUID(),
      action = randomUUID(),
      end = randomUUID();
    const flow: FlowDocumentDto = {
      steps: [
        {
          id: start,
          title: "시작",
          kind: "start",
          description: "",
          caseIds: [],
        },
        {
          id: action,
          title: "로그인",
          kind: "action",
          description: "인증을 확인한다",
          caseIds: [first, second],
        },
        {
          id: end,
          title: "결과",
          kind: "condition",
          description: "",
          caseIds: [first],
        },
      ],
      edges: [
        { id: randomUUID(), from: start, to: action, condition: "" },
        { id: randomUUID(), from: action, to: end, condition: "성공" },
        { id: randomUUID(), from: end, to: action, condition: "재시도" },
        { id: randomUUID(), from: end, to: end, condition: "대기" },
      ],
    };
    await t.test(
      "layout and graph do not affect canonical cases or export rows",
      async () => {
        canvas = await ok(`${path}/flow`, "PUT", {
          expectedRevision: canvas.flowRevision,
          contentRevision: snapshot.contentRevision,
          flow,
        });
        assert.equal(canvas.layoutRevision, 1);
        canvas = await ok(`${path}/canvas-layout`, "PUT", {
          expectedRevision: canvas.layoutRevision,
          layout: {
            groupBy: column,
            positions: [{ id: `f:${start}`, x: 300, y: -25 }],
            collapsed: [],
          },
        });
        assert.equal(canvas.flowRevision, 2);
        assert.deepEqual(
          (await ok<TestScenarioSnapshotDto>(path)).cases,
          casesBefore,
        );
        const response = await req(
          path +
            `/export.xlsx?contentRevision=${snapshot.contentRevision}&viewRevision=${snapshot.viewRevision}`,
        );
        assert.equal(response.status, 200, await response.clone().text());
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(await response.arrayBuffer());
        assert.equal(book.worksheets[0].rowCount, 3);
      },
    );
    await t.test(
      "rejects stale writes, unknown case references and out-of-scenario IDs",
      async () => {
        assert.equal(
          (
            await req(`${path}/flow`, "PUT", {
              expectedRevision: 1,
              contentRevision: snapshot.contentRevision,
              flow,
            })
          ).status,
          409,
        );
        assert.equal(
          (
            await req(`${path}/flow`, "PUT", {
              expectedRevision: canvas.flowRevision,
              contentRevision: snapshot.contentRevision,
              flow: {
                ...flow,
                steps: [{ ...flow.steps[0], caseIds: [randomUUID()] }],
              },
            })
          ).status,
          400,
        );
        const other = await ok<{ id: string }>("/projects", "POST", {
          name: "다른 프로젝트",
        });
        lease.projects.push(other.id);
        assert.equal(
          (
            await req(
              `/projects/${other.id}/test-scenarios/${snapshot.id}/canvas`,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "case deletion prunes every flow reference atomically; renaming preserves UUID groups",
      async () => {
        await saveCases(
          snapshot.cases,
          snapshot.columns.map((c) =>
            c.id === column
              ? { ...c, name: "태그", options: [{ id: option, name: "계정" }] }
              : c,
          ),
        );
        assert.equal(
          (await ok<CanvasSnapshotDto>(`${path}/canvas`)).layout.groupBy,
          column,
        );
        await saveCases(snapshot.cases.filter((c) => c.id !== first));
        canvas = await ok(`${path}/canvas`);
        assert.equal(canvas.flowRevision, 3);
        assert.ok(canvas.flow.steps.every((s) => !s.caseIds.includes(first)));
        assert.deepEqual(canvas.flow.edges, flow.edges);
      },
    );
    await t.test(
      "replacement backup and restore retain structure while excluding deleted cases",
      async () => {
        const replacement = {
          steps: [{ ...flow.steps[0], id: randomUUID(), caseIds: [second] }],
          edges: [],
        };
        canvas = await ok(`${path}/flow/replace`, "POST", {
          flowRevision: canvas.flowRevision,
          layoutRevision: canvas.layoutRevision,
          contentRevision: snapshot.contentRevision,
          flow: replacement,
          layout: canvas.layout,
        });
        assert.ok(canvas.previous);
        assert.equal(canvas.previous.caseLabels[second], "TC-2 로그인 2");
        await saveCases([]);
        canvas = await ok(`${path}/canvas`);
        const backupId = canvas.previous?.id;
        canvas = await ok(`${path}/flow/restore`, "POST", {
          backupId,
          flowRevision: canvas.flowRevision,
          layoutRevision: canvas.layoutRevision,
          contentRevision: snapshot.contentRevision,
        });
        assert.equal(canvas.flow.steps.length, 3);
        assert.equal(canvas.flow.edges.length, 4);
        assert.ok(canvas.flow.steps.every((s) => !s.caseIds.length));
        assert.equal(canvas.previous, null);
        await saveCases(
          [],
          snapshot.columns.filter((c) => c.id !== column),
        );
        canvas = await ok(`${path}/canvas`);
        assert.equal(canvas.layout.groupBy, null);
      },
    );
    await t.test(
      "AI transport drafts are separate, idempotent and never mutate cases or active flow",
      async () => {
        await saveCases([{ ...casesBefore[0], customValues: {} }]);
        const before = structuredClone(canvas);
        providerResult = {
          steps: [
            {
              id: "a",
              title: "로그인 확인",
              kind: "action",
              description: "",
              caseIds: [first],
            },
          ],
          edges: [{ id: "retry", from: "a", to: "a", condition: "재시도" }],
        };
        async function waitJob(id: string) {
          for (let n = 0; n < 50; n++) {
            const job = (
              await ok<{ items: FlowGenerationDto[] }>(
                `${path}/flow-generations`,
              )
            ).items.find((j) => j.id === id);
            if (job && job.status !== "running") return job;
            await new Promise((r) => setTimeout(r, 20));
          }
          throw new Error("job timeout");
        }
        const body = {
          clientRequestId: randomUUID(),
          provider: "anthropic",
          contentRevision: snapshot.contentRevision,
          description: "로그인",
        };
        let job = await ok<FlowGenerationDto>(
          `${path}/flow-generations`,
          "POST",
          body,
        );
        const same = await ok<FlowGenerationDto>(
          `${path}/flow-generations`,
          "POST",
          body,
        );
        assert.equal(job.id, same.id);
        job = await waitJob(job.id);
        assert.equal(job.status, "succeeded");
        assert.equal(calls, 1);
        const usage = (
          await lease.lock.query(
            "SELECT job_id, flow_job_id, status, usage_known, input_tokens, output_tokens FROM ai_call_usage WHERE flow_job_id=$1",
            [job.id],
          )
        ).rows;
        assert.equal(usage.length, 1, "Flow generation call is recorded once");
        assert.equal(usage[0].job_id, null);
        assert.equal(usage[0].status, "succeeded");
        assert.equal(usage[0].usage_known, true);
        assert.equal(usage[0].input_tokens, "120");
        assert.equal(usage[0].output_tokens, "30");
        assert.ok(job.result);
        assert.deepEqual(
          (await ok<CanvasSnapshotDto>(`${path}/canvas`)).flow,
          before.flow,
        );
        assert.ok(JSON.stringify(inputs[0]).includes(first));
        await saveCases(
          snapshot.cases.map((c) => ({ ...c, title: "변경된 로그인" })),
        );
        assert.equal(
          (
            await req(`${path}/flow/replace`, "POST", {
              flowRevision: job.flowRevision,
              layoutRevision: job.layoutRevision,
              contentRevision: snapshot.contentRevision,
              flow: job.result,
              layout: canvas.layout,
              jobId: job.id,
            })
          ).status,
          409,
        );
        const sourceJob = await waitJob(
          (
            await ok<FlowGenerationDto>(`${path}/flow-generations`, "POST", {
              ...body,
              clientRequestId: randomUUID(),
              provider: "openai",
              contentRevision: snapshot.contentRevision,
            })
          ).id,
        );
        assert.equal(sourceJob.status, "succeeded");
        const requirement = randomUUID();
        await lease.database.db.insert(projectAnalysis).values({
          projectId: p.id,
          items: [
            {
              id: requirement,
              kind: "requirement",
              title: "연결 정책",
              text: "새 정책",
            },
          ],
          links: [
            {
              requirementId: requirement,
              testScenarioId: snapshot.id,
              caseId: first,
            },
          ],
        });
        assert.equal(
          (
            await req(`${path}/flow/replace`, "POST", {
              flowRevision: sourceJob.flowRevision,
              layoutRevision: sourceJob.layoutRevision,
              contentRevision: snapshot.contentRevision,
              flow: sourceJob.result,
              layout: canvas.layout,
              jobId: sourceJob.id,
            })
          ).status,
          409,
        );
        const fresh = await waitJob(
          (
            await ok<FlowGenerationDto>(`${path}/flow-generations`, "POST", {
              ...body,
              clientRequestId: randomUUID(),
              provider: "openai",
              contentRevision: snapshot.contentRevision,
            })
          ).id,
        );
        assert.ok(fresh.result);
        const edited = {
          ...fresh.result,
          steps: fresh.result.steps.map((step) => ({
            ...step,
            title: "담당자 수정",
          })),
        };
        canvas = await ok(`${path}/flow/replace`, "POST", {
          flowRevision: fresh.flowRevision,
          layoutRevision: fresh.layoutRevision,
          contentRevision: snapshot.contentRevision,
          flow: edited,
          layout: canvas.layout,
          jobId: fresh.id,
        });
        assert.equal(canvas.flow.steps[0].title, "담당자 수정");
        const currentFlow = structuredClone(canvas.flow);
        providerFail = true;
        const failure = await ok<FlowGenerationDto>(
          `${path}/flow-generations`,
          "POST",
          {
            ...body,
            clientRequestId: randomUUID(),
            provider: "openai",
            contentRevision: snapshot.contentRevision,
          },
        );
        assert.equal((await waitJob(failure.id)).status, "failed");
        providerFail = false;
        providerResult = {
          steps: [
            {
              id: "bad",
              title: "잘못된 참조",
              kind: "action",
              description: "",
              caseIds: [randomUUID()],
            },
          ],
          edges: [],
        };
        const invalid = await ok<FlowGenerationDto>(
          `${path}/flow-generations`,
          "POST",
          {
            ...body,
            clientRequestId: randomUUID(),
            contentRevision: snapshot.contentRevision,
          },
        );
        assert.equal((await waitJob(invalid.id)).status, "failed");
        assert.deepEqual(
          (await ok<CanvasSnapshotDto>(`${path}/canvas`)).flow,
          currentFlow,
        );
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (app) await app.close();
    await lease.close();
  }
});
