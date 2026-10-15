import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import type {
  CaseContentDto,
  SheetSnapshotDto,
} from "../src/contracts/sheets.dto";
import {
  files,
  iaItems,
  projectTemplates,
  testCases,
  uploadFrames,
  uploads,
} from "../src/database/schema";
import { openTestDatabase } from "./database";

function draft(extra: Partial<CaseContentDto> = {}): CaseContentDto {
  return {
    id: randomUUID(),
    caseCode: "",
    title: "",
    preconditions: "",
    steps: "",
    expectedResult: "",
    priority: null,
    relatedFrameIds: [],
    screenIds: [],
    customValues: {},
    ...extra,
  };
}
test("sheet HTTP persistence, conflict, template copy and exports", async (t) => {
  const lease = await openTestDatabase();
  let app: INestApplication | undefined;
  try {
    const module = await Test.createTestingModule({
      imports: [appModule(lease.config, lease.folder)],
    }).compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app, lease.config);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    async function request(path: string, method = "GET", body?: unknown) {
      return fetch(`${base}/api/v1${path}`, {
        method,
        headers:
          body === undefined
            ? undefined
            : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    }
    async function project() {
      const response = await request("/projects", "POST", { name: "2B 검증" });
      assert.equal(response.status, 201);
      const result = (await response.json()) as { id: string };
      lease.projects.push(result.id);
      return result.id;
    }
    const projectId = await project();
    const otherProject = await project();
    const prefix = `/projects/${projectId}/sheets`;
    async function create(uploadId?: string): Promise<SheetSnapshotDto> {
      const response = await request(prefix, "POST", {
        name: "빈 시트",
        kind: "unit",
        uploadId,
      });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json() as Promise<SheetSnapshotDto>;
    }
    async function save(
      sheet: SheetSnapshotDto,
      cases: CaseContentDto[],
      columns = sheet.columns,
    ) {
      return request(`${prefix}/${sheet.id}/content`, "PUT", {
        expectedRevision: sheet.contentRevision,
        columns,
        cases,
      });
    }
    await t.test(
      "new sheets copy the template with fresh IDs and existing sheets remain independent",
      async () => {
        const first = await create();
        assert.equal(first.columns.length, 8);
        assert.deepEqual(first.cases, []);
        assert.equal(first.view[0].width, 180);
        const [template] = await lease.database.db
          .select()
          .from(projectTemplates)
          .where(eq(projectTemplates.projectId, projectId));
        assert.ok(
          first.columns.every(
            (c) => !template.columns.some((n) => n.id === c.id),
          ),
        );
        await lease.database.db
          .update(projectTemplates)
          .set({
            revision: template.revision + 1,
            columns: template.columns.map((c) => ({
              ...c,
              name: `${c.name} 수정`,
            })),
          })
          .where(eq(projectTemplates.projectId, projectId));
        const second = await create();
        assert.equal(second.sourceTemplateRevision, template.revision + 1);
        assert.ok(second.columns.every((c) => c.name.endsWith(" 수정")));
        const reread = (await (
          await request(`${prefix}/${first.id}`)
        ).json()) as SheetSnapshotDto;
        assert.deepEqual(reread, first);
        assert.equal(
          (await request(`/projects/${otherProject}/sheets/${first.id}`))
            .status,
          404,
        );
      },
    );
    await t.test(
      "concurrent content revisions preserve drafts, UUIDs and atomic numbering/order swaps",
      async () => {
        const sheet = await create();
        const cases = [draft({ title: "첫 행" }), draft({ title: "둘째 행" })];
        const responses = await Promise.all([
          save(sheet, cases),
          save(sheet, [draft({ title: "다른 입력" })]),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
        const winner = (await responses
          .find((r) => r.status === 200)
          ?.json()) as SheetSnapshotDto;
        const loser = (await responses
          .find((r) => r.status === 409)
          ?.json()) as {
          error: { details: { resource: string; currentRevision: number } };
        };
        assert.equal(loser.error.details.resource, "content");
        assert.equal(loser.error.details.currentRevision, 2);
        const normalized = (await (
          await save(winner, [
            draft({ title: "번호 교환 1" }),
            draft({ title: "번호 교환 2" }),
          ])
        ).json()) as SheetSnapshotDto;
        const numbered = normalized.cases;
        assert.ok(numbered.every((c) => /^TC-\d{3,}$/.test(c.caseCode)));
        const reordered = [
          { ...numbered[1], caseCode: numbered[0].caseCode },
          { ...numbered[0], caseCode: numbered[1].caseCode },
        ];
        const response = await save(normalized, reordered);
        assert.equal(response.status, 200, await response.clone().text());
        const result = (await response.json()) as SheetSnapshotDto;
        assert.deepEqual(
          result.cases.map((c) => c.id),
          reordered.map((c) => c.id),
        );
        assert.deepEqual(
          result.cases.map((c) => c.caseCode),
          reordered.map((c) => c.caseCode),
        );
        const before = await request(`${prefix}/${sheet.id}`);
        const invalid = await save(result, [
          { ...result.cases[0], screenIds: [randomUUID()] },
        ]);
        assert.equal(invalid.status, 400);
        assert.deepEqual(
          await (await request(`${prefix}/${sheet.id}`)).json(),
          await before.json(),
        );
      },
    );
    await t.test(
      "custom column deletion removes values and invalidates stale view saves atomically",
      async () => {
        let sheet = await create();
        const custom = {
          id: randomUUID(),
          name: "메모",
          kind: "custom" as const,
          valueType: "text" as const,
        };
        sheet = (await (
          await save(
            sheet,
            [draft({ customValues: { [custom.id]: "입력 유지" } })],
            [...sheet.columns, custom],
          )
        ).json()) as SheetSnapshotDto;
        assert.equal(sheet.viewRevision, 2);
        assert.equal(sheet.view.at(-1)?.columnId, custom.id);
        const removed = await save(
          sheet,
          sheet.cases.map((c) => ({ ...c, customValues: {} })),
          sheet.columns.filter((c) => c.id !== custom.id),
        );
        assert.equal(removed.status, 200);
        const result = (await removed.json()) as SheetSnapshotDto;
        assert.equal(result.viewRevision, 3);
        assert.deepEqual(result.cases[0].customValues, {});
        const stale = await request(`${prefix}/${sheet.id}/view`, "PUT", {
          expectedRevision: 2,
          columns: sheet.view,
        });
        assert.equal(stale.status, 409);
        assert.equal(
          ((await stale.json()) as { error: { details: { resource: string } } })
            .error.details.resource,
          "view",
        );
        assert.equal(
          (await save(result, result.cases, result.columns.slice(1))).status,
          400,
        );
        const otherSheet = await create();
        assert.equal(
          (
            await save(result, result.cases, [
              ...result.columns,
              { ...custom, id: otherSheet.columns[0].id },
            ])
          ).status,
          400,
        );
      },
    );
    await t.test(
      "upload filtering, references and entire-sheet text export use one saved revision",
      async () => {
        const uploadId = randomUUID();
        const frameId = randomUUID();
        const screenId = randomUUID();
        const imageId = randomUUID(),
          dataId = randomUUID();
        await lease.database.db.insert(files).values([
          {
            id: imageId,
            projectId,
            storageKey: `${projectId}/${imageId}`,
            originalName: "frame.png",
            mediaType: "image/png",
            byteSize: 1,
            sha256: "0".repeat(64),
            status: "ready",
          },
          {
            id: dataId,
            projectId,
            storageKey: `${projectId}/${dataId}`,
            originalName: "frame.json",
            mediaType: "application/json",
            byteSize: 2,
            sha256: "0".repeat(64),
            status: "ready",
          },
        ]);
        await lease.database.db.insert(uploads).values({
          id: uploadId,
          projectId,
          name: "프레임 묶음",
          clientRequestId: randomUUID(),
          requestHash: "0".repeat(64),
        });
        await lease.database.db.insert(uploadFrames).values({
          id: frameId,
          projectId,
          uploadId,
          position: 0,
          name: "주문",
          figmaFileKey: "file",
          figmaNodeId: "1:2",
          width: 100,
          height: 100,
          imageFileId: imageId,
          dataFileId: dataId,
        });
        await lease.database.db.insert(iaItems).values({
          id: screenId,
          projectId,
          screenId: "ORD-01",
          name: "주문",
          position: 0,
        });
        let sheet = await create(uploadId);
        const filtered = (await (
          await request(`${prefix}?uploadId=${uploadId}`)
        ).json()) as { items: { id: string }[] };
        assert.deepEqual(
          filtered.items.map((s: { id: string }) => s.id),
          [sheet.id],
        );
        assert.equal(
          (await request(`${prefix}?uploadId=${randomUUID()}`)).status,
          404,
        );
        assert.equal(
          (
            await request(
              `/projects/${otherProject}/sheets?uploadId=${uploadId}`,
            )
          ).status,
          404,
        );
        assert.equal(
          (
            await request(prefix, "POST", {
              name: "test",
              kind: "unit",
              uploadId: randomUUID(),
            })
          ).status,
          404,
        );
        sheet = (await (
          await save(sheet, [
            draft({
              title: "=SUM(1,2)\n한글 😀",
              relatedFrameIds: [frameId],
              screenIds: [screenId],
            }),
            draft({ title: "검색 밖 행" }),
          ])
        ).json()) as SheetSnapshotDto;
        assert.equal(sheet.references.frames[0].id, frameId);
        assert.equal(sheet.references.iaItems[0].screenId, "ORD-01");
        const path = `${prefix}/${sheet.id}/export.xlsx`;
        assert.equal((await request(`${path}?contentRevision=1`)).status, 409);
        assert.equal((await request(`${path}?search=검색`)).status, 400);
        const response = await request(
          `${path}?contentRevision=${sheet.contentRevision}&viewRevision=${sheet.viewRevision}`,
        );
        assert.equal(response.status, 200);
        assert.match(
          response.headers.get("content-disposition") ?? "",
          /filename\*=UTF-8/,
        );
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await response.arrayBuffer());
        const worksheet = workbook.worksheets[0];
        assert.equal(worksheet.rowCount, 3);
        const values = worksheet.getRow(2).values;
        assert.ok(
          Array.isArray(values) &&
            values.includes("=SUM(1,2)\n한글 😀") &&
            values.includes("ORD-01 주문") &&
            values.includes("주문"),
        );
        await lease.database.db
          .update(iaItems)
          .set({ screenId: "ORDER-NEW" })
          .where(eq(iaItems.id, screenId));
        const afterRename = (await (
          await request(`${prefix}/${sheet.id}`)
        ).json()) as SheetSnapshotDto;
        assert.deepEqual(afterRename.cases[0].screenIds, [screenId]);
        assert.equal(afterRename.references.iaItems[0].screenId, "ORDER-NEW");
      },
    );
    await t.test(
      "500 cases persist and export without a case-count cap",
      async () => {
        let sheet = await create();
        const custom = Array.from({ length: 5 }, (_, i) => ({
          id: randomUUID(),
          kind: "custom" as const,
          valueType: "text" as const,
          name: `사용자 ${i + 1}`,
        }));
        const cases = Array.from({ length: 500 }, (_, i) =>
          draft({
            title: `케이스 ${i + 1}`,
            steps: "긴 수행 단계\n".repeat(10),
            customValues: Object.fromEntries(
              custom.map((c) => [c.id, `값 ${i}`]),
            ),
          }),
        );
        const start = performance.now();
        const response = await save(sheet, cases, [
          ...sheet.columns,
          ...custom,
        ]);
        assert.equal(response.status, 200, await response.clone().text());
        sheet = (await response.json()) as SheetSnapshotDto;
        assert.equal(sheet.cases.length, 500);
        assert.equal(new Set(sheet.cases.map((c) => c.caseCode)).size, 500);
        const bytes = Buffer.byteLength(JSON.stringify(sheet));
        const savedMs = performance.now() - start;
        const startExport = performance.now();
        const exported = await request(`${prefix}/${sheet.id}/export.xlsx`);
        assert.equal(exported.status, 200);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await exported.arrayBuffer());
        assert.equal(workbook.worksheets[0].rowCount, 501);
        assert.equal(workbook.worksheets[0].columnCount, 13);
        t.diagnostic(
          `500 cases: save=${Math.round(savedMs)}ms payload=${bytes} bytes export+read=${Math.round(performance.now() - startExport)}ms`,
        );
        const persisted = await lease.database.db
          .select({ id: testCases.id })
          .from(testCases)
          .where(eq(testCases.sheetId, sheet.id));
        assert.equal(persisted.length, 500);
      },
    );
  } finally {
    await app?.close();
    await lease.close();
  }
});
