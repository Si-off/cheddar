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
import { createApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import {
  ChangePasswordDto,
  CreateAccountDto,
  PasswordDto,
  UpdateAccountDto,
} from "../src/contracts/identity.dto";
import { defaultColumns } from "../src/projects/template";

test("명세는 DB 없이 생성되며 인증·계정·프로젝트·테스트 세트 계약을 노출", async () => {
  const app = await createApp(
    {
      databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
      storageRoot: resolve(tmpdir(), "cheddar-contract-unused"),
      port: 3101,
      host: "127.0.0.1",
      cookieSameSite: "lax",
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
    assert.ok(
      Object.keys(document.paths).every((p) =>
        /^\/(health|api\/v1\/(auth|accounts|projects|test-sets|shared|temp-uploads|generations|review-items|plugin-connections|figma-token))/.test(
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
    for (const name of ["TestSetColumnDto", "TemplateResponseColumnDto"]) {
      const schema = components[name];
      assert.ok(schema && !("$ref" in schema));
      assert.ok(schema.required?.includes("colors"));
    }
    const recent =
      document.paths["/api/v1/projects/{projectId}/recent-test-set-template"]
        .get;
    assert.equal(recent?.operationId, "getRecentTestSetTemplate");
    const recentResponse = recent?.responses["200"];
    assert.ok(recentResponse && !("$ref" in recentResponse));
    assert.deepEqual(recentResponse.content?.["application/json"].schema, {
      $ref: "#/components/schemas/RecentTemplateDto",
    });
    const recentSchema = components.RecentTemplateDto;
    assert.ok(recentSchema && !("$ref" in recentSchema));
    assert.deepEqual(recentSchema.required, ["testSet", "columns"]);
    const recentSetSchema = recentSchema.properties?.testSet;
    assert.ok(recentSetSchema && !("$ref" in recentSetSchema));
    assert.equal(recentSetSchema.nullable, true);
    for (const path of Object.keys(document.paths))
      assert.doesNotMatch(
        path,
        /roles|affiliations|invitations|password-resets|owned-test-sets|members|candidates/,
      );
    assert.ok(document.paths["/api/v1/auth/password"].post?.responses["204"]);
    assert.ok(
      document.paths["/api/v1/accounts/{accountId}/password"].put?.responses[
        "204"
      ],
    );
    const account = ajv.getSchema("#/components/schemas/CreateAccountDto");
    assert.ok(account);
    const validAccount = {
      name: "구성원",
      loginId: "qa.member",
      role: "member",
      password: "valid-password-12345",
    };
    assert.equal(account(validAccount), true);
    for (const patch of [
      { role: "administrator" },
      { password: "short" },
      { affiliationId: defaultColumns()[0].id },
    ])
      assert.equal(account({ ...validAccount, ...patch }), false);
    const ops = ajv.getSchema("#/components/schemas/ApplyOpsDto");
    assert.ok(ops);
    const caseId = defaultColumns()[0].id,
      columnId = defaultColumns()[1].id;
    for (const value of ["텍스트", null, false, ["태그"], { image: columnId }])
      assert.equal(
        ops({ ops: [{ type: "set_cell", caseId, columnId, value }] }),
        true,
      );
    assert.equal(
      ops({ ops: [{ type: "add_case", caseId, afterCaseId: null }] }),
      true,
    );
    assert.equal(ops({ ops: [{ type: "add_case", caseId }] }), false);
    for (const featureGroupId of [null, columnId]) {
      assert.equal(
        ops({ ops: [{ type: "set_feature_group", caseId, featureGroupId }] }),
        true,
      );
      assert.equal(
        ops({
          ops: [
            { type: "add_case", caseId, afterCaseId: null, featureGroupId },
          ],
        }),
        true,
      );
    }
    assert.equal(ops({ ops: [{ type: "set_feature_group", caseId }] }), false);
    assert.equal(
      ops({
        ops: [{ type: "set_feature_group", caseId, featureGroupId: "wrong" }],
      }),
      false,
    );
    const caseDto = ajv.getSchema("#/components/schemas/CaseDto");
    assert.ok(caseDto);
    assert.equal(
      caseDto({ id: caseId, featureGroupId: null, values: {} }),
      true,
    );
    assert.equal(
      caseDto({ id: caseId, featureGroupId: columnId, values: {} }),
      true,
    );
    assert.equal(caseDto({ id: caseId, values: {} }), false);
    assert.equal(
      caseDto({ id: caseId, featureGroupId: "wrong", values: {} }),
      false,
    );
    for (const name of ["TestSetDto", "SharedTestSetDto"]) {
      const schema = components[name];
      assert.ok(schema && !("$ref" in schema));
      assert.ok(schema.required?.includes("featureGroups"));
    }
    assert.equal(
      ops({ ops: [{ type: "set_cell", caseId, columnId, value: 123 }] }),
      false,
    );
    assert.equal(ops({ ops: [] }), false);
    assert.equal(
      document.paths["/api/v1/test-sets/{testSetId}/columns"],
      undefined,
    );
    for (const op of [
      {
        type: "add_column",
        columnId,
        column: {
          name: "사용자 열",
          type: "text",
          description: "",
          options: [],
          presetKey: null,
        },
        afterColumnId: caseId,
      },
      { type: "remove_column", columnId },
      { type: "reorder_columns", columnIds: [caseId, columnId] },
    ])
      assert.equal(ops({ ops: [op] }), true, JSON.stringify(ops.errors));
    const createSet = ajv.getSchema("#/components/schemas/CreateTestSetDto");
    assert.ok(createSet);
    for (const template of [
      { kind: "project" },
      { kind: "recent" },
      { kind: "custom", columns: defaultColumns() },
    ])
      assert.equal(
        createSet({ name: "세트", projectId: caseId, template }),
        true,
        JSON.stringify(createSet.errors),
      );
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
    assert.deepEqual(
      Object.keys(me.properties ?? {}).sort(),
      ["id", "name", "loginId", "role", "status"].sort(),
    );
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
      body: JSON.stringify({ loginId: "", password: "password" }),
    });
    assert.equal(
      invalidLogin.status,
      400,
      "로그인 DTO 검증은 DB 접근 전에 실행해야 합니다.",
    );
    for (const path of [
      "/auth/invitations",
      "/auth/password-resets",
      "/roles",
      "/affiliations",
    ])
      assert.equal((await fetch(`${base}/api/v1${path}`)).status, 404);
  } finally {
    await app.close();
  }
});
test("DTO는 잘못된 등급·삭제한 필드·null 덮어쓰기·비밀번호 길이를 거부", async () => {
  for (const [type, value] of [
    [UpdateAccountDto, { name: null }],
    [UpdateAccountDto, { role: null }],
    [UpdateAccountDto, { loginId: "changed" }],
    [UpdateAccountDto, { assignments: [] }],
    [UpdateAccountDto, { expiresAt: null }],
    [UpdateAccountDto, { role: "administrator" }],
    [
      CreateAccountDto,
      {
        name: "계정",
        loginId: "bad id",
        role: "member",
        password: "password-12345",
      },
    ],
    [PasswordDto, { password: "short" }],
    [PasswordDto, { password: "x".repeat(129) }],
    [ChangePasswordDto, { currentPassword: "", newPassword: "password-12345" }],
    [ChangePasswordDto, { currentPassword: "legacy", newPassword: "short" }],
  ] as const) {
    assert.ok(
      (
        await validate(plainToInstance(type as new () => object, value), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length > 0,
      JSON.stringify(value),
    );
  }
});
