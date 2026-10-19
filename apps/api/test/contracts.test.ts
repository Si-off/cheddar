import "reflect-metadata";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PERMISSIONS } from "../src/authorization/permissions";
import { createApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import {
  CreateAccountDto,
  CreateRoleDto,
  SetPasswordDto,
  UpdateAccountDto,
  UpdateRoleDto,
} from "../src/contracts/identity.dto";
import { defaultColumns } from "../src/projects/template";

test("명세는 DB 없이 생성되며 인증·계정·역할·소속·프로젝트·테스트 세트 계약을 노출", async () => {
  const app = await createApp(
    {
      databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
      storageRoot: resolve(tmpdir(), "cheddar-contract-unused"),
      port: 3101,
      corsOrigins: [],
      workersEnabled: false,
    },
    resolve(process.cwd(), "migrations"),
  );
  try {
    const document = createDocument(app);
    const exported = JSON.parse(
      await readFile(
        resolve(process.env.API_SOURCE_ROOT ?? process.cwd(), "openapi.json"),
        "utf8",
      ),
    );
    assert.deepEqual(document, exported);
    assert.equal(
      Object.values(document.paths).reduce(
        (n, p) =>
          n +
          Object.keys(p).filter((k) =>
            ["get", "post", "put", "patch", "delete"].includes(k),
          ).length,
        0,
      ),
      69,
    );
    assert.ok(
      Object.keys(document.paths).every((p) =>
        /^\/(health|api\/v1\/(auth|accounts|roles|affiliations|projects|test-sets|temp-uploads|generations|review-items))/.test(
          p,
        ),
      ),
    );
    const cookieScheme = document.components?.securitySchemes?.cookie;
    assert.ok(cookieScheme && !("$ref" in cookieScheme));
    assert.equal(cookieScheme.type, "apiKey");
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    const components = document.components?.schemas ?? {};
    for (const [name, schema] of Object.entries(components))
      ajv.addSchema(schema, `#/components/schemas/${name}`);
    for (const name of Object.keys(components))
      assert.ok(ajv.getSchema(`#/components/schemas/${name}`), name);
    const ops = ajv.getSchema("#/components/schemas/ApplyOpsDto");
    assert.ok(ops);
    const caseId = defaultColumns()[0].id,
      columnId = defaultColumns()[1].id;
    for (const value of ["텍스트", null, false, ["태그"]])
      assert.equal(
        ops({ ops: [{ type: "set_cell", caseId, columnId, value }] }),
        true,
      );
    assert.equal(
      ops({ ops: [{ type: "add_case", caseId, afterCaseId: null }] }),
      true,
    );
    assert.equal(ops({ ops: [{ type: "add_case", caseId }] }), false);
    assert.equal(
      ops({ ops: [{ type: "set_cell", caseId, columnId, value: 123 }] }),
      false,
    );
    assert.equal(ops({ ops: [] }), false);
    const binary =
      document.paths["/api/v1/test-sets/{testSetId}/export"].get?.responses[
        "200"
      ];
    assert.ok(binary && !("$ref" in binary));
    assert.deepEqual(
      binary.content?.[
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ].schema,
      { type: "string", format: "binary" },
    );
    const template = ajv.getSchema("#/components/schemas/TemplateDto");
    assert.ok(template);
    assert.equal(template({ revision: 1, columns: defaultColumns() }), true);
    const memo = ajv.getSchema("#/components/schemas/MemoDto");
    assert.ok(memo);
    assert.equal(memo({ body: "", updatedAt: null, updatedBy: null }), true);
    assert.equal(
      memo({
        body: "기록",
        updatedAt: new Date().toISOString(),
        updatedBy: { id: defaultColumns()[0].id, name: "계정" },
      }),
      true,
    );
    const me = components.MeDto;
    assert.ok(me && !("$ref" in me));
    assert.ok(me.properties?.permissions);
    assert.ok(!me.properties?.passwordHash);
    const queryParameters =
      document.paths["/api/v1/accounts"].get?.parameters ?? [];
    assert.ok(
      queryParameters.some(
        (parameter) =>
          !("$ref" in parameter) &&
          parameter.in === "query" &&
          parameter.name === "status",
      ),
    );
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const invalidLogin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "잘못된 이메일", password: "password" }),
    });
    assert.equal(
      invalidLogin.status,
      400,
      "로그인 DTO 검증은 DB 접근 전에 실행해야 합니다.",
    );
    assert.equal(
      (await fetch(`${base}/api/v1/auth/invitations?token=short`)).status,
      400,
    );
    const invalidReset = await fetch(`${base}/api/v1/auth/password-resets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "x".repeat(43), password: "short" }),
    });
    assert.equal(invalidReset.status, 400);
    const role = ajv.getSchema("#/components/schemas/CreateRoleDto");
    assert.ok(role);
    assert.equal(
      role({
        name: "역할",
        permissions: PERMISSIONS,
        requiresExpiry: false,
        defaultExpiryDays: null,
      }),
      true,
    );
    assert.equal(
      role({
        name: "역할",
        permissions: ["unknown"],
        requiresExpiry: false,
        defaultExpiryDays: null,
      }),
      false,
    );
    assert.equal(
      role({
        name: "역할",
        permissions: [],
        requiresExpiry: false,
        defaultExpiryDays: null,
        fixed: true,
      }),
      false,
    );
  } finally {
    await app.close();
  }
});
test("DTO는 알 수 없는 권한·null 덮어쓰기·짧은 비밀번호를 거부", async () => {
  for (const [type, value] of [
    [UpdateAccountDto, { name: null }],
    [UpdateAccountDto, { assignments: null }],
    [UpdateRoleDto, { permissions: ["unknown"] }],
    [UpdateRoleDto, { requiresExpiry: null }],
    [CreateRoleDto, { name: "역할", permissions: [], requiresExpiry: true }],
    [
      CreateAccountDto,
      { name: "계정", email: "wrong", affiliationId: "wrong", assignments: [] },
    ],
    [SetPasswordDto, { token: "x".repeat(43), password: "short" }],
  ] as const) {
    const errors = await validate(
      plainToInstance(type as new () => object, value),
      { whitelist: true, forbidNonWhitelisted: true },
    );
    assert.ok(errors.length > 0, JSON.stringify(value));
  }
  assert.equal(
    (await validate(plainToInstance(UpdateAccountDto, { expiresAt: null })))
      .length,
    0,
  );
});
