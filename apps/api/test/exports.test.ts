import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { ApiError } from "../src/common/errors";
import type { SheetSnapshotDto } from "../src/contracts/sheets.dto";
import { createXlsx, downloadName } from "../src/exports/xlsx";

function fixture(): SheetSnapshotDto {
  const column = {
    id: randomUUID(),
    kind: "custom" as const,
    name: "메모",
    valueType: "text" as const,
  };
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    name: "주문 QA",
    kind: "unit",
    uploadId: null,
    contentRevision: 2,
    viewRevision: 3,
    sourceTemplateRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns: [column],
    view: [{ columnId: column.id, width: 180 }],
    cases: [],
    references: { frames: [], iaItems: [] },
  };
}
test("XLSX exports saved order and literal multiline text without formulas or UUID columns", async () => {
  const snapshot = fixture();
  const field = snapshot.columns[0].id;
  const text = "=SUM(1,2)\n00123\t한글 😀";
  snapshot.cases.push({
    id: randomUUID(),
    caseCode: "TC-001",
    title: "",
    preconditions: "",
    steps: "",
    expectedResult: "",
    priority: null,
    relatedFrameIds: [],
    screenIds: [],
    customValues: { [field]: text },
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await createXlsx(snapshot)).buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.columnCount, 1);
  assert.equal(sheet.getCell("A1").value, "메모");
  assert.equal(sheet.getCell("A2").value, text);
  assert.equal(sheet.getCell("A2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("A2").formula, undefined);
  assert.equal(sheet.views[0].state, "frozen");
  snapshot.columns[0].name = "새 열 이름";
  snapshot.cases = [];
  await workbook.xlsx.load(Uint8Array.from(await createXlsx(snapshot)).buffer);
  assert.equal(workbook.worksheets[0].getCell("A1").value, "새 열 이름");
  assert.equal(workbook.worksheets[0].rowCount, 1);
});
test("XLSX rejects unrepresentable text instead of truncating, including headers and linked labels", async () => {
  const snapshot = fixture();
  const field = snapshot.columns[0].id;
  snapshot.cases.push({
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
  });
  for (const text of [
    "a".repeat(32768),
    "\n".repeat(254),
    String.fromCharCode(0),
    String.fromCharCode(0xd800),
  ]) {
    snapshot.cases[0].customValues[field] = text;
    await assert.rejects(
      () => createXlsx(snapshot),
      (error) =>
        error instanceof ApiError &&
        error.code === "EXPORT_LIMIT_EXCEEDED" &&
        error.getStatus() === 422,
    );
  }
  snapshot.cases[0].customValues[field] = "a".repeat(32767);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(await createXlsx(snapshot)).buffer);
  assert.equal(
    String(workbook.worksheets[0].getCell("A2").value).length,
    32767,
  );
  snapshot.columns[0].name = "a".repeat(32768);
  await assert.rejects(() => createXlsx(snapshot), ApiError);
  assert.equal(downloadName("../주문\nQA"), ".._주문_QA.xlsx");
});
