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
import type { EffectivePermissionDto } from "../src/contracts/identity.dto";
import type { TemplateColumnDto } from "../src/contracts/project.dto";
import {
  ApplyOpsDto,
  CreateTestSetDto,
  TestSetQueryDto,
  TestSetViewDto,
  UpdateTestSetDto,
} from "../src/contracts/test-set.dto";
import type { testSets } from "../src/database/schema";
import { defaultColumns, validateTemplate } from "../src/projects/template";
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

test("셀 값은 형식, 선택 항목, 태그 중복, 텍스트 경계를 검증하고 변환", () => {
  const column = (type: TemplateColumnDto["type"]): TemplateColumnDto => ({
    ...defaultColumns()[2],
    type,
    options: ["가", "나"],
  });
  for (const [type, value] of [
    ["text", null],
    ["text", false],
    ["text", "a".repeat(20001)],
    ["select", "다"],
    ["select", 1],
    ["checkbox", "true"],
    ["checkbox", null],
    ["tags", ["가", "가"]],
    ["tags", ["다"]],
    ["tags", "가"],
    ["tags", null],
  ] as const)
    assert.throws(() => validateCell(column(type), value), failed);
  for (const [type, value] of [
    ["text", "a".repeat(20000)],
    ["select", null],
    ["select", "가"],
    ["checkbox", false],
    ["tags", []],
    ["tags", ["나", "가"]],
  ] as const)
    assert.deepEqual(validateCell(column(type), value), value);
  assert.equal(reconcileValue(column("select"), "다"), undefined);
  assert.deepEqual(reconcileValue(column("tags"), ["가", "다"]), ["가"]);
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

test("세트 접근은 소유, 멤버, 프로젝트 범위 view_all과 export를 구분", () => {
  const owner = randomUUID(),
    actor = randomUUID(),
    project = randomUUID();
  const row = {
    ownerId: owner,
    projectId: project,
  } as typeof testSets.$inferSelect;
  const grants: EffectivePermissionDto[] = [
    {
      permission: "test_set.view_all",
      scope: "projects",
      projectIds: [project],
    },
  ];
  assert.equal(setAccess(row, actor, undefined, []).canView, false);
  assert.equal(setAccess(row, owner, undefined, []).canEdit, true);
  assert.equal(setAccess(row, owner, undefined, []).canExport, false);
  assert.deepEqual(setAccess(row, actor, "view", []), {
    canView: true,
    canEdit: false,
    canRename: false,
    canDelete: false,
    canExport: false,
  });
  assert.equal(setAccess(row, actor, "edit", []).canEdit, true);
  assert.equal(setAccess(row, actor, "edit", []).canDelete, false);
  assert.equal(setAccess(row, actor, undefined, grants).canView, true);
  assert.equal(setAccess(row, actor, undefined, grants).canEdit, false);
  grants[0].projectIds = [randomUUID()];
  assert.equal(setAccess(row, actor, undefined, grants).canView, false);
  grants.push({
    permission: "test_set.export",
    scope: "global",
    projectIds: [],
  });
  assert.equal(setAccess(row, actor, undefined, grants).canExport, false);
  assert.equal(setAccess(row, actor, "view", grants).canExport, true);
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
          saveColumns: (
            _id: string,
            _actor: string,
            input: { columns: unknown },
          ) => validateTemplate({ revision: 1, columns: input.columns }),
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
      [`/${id}/columns`, "PUT", { columns: [null, null] }],
      [`/${id}/columns`, "PUT", { columns: defaultColumns().reverse() }],
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
