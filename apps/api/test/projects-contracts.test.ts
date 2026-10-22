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
import {
  CreateFeatureGroupDto,
  CreateProjectDto,
  CreateScreenDto,
  FeatureGroupOrderDto,
  UpdateFeatureGroupDto,
  UpdateMemoDto,
  UpdateProjectDto,
  UpdateScreenDto,
  UpdateTemplateDto,
} from "../src/contracts/project.dto";
import { ProjectsController } from "../src/projects/projects.controller";
import { ProjectsService } from "../src/projects/projects.service";
import { defaultColumns, validateTemplate } from "../src/projects/template";

const failed = (error: unknown) =>
  error instanceof ApiError &&
  error.getStatus() === 400 &&
  error.code === "VALIDATION_FAILED";
test("프로젝트 DTO는 공백, 길이, null, 형식과 알 수 없는 속성을 검증", async () => {
  const invalidInputs: [new () => object, unknown][] = [
    [CreateProjectDto, {}],
    [CreateProjectDto, { name: "  " }],
    [CreateProjectDto, { name: "a".repeat(101) }],
    [CreateProjectDto, { name: "프로젝트", description: "a".repeat(2001) }],
    [UpdateProjectDto, { name: null }],
    [UpdateProjectDto, { description: null }],
    [CreateFeatureGroupDto, { name: "기능", description: null }],
    [CreateFeatureGroupDto, { name: "기능" }],
    [UpdateFeatureGroupDto, { name: " " }],
    [UpdateFeatureGroupDto, { description: "a".repeat(2001) }],
    [CreateScreenDto, { screenId: " ", name: "화면", description: "" }],
    [
      CreateScreenDto,
      { screenId: "A", name: "a".repeat(201), description: "" },
    ],
    [UpdateScreenDto, { parentId: "not-uuid" }],
    [UpdateScreenDto, { screenId: null }],
    [UpdateMemoDto, { body: null }],
    [UpdateMemoDto, { body: "a".repeat(20001) }],
    [FeatureGroupOrderDto, { ids: ["wrong"] }],
    [FeatureGroupOrderDto, { ids: null }],
    [UpdateTemplateDto, { revision: 0, columns: [] }],
    [CreateProjectDto, { name: "이름", canManage: true }],
  ];
  for (const [type, value] of invalidInputs) {
    assert.ok(
      (
        await validate(plainToInstance(type, value), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
      `${type.name}: ${JSON.stringify(value)}`,
    );
  }
  const project = plainToInstance(CreateProjectDto, { name: "  프로젝트  " });
  assert.equal((await validate(project)).length, 0);
  assert.equal(project.name, "프로젝트");
  assert.equal(project.description, "");
  for (const [type, value] of [
    [UpdateScreenDto, { parentId: null }],
    [UpdateMemoDto, { body: "" }],
    [
      CreateScreenDto,
      { screenId: "한글 화면 ID", name: "화면", description: "" },
    ],
    [FeatureGroupOrderDto, { ids: [] }],
  ] as [new () => object, unknown][])
    assert.equal((await validate(plainToInstance(type, value))).length, 0);
});

test("양식 검증은 시스템 항목, UUID, 이름, 형식, 선택 값과 경계를 지킴", () => {
  const valid = () => ({ revision: 1, columns: defaultColumns() });
  assert.equal(validateTemplate(valid()).columns.length, 14);
  const choice = (dto: ReturnType<typeof valid>) => {
    const column = dto.columns.find((c) => c.name === "사용자/관리자");
    assert.ok(column);
    return column;
  };
  const mutations: ((dto: ReturnType<typeof valid>) => void)[] = [
    (dto) => {
      dto.revision = 0;
    },
    (dto) => {
      dto.columns = [];
    },
    (dto) => {
      dto.columns = Array.from({ length: 51 }, () => defaultColumns()[0]);
    },
    (dto) => {
      dto.columns[0].enabled = false;
    },
    (dto) => {
      dto.columns[0].systemKey = null;
    },
    (dto) => {
      dto.columns[2].systemKey = "test_id";
    },
    (dto) => {
      dto.columns[0].name = "변경";
    },
    (dto) => {
      dto.columns[1].type = "checkbox";
    },
    (dto) => {
      dto.columns[2].id = "wrong";
    },
    (dto) => {
      dto.columns[2].id = dto.columns[0].id.toUpperCase();
    },
    (dto) => {
      dto.columns[2].name = " 제목 ";
    },
    (dto) => {
      dto.columns[2].name = " ";
    },
    (dto) => {
      dto.columns[2].name = "a".repeat(101);
    },
    (dto) => {
      dto.columns[2].description = "a".repeat(2001);
    },
    (dto) => {
      choice(dto).options = [];
    },
    (dto) => {
      choice(dto).options = [" "];
    },
    (dto) => {
      choice(dto).options = ["높음", " 높음 "];
    },
    (dto) => {
      choice(dto).type = "tags";
      choice(dto).options = ["a".repeat(101)];
    },
    (dto) => {
      choice(dto).options = Array.from({ length: 51 }, (_, i) => String(i));
    },
  ];
  for (const mutate of mutations) {
    const dto = valid();
    mutate(dto);
    assert.throws(() => validateTemplate(dto), failed);
  }
  for (const dto of [
    null,
    [],
    {},
    { revision: 1, columns: null },
    { ...valid(), unknown: true },
  ])
    assert.throws(() => validateTemplate(dto), failed);
  const reordered = valid();
  reordered.columns.reverse();
  assert.equal(validateTemplate(reordered).columns.length, 14);
  for (const mutate of [
    (dto: ReturnType<typeof valid>) => {
      dto.columns.pop();
    },
    (dto: ReturnType<typeof valid>) => {
      dto.columns.push({ ...dto.columns[2], id: randomUUID() });
    },
    (dto: ReturnType<typeof valid>) => {
      dto.columns[2].presetKey = "unknown";
    },
    (dto: ReturnType<typeof valid>) => {
      dto.columns[2].description = "변경";
    },
    (dto: ReturnType<typeof valid>) => {
      dto.columns[3].enabled = false;
    },
  ]) {
    const dto = valid();
    mutate(dto);
    assert.throws(() => validateTemplate(dto), failed);
  }
  const max = valid();
  while (max.columns.length < 50)
    max.columns.push({
      id: randomUUID(),
      systemKey: null,
      presetKey: null,
      enabled: true,
      name: `항목 ${max.columns.length}`,
      type: "text",
      options: [],
      description: "",
    });
  assert.equal(validateTemplate(max).columns.length, 50);
  assert.throws(
    () =>
      validateTemplate({ revision: 1, columns: defaultColumns().slice(0, 2) }),
    failed,
  );
});

test("사용자 열은 이름 유일성과 선택 값 경계를 지키며 값을 정규화", () => {
  const custom = {
    id: randomUUID(),
    systemKey: null,
    presetKey: null,
    enabled: true,
    name: "사용자 열",
    type: "tags",
    description: "  설명  ",
    options: ["  값  "],
  };
  const input = (column: object) => ({
    revision: 1,
    columns: [...defaultColumns(), column],
  });
  const saved = validateTemplate(input(custom)).columns.at(-1);
  assert.equal(saved?.description, "설명");
  assert.deepEqual(saved?.options, ["값"]);
  for (const change of [
    { name: "제목" },
    { type: "unknown" },
    { options: [] },
    { options: ["값", " 값 "] },
    { options: [""] },
    { options: ["a".repeat(101)] },
    { options: Array.from({ length: 51 }, (_, i) => String(i)) },
  ])
    assert.throws(
      () => validateTemplate(input({ ...custom, ...change })),
      failed,
    );
  assert.equal(
    validateTemplate(
      input({
        ...custom,
        options: Array.from({ length: 50 }, (_, i) => String(i)),
      }),
    ).columns.at(-1)?.options.length,
    50,
  );
  assert.deepEqual(
    validateTemplate(input({ ...custom, type: "text" })).columns.at(-1)
      ?.options,
    [],
  );
});

test("실제 HTTP는 DB 없이 DTO 400과 양식 VALIDATION_FAILED, 권한 가드와 UUID를 검증", async () => {
  const projectId = randomUUID();
  let calls = 0;
  const service = {
    saveTemplate: (_id: string, dto: unknown) => validateTemplate(dto),
    create: () => {
      calls++;
    },
  };
  const module = await Test.createTestingModule({
    controllers: [ProjectsController],
    providers: [
      { provide: ProjectsService, useValue: service },
      {
        provide: AuthService,
        useValue: { authenticate: async () => randomUUID() },
      },
      {
        provide: AuthorizationService,
        useValue: {},
      },
      { provide: APP_GUARD, useClass: AccessGuard },
    ],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  try {
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    for (const [path, method, body] of [
      ["/projects", "POST", { name: " " }],
      [`/projects/${projectId}`, "PATCH", { description: null }],
      [`/projects/${projectId}/feature-groups`, "POST", { name: " " }],
      [
        `/projects/${projectId}/feature-groups/order`,
        "PUT",
        { ids: ["wrong"] },
      ],
      [
        `/projects/${projectId}/screens`,
        "POST",
        { screenId: " ", name: "화면", description: "" },
      ],
      [`/projects/${projectId}/memo`, "PUT", { body: "x".repeat(20001) }],
      [`/projects/wrong/memo`, "PUT", { body: "" }],
      [`/projects/${projectId}/template`, "PUT", { revision: 1, columns: [] }],
      [
        `/projects/${projectId}/template`,
        "PUT",
        { revision: null, columns: defaultColumns() },
      ],
      [
        `/projects/${projectId}/template`,
        "PUT",
        { revision: 1, columns: [null, null] },
      ],
    ] as const) {
      const response = await fetch(`${base}/api/v1${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, path);
      const { error } = (await response.json()) as {
        error: { code: string; message: string; requestId: string };
      };
      assert.equal(
        error.code,
        path.endsWith("/template") ? "VALIDATION_FAILED" : "VALIDATION_ERROR",
      );
      assert.ok(error.message && error.requestId);
    }
    assert.equal(calls, 0);
  } finally {
    await app.close();
  }
});
