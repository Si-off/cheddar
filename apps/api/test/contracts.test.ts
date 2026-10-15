import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { decodeCursor, encodeCursor } from "../src/common/pagination";
import { readEnv } from "../src/config/env";
import { CreateIaItemDto, UpdateTemplateDto } from "../src/contracts/ia.dto";
import {
  CreateSheetDto,
  SheetContentDto,
  SheetViewDto,
  SYSTEM_FIELDS,
} from "../src/contracts/sheets.dto";
import { CreateUploadDto } from "../src/contracts/uploads.dto";
import { inspectFile, MAX_JSON_BYTES } from "../src/files/file-validation";

const columns = SYSTEM_FIELDS.map((field) => ({
  id: randomUUID(),
  kind: "system",
  field,
  name: field,
}));
const custom = {
  id: randomUUID(),
  kind: "custom",
  valueType: "text",
  name: "메모",
};
const caseValue = {
  id: randomUUID(),
  caseCode: "TC-001",
  title: "",
  preconditions: "",
  steps: "",
  expectedResult: "",
  priority: null,
  relatedFrameIds: [],
  screenIds: [],
  customValues: { [custom.id]: "검토 예정" },
};
const options = {
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
};

test("sheet contracts preserve blank drafts, system fields and stable custom keys", async () => {
  const valid = {
    expectedRevision: 1,
    columns: [...columns, custom],
    cases: [caseValue],
  };
  assert.deepEqual(
    await validate(plainToInstance(SheetContentDto, valid), options),
    [],
  );
  for (const content of [
    { ...valid, expectedRevision: 1.5 },
    { ...valid, columns: [null] },
    { ...valid, cases: [null] },
    { ...valid, columns: columns.slice(1) },
    { ...valid, columns: [...columns, { ...custom, field: "title" }] },
    { ...valid, cases: [caseValue, { ...caseValue, id: randomUUID() }] },
    {
      ...valid,
      cases: [{ ...caseValue, customValues: { [randomUUID()]: "orphan" } }],
    },
    { ...valid, cases: [{ ...caseValue, customValues: { [custom.id]: 42 } }] },
    { ...valid, cases: [{ ...caseValue, screenIds: ["Figma:123"] }] },
    { ...valid, cases: [{ ...caseValue, priority: "urgent" }] },
    { ...valid, unexpected: true },
  ])
    assert.ok(
      (await validate(plainToInstance(SheetContentDto, content), options))
        .length > 0,
    );
});
test("view and template contracts validate unique IDs and matching columns", async () => {
  const view = columns.map((c) => ({ columnId: c.id, width: 180 }));
  assert.deepEqual(
    await validate(
      plainToInstance(UpdateTemplateDto, {
        expectedRevision: 1,
        columns,
        view,
      }),
      options,
    ),
    [],
  );
  assert.ok(
    (
      await validate(
        plainToInstance(UpdateTemplateDto, {
          expectedRevision: 1,
          columns,
          view: view.slice(1),
        }),
        options,
      )
    ).length,
  );
  assert.ok(
    (
      await validate(
        plainToInstance(SheetViewDto, {
          expectedRevision: 1,
          columns: [view[0], view[0]],
        }),
        options,
      )
    ).length,
  );
  assert.deepEqual(
    await validate(
      plainToInstance(CreateSheetDto, {
        name: "생성 전 초안",
        kind: "unit",
        uploadId: null,
      }),
      options,
    ),
    [],
  );
});
test("upload and IA contracts keep Figma identity separate from business screen IDs", async () => {
  const frame = {
    figmaFileKey: "AbC",
    figmaNodeId: "12:34",
    name: "주문",
    width: 390,
    height: 844,
    imageFileId: randomUUID(),
    dataFileId: randomUUID(),
  };
  assert.deepEqual(
    await validate(
      plainToInstance(CreateUploadDto, { name: "주문", frames: [frame] }),
      options,
    ),
    [],
  );
  assert.ok(
    (
      await validate(
        plainToInstance(CreateUploadDto, {
          name: "주문",
          frames: [frame, frame],
        }),
        options,
      )
    ).length,
  );
  assert.ok(
    (
      await validate(
        plainToInstance(CreateUploadDto, {
          name: "주문",
          frames: [{ ...frame, width: 0 }],
        }),
        options,
      )
    ).length,
  );
  const ia = plainToInstance(CreateIaItemDto, {
    screenId: " ORD-01 ",
    name: "주문",
    parentId: null,
    position: 0,
  });
  assert.deepEqual(await validate(ia, options), []);
  assert.equal(ia.screenId, "ORD-01");
});
test("file inspection rejects spoofed, oversized and invalid UTF-8 JSON", () => {
  assert.equal(
    inspectFile(Buffer.from('{"화면":"주문"}'), "application/json").mediaType,
    "application/json",
  );
  assert.throws(() => inspectFile(Buffer.from("<script/>"), "image/png"));
  assert.throws(() => inspectFile(Buffer.from([0xff]), "application/json"));
  assert.throws(() => inspectFile(Buffer.from("{broken}"), "application/json"));
  assert.throws(() =>
    inspectFile(Buffer.alloc(MAX_JSON_BYTES + 1, 32), "application/json"),
  );
  assert.throws(() => inspectFile(Buffer.alloc(0), "application/json"));
});
test("configuration and cursor failures do not disclose secrets", () => {
  assert.throws(
    () => readEnv({ DATABASE_URL: "secret-value" }),
    (error) =>
      error instanceof Error && !error.message.includes("secret-value"),
  );
  const base = {
    DATABASE_URL: "postgresql://user:password@127.0.0.1/db",
    FILE_STORAGE_ROOT: "/tmp/cheddar-example",
  };
  assert.throws(() => readEnv({ ...base, API_PORT: "0" }));
  assert.throws(() => readEnv({ ...base, CORS_ORIGINS: "*" }));
  assert.throws(() => readEnv({ ...base, FILE_STORAGE_ROOT: "/" }));
  const row = { id: randomUUID(), createdAt: new Date() };
  assert.deepEqual(decodeCursor(encodeCursor(row)), row);
  assert.throws(() => decodeCursor("not-a-cursor"));
  assert.throws(() => decodeCursor(""));
});
