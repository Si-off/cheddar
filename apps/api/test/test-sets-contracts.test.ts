import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { AuthService } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { AccessGuard } from "../src/authorization/guards";
import { ApiError, ApiExceptionFilter } from "../src/common/errors";
import { validationPipe } from "../src/common/validation";
import type { TemplateColumnDto } from "../src/contracts/project.dto";
import {
  ApplyOpsDto,
  CreateTestSetDto,
  TestSetQueryDto,
  TestSetViewDto,
  UpdateTestSetDto,
} from "../src/contracts/test-set.dto";
import type { testSets } from "../src/database/schema";
import { defaultColumns } from "../src/projects/template";
import { CaseOperationsService } from "../src/test-sets/case-operations.service";
import { TestSetsController } from "../src/test-sets/test-sets.controller";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { setAccess } from "../src/test-sets/test-sets.store";
import {
  cellText,
  normalizeValues,
  reconcileValue,
  testIdNumber,
  validateCell,
  validateOps,
  validateView,
} from "../src/test-sets/values";

const failed = (error: unknown) =>
  error instanceof ApiError &&
  error.getStatus() === 400 &&
  error.code === "VALIDATION_FAILED";
test("테스트 세트 DTO는 이름 100자, 메모 5000자, UUID, 필터와 알 수 없는 속성을 검증", async () => {
  for (const [type, body] of [
    [CreateTestSetDto, {}],
    [CreateTestSetDto, { name: " ", projectId: randomUUID() }],
    [CreateTestSetDto, { name: "a".repeat(101), projectId: randomUUID() }],
    [CreateTestSetDto, { name: "이름", projectId: "wrong" }],
    [CreateTestSetDto, { name: "이름", projectId: randomUUID(), memo: null }],
    [
      CreateTestSetDto,
      { name: "이름", projectId: randomUUID(), memo: "a".repeat(5001) },
    ],
    [UpdateTestSetDto, { name: null }],
    [UpdateTestSetDto, { memo: null }],
    [UpdateTestSetDto, { name: " " }],
    [UpdateTestSetDto, { projectId: randomUUID() }],
    [TestSetQueryDto, { filter: "invalid" }],
    [TestSetQueryDto, { search: 123 }],
    [ApplyOpsDto, { ops: [] }],
    [ApplyOpsDto, { ops: Array(501).fill({}) }],
    [
      TestSetViewDto,
      {
        view: "table",
        groupByColumnId: null,
        columnWidths: null,
        rowHeights: {},
      },
    ],
  ] as [new () => object, unknown][]) {
    assert.ok(
      (
        await validate(plainToInstance(type, body), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
      `${type.name}: ${JSON.stringify(body)}`,
    );
  }
  const dto = plainToInstance(CreateTestSetDto, {
    name: "  세트  ",
    projectId: randomUUID(),
  });
  assert.equal((await validate(dto)).length, 0);
  assert.equal(dto.name, "세트");
  assert.equal(dto.memo, "");
  assert.equal(
    (
      await validate(
        plainToInstance(CreateTestSetDto, {
          name: "a".repeat(100),
          projectId: randomUUID(),
          memo: "a".repeat(5000),
        }),
      )
    ).length,
    0,
  );
});

test("셀 값은 형식, 태그 중복, 텍스트 경계를 검증하고 선택 목록 밖 값은 Excel처럼 받음", () => {
  const column = (type: TemplateColumnDto["type"]): TemplateColumnDto => ({
    ...defaultColumns()[2],
    type,
    options: ["가", "나"],
  });
  for (const [type, value] of [
    ["text", null],
    ["text", false],
    ["text", "a".repeat(20001)],
    ["select", 1],
    ["select", ["가"]],
    ["select", "a".repeat(20001)],
    ["checkbox", "true"],
    ["checkbox", null],
    ["tags", ["가", "가"]],
    ["tags", "가"],
    ["tags", null],
  ] as const)
    assert.throws(() => validateCell(column(type), value), failed);
  for (const [type, value] of [
    ["text", "a".repeat(20000)],
    ["select", null],
    ["select", "가"],
    ["select", "다"],
    ["checkbox", false],
    ["tags", []],
    ["tags", ["나", "가"]],
    ["tags", ["다"]],
  ] as const)
    assert.deepEqual(validateCell(column(type), value), value);
  assert.equal(reconcileValue(column("select"), "다"), "다");
  assert.deepEqual(reconcileValue(column("tags"), ["가", "다", "가"]), [
    "가",
    "다",
  ]);
  assert.equal(reconcileValue(column("checkbox"), "가"), undefined);
  for (const [value, text] of [
    ["가", "가"],
    [["가", "나"], "가, 나"],
    [true, "예"],
    [false, ""],
    [null, ""],
  ] as const) {
    assert.equal(cellText(value as string | boolean | string[] | null), text);
    assert.equal(
      reconcileValue(
        column("text"),
        value as string | boolean | string[] | null,
      ),
      text,
    );
  }
  assert.equal(
    testIdNumber("TC-999999999999999999999999"),
    999999999999999999999999n,
  );
  for (const value of ["ID-999", "TC-1x", "TC--1", null, true])
    assert.equal(testIdNumber(value), 0n);
});

test("연산과 보기 설정은 누락, null, 잘못된 종류, 범위와 임의 키를 거부", () => {
  const caseId = randomUUID(),
    columnId = randomUUID();
  for (const input of [
    null,
    [],
    {},
    { ops: [] },
    { ops: [null] },
    { ops: [{ type: "__proto__" }] },
    { ops: [{ type: "unknown" }] },
    { ops: [{ type: "set_cell", caseId, columnId: "wrong", value: "" }] },
    { ops: [{ type: "add_case", caseId }] },
    { ops: [{ type: "move_case", caseId, afterCaseId: undefined }] },
    { ops: [{ type: "add_case", caseId, afterCaseId: null, values: null }] },
    { ops: [{ type: "delete_cases", caseIds: ["wrong"] }] },
    { ops: [{ type: "move_case", caseId, afterCaseId: null, extra: true }] },
    {
      ops: [
        { type: "add_case", caseId, afterCaseId: null, values: { bad: "" } },
      ],
    },
    {
      ops: [
        {
          type: "add_case",
          caseId,
          afterCaseId: null,
          values: { [columnId]: "가", [columnId.toUpperCase()]: "나" },
        },
      ],
    },
  ])
    assert.throws(() => validateOps(input), failed, JSON.stringify(input));
  assert.equal(
    validateOps({
      ops: [
        { type: "add_case", caseId: caseId.toUpperCase(), afterCaseId: null },
      ],
    })[0].type,
    "add_case",
  );
  assert.deepEqual(normalizeValues({ [columnId.toUpperCase()]: "값" }), {
    [columnId]: "값",
  });
  const view = {
    view: "card",
    groupByColumnId: columnId,
    columnWidths: { [columnId]: 40 },
    rowHeights: { [caseId]: 24 },
  };
  assert.deepEqual({ ...validateView(view) }, view);
  for (const patch of [
    { view: "other" },
    { groupByColumnId: undefined },
    { groupByColumnId: "wrong" },
    { columnWidths: { [columnId]: 39 } },
    { columnWidths: { [columnId]: 2001 } },
    { columnWidths: { [columnId]: 40.5 } },
    { columnWidths: { bad: 40 } },
    { rowHeights: { [caseId]: 23 } },
    { rowHeights: { [caseId]: 2001 } },
    { rowHeights: { [caseId]: "40" } },
    { extra: true },
  ])
    assert.throws(() => validateView({ ...view, ...patch }), failed);
});

test("모든 계정이 편집·내보내기하고 만든 사람과 관리자만 삭제한다", () => {
  const owner = randomUUID(),
    actor = randomUUID();
  const row = { ownerId: owner } as typeof testSets.$inferSelect;
  const member = {
    id: actor,
    role: "member",
  } as typeof import("../src/database/schema").accounts.$inferSelect;
  assert.deepEqual(setAccess(row, member), {
    canEdit: true,
    canRename: true,
    canDelete: false,
    canExport: true,
  });
  assert.equal(setAccess(row, { ...member, id: owner }).canDelete, true);
  assert.equal(setAccess(row, { ...member, role: "admin" }).canDelete, true);
});

test("실제 HTTP는 DB 없이 테스트 세트 DTO, UUID, 연산과 보기 설정에 400 반환", async () => {
  let creates = 0;
  const module = await Test.createTestingModule({
    controllers: [TestSetsController],
    providers: [
      {
        provide: TestSetsService,
        useValue: {
          create: () => {
            creates++;
          },
          saveView: (_id: string, _actor: string, input: unknown) =>
            validateView(input),
        },
      },
      {
        provide: CaseOperationsService,
        useValue: {
          apply: (_id: string, _actor: string, input: unknown) =>
            validateOps(input),
        },
      },
      {
        provide: AuthService,
        useValue: { authenticate: async () => randomUUID() },
      },
      { provide: AuthorizationService, useValue: {} },
      { provide: APP_GUARD, useClass: AccessGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(),
      id = randomUUID();
    for (const [path, method, body] of [
      ["", "POST", { name: " " }],
      [`/${id}`, "PATCH", { name: null }],
      [`/${id}`, "PATCH", { projectId: randomUUID() }],
      ["/bad-id", "GET", undefined],
      ["?filter=bad", "GET", undefined],
      [`/${id}/ops`, "POST", { ops: [] }],
      [`/${id}/ops`, "POST", { ops: [{ type: "move_case", caseId: id }] }],
      [
        `/${id}/view`,
        "PUT",
        {
          view: "card",
          groupByColumnId: null,
          columnWidths: { [id]: 39 },
          rowHeights: {},
        },
      ],
    ] as const) {
      const response = await fetch(`${base}/api/v1/test-sets${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      assert.equal(
        response.status,
        400,
        `${path}: ${await response.clone().text()}`,
      );
      const result = (await response.json()) as {
        error: { code: string; message: string; requestId: string };
      };
      assert.ok(
        ["VALIDATION_FAILED", "VALIDATION_ERROR"].includes(result.error.code),
      );
      assert.ok(result.error.message && result.error.requestId);
    }
    assert.equal(creates, 0);
  } finally {
    await app.close();
  }
});
