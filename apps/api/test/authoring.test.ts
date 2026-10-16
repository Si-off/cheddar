import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import type { EvidenceDto } from "../src/contracts/evidence.dto";
import type { GenerationDto } from "../src/contracts/generation.dto";
import type { SheetSnapshotDto } from "../src/contracts/sheets.dto";
import type { UploadDto } from "../src/contracts/uploads.dto";
import { LocalStorage } from "../src/storage/local-storage";
import { extractEvidence } from "../src/uploads/extract-evidence";
import { openTestDatabase } from "./database";

const sourceDocument = {
  document: {
    document: {
      id: "1:1",
      type: "FRAME",
      name: "주문서",
      absoluteBoundingBox: { x: 100, y: 100, width: 400, height: 800 },
      children: [
        {
          id: "1:2",
          type: "TEXT",
          name: "정책",
          characters: "쿠폰은 상품 금액에서 차감한다.",
          absoluteBoundingBox: { x: 120, y: 200, width: 300, height: 40 },
        },
      ],
    },
  },
};
test("source extraction preserves exact text and relative original location", () => {
  const items = extractEvidence(sourceDocument, randomUUID());
  const text = items.find((i) => i.kind === "requirement");
  assert.equal(text?.text, "쿠폰은 상품 금액에서 차감한다.");
  assert.equal(text?.nodeId, "1:2");
  assert.deepEqual(text?.region, {
    x: 0.05,
    y: 0.125,
    width: 0.75,
    height: 0.04999999999999999,
  });
  assert.equal(text?.parentId, items[0].id);
  assert.throws(() =>
    extractEvidence({ arbitrary: "unsupported" }, randomUUID()),
  );
});
test("authoring HTTP flow preserves existing cases, scopes AI sources, stores answers and adds reviewed cases atomically", async () => {
  const lease = await openTestDatabase();
  const originalFetch = global.fetch;
  const requests: {
    schema: Record<string, unknown>;
    text: string;
    images: number;
  }[] = [];
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
  const app = module.createNestApplication({ logger: false });
  configureApp(app, config);
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    global.fetch = async (url, options) => {
      if (!String(url).startsWith("https://api.anthropic.com/"))
        return originalFetch(url, options);
      const body = JSON.parse(String(options?.body));
      const schema = body.output_config.format.schema;
      const text = body.messages[0].content[0].text;
      requests.push({
        schema,
        text,
        images: body.messages[0].content.filter(
          (p: { type: string }) => p.type === "image",
        ).length,
      });
      const input = JSON.parse(text);
      let result: unknown;
      if (schema.properties.sources) {
        result = {
          sources: input.sourceCandidates.map(
            (i: {
              id: string;
              title: string;
              kind: string;
              parentId?: string;
            }) => ({
              sourceId: i.id,
              title: i.title,
              kind: i.kind,
              parentSourceId: i.parentId ?? null,
            }),
          ),
          relations: [],
        };
      } else {
        const props = schema.properties.cases.items.properties;
        const row = {
          title: "쿠폰 적용",
          preconditions: "",
          steps: "쿠폰을 선택한다.",
          expectedResult: "쿠폰 금액이 차감된다.",
          priority: null,
          ...(props.relatedFrameIds
            ? { relatedFrameIds: [props.relatedFrameIds.items.enum[0]] }
            : {}),
          ...(props.requirementIds
            ? { requirementIds: [props.requirementIds.items.enum[0]] }
            : {}),
          ...(props.customValues
            ? {
                customValues:
                  props.customValues.items.properties.columnId.enum.map(
                    (columnId: string) => ({ columnId, value: "" }),
                  ),
              }
            : {}),
        };
        result = {
          cases: [row],
          candidates: [
            {
              reason: "결제 실패 후 쿠폰 처리 정책을 확인한다.",
              content: { ...row, title: "결제 실패 후 쿠폰 처리" },
            },
          ],
        };
      }
      return new Response(
        JSON.stringify({
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify(result) }],
        }),
        { status: 200 },
      );
    };
    const req = (path: string, method = "GET", body?: unknown) =>
      originalFetch(base + "/api/v1" + path, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
    const createProject = async () => {
      const response = await req("/projects", "POST", {
        name: "Authoring test",
      });
      assert.equal(response.status, 201);
      const p = (await response.json()) as { id: string };
      lease.projects.push(p.id);
      return p.id;
    };
    const projectId = await createProject(),
      otherProject = await createProject();
    const prefix = `/projects/${projectId}`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    );
    async function file(image: boolean) {
      const form = new FormData();
      form.set(
        "file",
        new Blob([image ? png : Buffer.from(JSON.stringify(sourceDocument))], {
          type: image ? "image/png" : "application/json",
        }),
        image ? "screen.png" : "source.json",
      );
      const res = await originalFetch(base + `/api/v1${prefix}/files`, {
        method: "POST",
        body: form,
      });
      assert.equal(res.status, 201);
      return ((await res.json()) as { id: string }).id;
    }
    const imageFileId = await file(true),
      dataFileId = await file(false);
    const uploadResponse = await req(`${prefix}/uploads`, "POST", {
      clientRequestId: randomUUID(),
      name: "Screens",
      frames: ["1:1", "2:1"].map((figmaNodeId, index) => ({
        figmaFileKey: "source-key",
        figmaNodeId,
        name: index ? "다른 화면" : "주문서",
        width: 400,
        height: 800,
        imageFileId,
        dataFileId,
      })),
    });
    assert.equal(uploadResponse.status, 201);
    const upload = (await uploadResponse.json()) as UploadDto;
    const sheet = (await (
      await req(`${prefix}/sheets`, "POST", {
        name: "QA",
        kind: "unit",
        uploadId: upload.id,
      })
    ).json()) as SheetSnapshotDto;
    const manual = {
      id: randomUUID(),
      caseCode: "MANUAL-1",
      title: "사람이 작성한 케이스",
      preconditions: "",
      steps: "기존 절차",
      expectedResult: "기존 결과",
      priority: null,
      relatedFrameIds: [],
      screenIds: [],
      customValues: {},
    };
    let saved = (await (
      await req(`${prefix}/sheets/${sheet.id}/content`, "PUT", {
        expectedRevision: sheet.contentRevision,
        columns: sheet.columns,
        cases: [manual],
      })
    ).json()) as SheetSnapshotDto;
    const wrongFrame = await req(
      `${prefix}/sheets/${sheet.id}/generations`,
      "POST",
      {
        mode: "review",
        clientRequestId: randomUUID(),
        provider: "anthropic",
        expectedRevision: saved.contentRevision,
        uploadId: upload.id,
        frameIds: [randomUUID()],
      },
    );
    assert.equal(wrongFrame.status, 400);
    const start = {
      mode: "review",
      clientRequestId: randomUUID(),
      provider: "anthropic",
      expectedRevision: saved.contentRevision,
      uploadId: upload.id,
      frameIds: [upload.frames[0].id],
    };
    const started = await req(
      `${prefix}/sheets/${sheet.id}/generations`,
      "POST",
      start,
    );
    assert.equal(started.status, 202, await started.clone().text());
    const job = (await started.json()) as GenerationDto;
    async function finished(id: string) {
      for (let n = 0; n < 100; n++) {
        const list = (await (
          await req(`${prefix}/sheets/${sheet.id}/generations`)
        ).json()) as { items: GenerationDto[] };
        const current = list.items.find((j) => j.id === id);
        if (current?.status !== "running") return current;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      throw new Error("Generation timeout");
    }
    let result = await finished(job.id);
    assert.equal(result?.status, "succeeded", result?.error ?? "");
    assert.ok(result);
    assert.equal(result.mode, "review");
    assert.equal(requests.length, 2);
    assert.equal(
      requests.every((r) => r.images === 1),
      true,
    );
    saved = (await (
      await req(`${prefix}/sheets/${sheet.id}`)
    ).json()) as SheetSnapshotDto;
    assert.deepEqual(
      saved.cases.map((c) => c.id),
      [manual.id],
    );
    const generated = result.candidates.find((c) => c.kind === "case");
    assert.ok(generated);
    let evidence = (await (
      await req(`${prefix}/evidence`)
    ).json()) as EvidenceDto;
    assert.equal(
      evidence.items.some((i) => i.kind === "question"),
      true,
    );
    assert.equal(
      evidence.items
        .filter((i) => i.frameId)
        .every((i) => i.frameId === upload.frames[0].id),
      true,
    );
    assert.equal(
      (
        await req(`/projects/${otherProject}/evidence`, "PUT", {
          ...evidence,
          revision: 0,
        })
      ).status,
      400,
      "source frames cannot cross projects",
    );
    const cyclic = {
      ...evidence,
      items: evidence.items.map((i, index) =>
        index === 0 ? { ...i, parentId: i.id } : i,
      ),
    };
    assert.equal((await req(`${prefix}/evidence`, "PUT", cyclic)).status, 400);
    assert.equal(
      (await req(`${prefix}/evidence`, "PUT", { ...evidence, revision: 0 }))
        .status,
      409,
    );
    const addition = {
      expectedRevision: result.revision,
      sheetRevision: saved.contentRevision,
      candidateIds: [generated.id],
    };
    const changed = await req(`${prefix}/sheets/${sheet.id}/content`, "PUT", {
      expectedRevision: saved.contentRevision,
      columns: saved.columns,
      cases: [{ ...manual, title: "수정 보존" }],
    });
    assert.equal(changed.status, 200);
    saved = (await changed.json()) as SheetSnapshotDto;
    const addPath = `${prefix}/sheets/${sheet.id}/generations/${job.id}/add`;
    assert.equal(
      (await req(addPath, "POST", addition)).status,
      409,
      "stale sheet revision must preserve current edits",
    );
    const added = await req(addPath, "POST", {
      ...addition,
      sheetRevision: saved.contentRevision,
    });
    assert.equal(added.status, 201, await added.clone().text());
    result = (await added.json()) as GenerationDto;
    saved = (await (
      await req(`${prefix}/sheets/${sheet.id}`)
    ).json()) as SheetSnapshotDto;
    assert.equal(saved.cases.length, 2);
    assert.equal(saved.cases[0].title, "수정 보존");
    assert.equal(
      (
        await req(addPath, "POST", {
          ...addition,
          expectedRevision: result.revision,
          sheetRevision: saved.contentRevision,
        })
      ).status,
      400,
      "added result cannot be added twice",
    );
    evidence = (await (await req(`${prefix}/evidence`)).json()) as EvidenceDto;
    assert.equal(
      evidence.links.some((l) => l.caseId === generated.id),
      true,
    );
    const question = evidence.items.find((i) => i.kind === "question");
    assert.ok(question);
    question.answer = "결제 실패 시 쿠폰을 다시 사용할 수 있다.";
    question.useAsRule = false;
    const answer = await req(`${prefix}/evidence`, "PUT", evidence);
    assert.equal(answer.status, 200);
    const refine = await req(
      `${prefix}/sheets/${sheet.id}/generations`,
      "POST",
      {
        mode: "review",
        clientRequestId: randomUUID(),
        provider: "anthropic",
        expectedRevision: saved.contentRevision,
        uploadId: null,
        requirementIds: [question.id],
        description: "후보 보완",
      },
    );
    assert.equal(refine.status, 202);
    const refined = await finished(((await refine.json()) as GenerationDto).id);
    assert.equal(refined?.status, "succeeded", refined?.error ?? "");
    assert.ok(requests.at(-1)?.text.includes(question.answer));
    assert.equal(
      requests.at(-1)?.images,
      1,
      "refinement loads the requirement source image without manual relinking",
    );
  } finally {
    global.fetch = originalFetch;
    await app.close();
    await lease.close();
  }
});
