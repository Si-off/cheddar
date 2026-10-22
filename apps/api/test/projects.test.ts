import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import type { Permission } from "../src/authorization/permissions";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import type { CreateAccountDto, RoleDto } from "../src/contracts/identity.dto";
import type {
  FeatureGroupDto,
  FeatureGroupListDto,
  MemoDto,
  ProjectDto,
  ProjectListDto,
  ScreenDto,
  ScreenIdRuleDto,
  ScreenIdRuleListDto,
  ScreenListDto,
  TemplateDto,
} from "../src/contracts/project.dto";
import { DatabaseService } from "../src/database/database.service";
import {
  projectMemos,
  projects,
  projectTemplates,
} from "../src/database/schema";
import { ProjectsService } from "../src/projects/projects.service";
import { RolesService } from "../src/roles/roles.service";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";

const code = (expected: string) => (error: unknown) =>
  error instanceof ApiError && error.code === expected;
const password = "프로젝트-테스트-비밀번호-12345";
test("실제 PostgreSQL에서 프로젝트 설정·권한·충돌·화면 구조 계약", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(lease.config, lease.folder);
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const service = app.get(ProjectsService),
      accounts = app.get(AccountsService),
      auth = app.get(AuthService),
      authorization = app.get(AuthorizationService),
      roles = app.get(RolesService);
    const db = lease.database.db;
    const admin = await createFirstAdministrator(
      authorization,
      accounts,
      "projects-admin@example.com",
      "프로젝트 관리자",
    );
    lease.accountIds.push(admin.account.id);
    await auth.setPassword(admin.token, password, "invite");
    const adminCookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = adminCookie,
    ) =>
      fetch(`${base}/api/v1/projects${path}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const asJson = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()) as T;
    };
    const error = async (
      response: Response,
      status: number,
      expected: string,
    ) => {
      const result = await asJson<{ error: { code: string } }>(
        response,
        status,
      );
      assert.equal(result.error.code, expected);
    };
    const makeRole = async (permissions: Permission[]): Promise<RoleDto> => {
      const role = await roles.create({
        name: randomUUID(),
        permissions,
        requiresExpiry: false,
        defaultExpiryDays: null,
      });
      lease.roleIds.push(role.id);
      return role;
    };
    const actor = async (assignments: CreateAccountDto["assignments"]) => {
      const account = await accounts.create({
        name: "설정 사용자",
        loginId: `${randomUUID()}@example.com`,
        affiliationId: admin.account.affiliation.id,
        assignments,
      });
      lease.accountIds.push(account.account.id);
      await auth.setPassword(account.token, password, "invite");
      return {
        id: account.account.id,
        cookie: `${SESSION_COOKIE}=${(await auth.login(account.account.loginId, password)).token}`,
      };
    };
    let first!: ProjectDto, second!: ProjectDto;
    await t.test(
      "만들기는 사전 정의 열 14개와 기본 enabled·빈 메모를 함께 저장",
      async () => {
        first = await asJson<ProjectDto>(
          await request("", "POST", { name: "  가 프로젝트  " }),
          201,
        );
        second = await asJson<ProjectDto>(
          await request("", "POST", {
            name: "나 프로젝트",
            description: "  설명  ",
          }),
          201,
        );
        assert.equal(first.name, "가 프로젝트");
        assert.equal(first.description, "");
        assert.equal(first.canManage, true);
        assert.equal(second.description, "설명");
        const template = await asJson<TemplateDto>(
          await request(`/${first.id}/template`),
        );
        assert.equal(template.revision, 1);
        assert.deepEqual(
          template.columns.map((c) => c.name),
          [
            "테스트 ID",
            "테스트 환경",
            "테스트 케이스",
            "제목",
            "사용자/관리자",
            "화면 ID 또는 URL",
            "수행 절차",
            "예상 결과",
            "QA 결과",
            "QA 담당자",
            "결과 및 의견",
            "개발 진행 상태",
            "개발 담당자",
            "추가 정보",
          ],
        );
        assert.deepEqual(
          template.columns.filter((c) => c.systemKey).map((c) => c.systemKey),
          ["test_id", "title"],
        );
        assert.deepEqual(
          template.columns
            .filter((c) => c.type === "select")
            .map((c) => ({
              name: c.name,
              options: c.options,
            })),
          [
            { name: "사용자/관리자", options: ["사용자", "관리자"] },
            {
              name: "QA 결과",
              options: ["Pass", "Fail", "Deferred", "N/A", "-", "추가 요청"],
            },
            {
              name: "개발 진행 상태",
              options: ["완료", "수정중", "수정 완료", "보류", "기타", "-"],
            },
          ],
        );
        assert.ok(template.columns.every((c) => c.description.length > 0));
        assert.equal(new Set(template.columns.map((c) => c.id)).size, 14);
        assert.equal(
          new Set(template.columns.map((c) => c.presetKey)).size,
          14,
        );
        assert.ok(
          template.columns.every(
            (c) => c.enabled === (c.presetKey !== "extra"),
          ),
        );
        assert.deepEqual(
          await asJson(await request(`/${first.id}/feature-groups`)),
          { items: [] },
        );
        assert.deepEqual(await asJson(await request(`/${first.id}/screens`)), {
          items: [],
        });
        const memo = await asJson<MemoDto>(await request(`/${first.id}/memo`));
        assert.equal(memo.body, "");
        assert.equal(memo.updatedBy?.id, admin.account.id);
        assert.ok(memo.updatedAt);
        const list = await asJson<ProjectListDto>(await request(""));
        assert.deepEqual(
          list.items.map((p) => p.id),
          [first.id, second.id],
        );
        assert.ok(
          list.items.every((p) => p.columnCount === 14 && p.screenCount === 0),
        );
      },
    );
    await t.test("하위 설정 저장 실패 시 프로젝트 생성도 롤백", async () => {
      const name = randomUUID();
      const before = await db.select({ id: projects.id }).from(projects);
      // 기본 데이터까지 삽입한 뒤 응답 권한 계산이 실패해도 전체 트랜잭션을 되돌린다.
      const brokenAuthorization = {
        effective: async () => {
          throw new Error("응답 권한 계산 실패");
        },
      } as unknown as AuthorizationService;
      const broken = new ProjectsService(
        app.get(DatabaseService),
        brokenAuthorization,
      );
      await assert.rejects(
        broken.create(admin.account.id, { name, description: "" }),
      );
      assert.equal(
        (await db.select().from(projects).where(eq(projects.name, name)))
          .length,
        0,
      );
      assert.deepEqual(
        await db.select({ id: projects.id }).from(projects),
        before,
      );
    });
    const exporter = await makeRole(["test_set.export"]),
      managerRole = await makeRole(["project.manage"]);
    const scoped = await actor([
      { roleId: exporter.id, scope: "projects", projectIds: [first.id] },
    ]);
    const manager = await actor([
      { roleId: managerRole.id, scope: "projects", projectIds: [first.id] },
    ]);
    const noGrants = await actor([]);
    const emptyRole = await makeRole([]);
    const empty = await actor([
      { roleId: emptyRole.id, scope: "projects", projectIds: [first.id] },
    ]);
    await t.test(
      "권한별 보기, 숨김 404와 project.manage 쓰기 범위",
      async () => {
        for (const suffix of [
          "",
          "/template",
          "/feature-groups",
          "/screens",
          "/screen-id-rules",
          "/memo",
        ]) {
          assert.equal(
            (
              await request(
                `/${first.id}${suffix}`,
                "GET",
                undefined,
                scoped.cookie,
              )
            ).status,
            200,
          );
          for (const cookie of [
            scoped.cookie,
            manager.cookie,
            noGrants.cookie,
            empty.cookie,
          ])
            await error(
              await request(`/${second.id}${suffix}`, "GET", undefined, cookie),
              404,
              "NOT_FOUND",
            );
          for (const cookie of [noGrants.cookie, empty.cookie])
            await error(
              await request(`/${first.id}${suffix}`, "GET", undefined, cookie),
              404,
              "NOT_FOUND",
            );
        }
        const scopedList = await asJson<ProjectListDto>(
          await request("", "GET", undefined, scoped.cookie),
        );
        assert.deepEqual(
          scopedList.items.map((p) => p.id),
          [first.id],
        );
        assert.equal(scopedList.items[0].canManage, false);
        assert.deepEqual(
          await asJson(await request("", "GET", undefined, noGrants.cookie)),
          { items: [] },
        );
        assert.equal(
          (
            await asJson<ProjectDto>(
              await request(`/${first.id}`, "GET", undefined, manager.cookie),
            )
          ).canManage,
          true,
        );
        for (const permission of [
          "account.manage",
          "role.manage",
          "test_set.export",
        ] as const) {
          const role = await makeRole([permission]);
          const global = await actor([
            { roleId: role.id, scope: "global", projectIds: [] },
          ]);
          const list = await asJson<ProjectListDto>(
            await request("", "GET", undefined, global.cookie),
          );
          assert.equal(list.items.length, 2);
          assert.ok(list.items.every((p) => !p.canManage));
        }
        await error(await request(`/${randomUUID()}`), 404, "NOT_FOUND");
        await error(
          await request("", "POST", { name: "거부" }, manager.cookie),
          403,
          "FORBIDDEN",
        );
        await error(
          await request(
            `/${second.id}`,
            "PATCH",
            { name: "거부" },
            manager.cookie,
          ),
          403,
          "FORBIDDEN",
        );
        const updated = await asJson<ProjectDto>(
          await request(
            `/${first.id}`,
            "PATCH",
            { description: "  새 설명  " },
            manager.cookie,
          ),
        );
        assert.equal(updated.description, "새 설명");
        const suffixes = [
          ["", "PATCH", { name: "거부" }],
          ["/template", "PUT", {}],
          ["/feature-groups", "POST", {}],
          [`/feature-groups/${randomUUID()}`, "PATCH", {}],
          [`/feature-groups/${randomUUID()}`, "DELETE", undefined],
          ["/feature-groups/order", "PUT", { ids: [] }],
          ["/screen-id-rules", "POST", {}],
          [`/screen-id-rules/${randomUUID()}`, "PATCH", {}],
          [`/screen-id-rules/${randomUUID()}`, "DELETE", undefined],
          ["/screen-id-rules/order", "PUT", { ids: [] }],
          ["/screens/import", "POST", {}],
          ["/screens", "POST", {}],
          [`/screens/${randomUUID()}`, "PATCH", {}],
          [`/screens/${randomUUID()}`, "DELETE", undefined],
          ["/memo", "PUT", { body: "거부" }],
        ] as const;
        for (const [suffix, method, body] of suffixes)
          await error(
            await request(`/${first.id}${suffix}`, method, body, scoped.cookie),
            403,
            "FORBIDDEN",
          );
      },
    );
    await t.test(
      "project.create 전체 권한은 만들기와 보기만 허용하고 관리 권한을 자동 부여하지 않음",
      async () => {
        const role = await makeRole(["project.create"]);
        const creator = await actor([
          { roleId: role.id, scope: "global", projectIds: [] },
        ]);
        const project = await asJson<ProjectDto>(
          await request("", "POST", { name: "만들기만" }, creator.cookie),
          201,
        );
        assert.equal(project.canManage, false);
        assert.equal(
          (await request(`/${project.id}`, "GET", undefined, creator.cookie))
            .status,
          200,
        );
        await error(
          await request(
            `/${project.id}/memo`,
            "PUT",
            { body: "거부" },
            creator.cookie,
          ),
          403,
          "FORBIDDEN",
        );
      },
    );
    await t.test("양식 revision 충돌과 동시 저장은 하나만 성공", async () => {
      const template = await asJson<TemplateDto>(
        await request(`/${first.id}/template`),
      );
      for (const mutate of [
        (columns: TemplateDto["columns"]) => {
          columns[2].name = "사전 준비";
        },
        (columns: TemplateDto["columns"]) => {
          columns[0].enabled = false;
        },
      ]) {
        const invalid = structuredClone(template);
        mutate(invalid.columns);
        await error(
          await request(`/${first.id}/template`, "PUT", invalid),
          400,
          "VALIDATION_FAILED",
        );
      }
      template.columns.push({
        id: randomUUID(),
        presetKey: null,
        enabled: true,
        systemKey: null,
        name: "사전 준비",
        type: "text",
        description: "",
        options: ["지움"],
      });
      const saved = await asJson<TemplateDto>(
        await request(`/${first.id}/template`, "PUT", template, manager.cookie),
      );
      assert.equal(saved.revision, template.revision + 1);
      assert.deepEqual(saved.columns[2].options, []);
      await error(
        await request(`/${first.id}/template`, "PUT", template),
        409,
        "TEMPLATE_CONFLICT",
      );
      const attempts = await Promise.all([
        request(`/${first.id}/template`, "PUT", saved),
        request(`/${first.id}/template`, "PUT", saved),
      ]);
      assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
      await error(
        attempts.find((r) => r.status === 409) as Response,
        409,
        "TEMPLATE_CONFLICT",
      );
      await error(
        await request(`/${first.id}/template`, "PUT", {
          revision: 1,
          columns: [],
        }),
        400,
        "VALIDATION_FAILED",
      );
    });
    await t.test(
      "기능 그룹 중복, 추가 순서, 전체 집합 정렬과 다른 프로젝트 항목 404",
      async () => {
        const create = (name: string, projectId = first.id) =>
          request(`/${projectId}/feature-groups`, "POST", {
            name,
            description: "  설명  ",
          });
        const a = await asJson<FeatureGroupDto>(
            await create("  그룹 A  "),
            201,
          ),
          b = await asJson<FeatureGroupDto>(await create("그룹 B"), 201);
        assert.equal(a.name, "그룹 A");
        assert.equal(a.description, "설명");
        await error(await create("그룹 A"), 409, "DUPLICATE_NAME");
        await error(
          await request(`/${first.id}/feature-groups/${b.id}`, "PATCH", {
            name: "그룹 A",
          }),
          409,
          "DUPLICATE_NAME",
        );
        const foreign = await asJson<FeatureGroupDto>(
          await create("그룹 A", second.id),
          201,
        );
        for (const ids of [[a.id], [a.id, a.id], [a.id, foreign.id]])
          await error(
            await request(`/${first.id}/feature-groups/order`, "PUT", { ids }),
            409,
            "STALE_ORDER",
          );
        const reordered = await asJson<FeatureGroupListDto>(
          await request(`/${first.id}/feature-groups/order`, "PUT", {
            ids: [b.id, a.id],
          }),
        );
        assert.deepEqual(
          reordered.items.map((g) => g.id),
          [b.id, a.id],
        );
        const c = await asJson<FeatureGroupDto>(await create("그룹 C"), 201);
        assert.deepEqual(
          (await service.listGroups(first.id, admin.account.id)).items.map(
            (g) => g.id,
          ),
          [b.id, a.id, c.id],
        );
        await error(
          await request(`/${first.id}/feature-groups/${foreign.id}`, "PATCH", {
            name: "변경",
          }),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(`/${first.id}/feature-groups/${foreign.id}`, "DELETE"),
          404,
          "NOT_FOUND",
        );
        assert.equal(
          (await request(`/${first.id}/feature-groups/${a.id}`, "DELETE"))
            .status,
          204,
        );
        const simultaneous = await Promise.all([
          create("동시 추가"),
          create("동시 추가"),
        ]);
        assert.deepEqual(simultaneous.map((r) => r.status).sort(), [201, 409]);
      },
    );
    await t.test(
      "화면 ID 중복, 부모 범위, 트리 순서, 다단계 순환과 하위 삭제 금지",
      async () => {
        const create = async (
          screenId: string,
          parentId: string | null = null,
          projectId = first.id,
        ) =>
          asJson<ScreenDto>(
            await request(`/${projectId}/screens`, "POST", {
              screenId,
              parentId,
              name: `화면 ${screenId}`,
              description: "",
            }),
            201,
          );
        const root = await create(" A "),
          sibling = await create("B"),
          child = await create("C", root.id),
          grandchild = await create("D", child.id),
          siblingChild = await create("E", sibling.id),
          foreign = await create("A", null, second.id);
        assert.equal(root.screenId, "A");
        await error(
          await request(`/${first.id}/screens`, "POST", {
            screenId: "A",
            name: "중복",
            description: "",
          }),
          409,
          "DUPLICATE_SCREEN_ID",
        );
        await error(
          await request(`/${first.id}/screens/${child.id}`, "PATCH", {
            screenId: "B",
          }),
          409,
          "DUPLICATE_SCREEN_ID",
        );
        for (const parentId of [root.id, grandchild.id])
          await error(
            await request(`/${first.id}/screens/${root.id}`, "PATCH", {
              parentId,
            }),
            409,
            "SCREEN_CYCLE",
          );
        await error(
          await request(`/${first.id}/screens/${root.id}`, "DELETE"),
          409,
          "SCREEN_HAS_CHILDREN",
        );
        await error(
          await request(`/${first.id}/screens/${child.id}`, "PATCH", {
            parentId: foreign.id,
          }),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(`/${first.id}/screens`, "POST", {
            screenId: "F",
            name: "범위",
            description: "",
            parentId: foreign.id,
          }),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(`/${first.id}/screens/${foreign.id}`, "PATCH", {
            name: "범위",
          }),
          404,
          "NOT_FOUND",
        );
        await error(
          await request(`/${first.id}/screens/${foreign.id}`, "DELETE"),
          404,
          "NOT_FOUND",
        );
        const list = await asJson<ScreenListDto>(
          await request(`/${first.id}/screens`),
        );
        assert.deepEqual(
          list.items.map((s) => s.id),
          [root.id, child.id, grandchild.id, sibling.id, siblingChild.id],
        );
        await asJson(
          await request(`/${first.id}/screens/${child.id}`, "PATCH", {
            parentId: sibling.id,
          }),
        );
        assert.deepEqual(
          (await service.listScreens(first.id, admin.account.id)).items.map(
            (s) => s.id,
          ),
          [root.id, sibling.id, siblingChild.id, child.id, grandchild.id],
        );
        await service.saveScreen(first.id, { parentId: null }, child.id);
        assert.deepEqual(
          (await service.listScreens(first.id, admin.account.id)).items.map(
            (s) => s.id,
          ),
          [root.id, sibling.id, siblingChild.id, child.id, grandchild.id],
        );
        const summary = (await service.list(admin.account.id)).items.find(
          (p) => p.id === first.id,
        );
        assert.equal(summary?.screenCount, 5);
        assert.equal(
          (await request(`/${first.id}/screens/${grandchild.id}`, "DELETE"))
            .status,
          204,
        );
        await service.removeScreen(first.id, child.id);
        await service.removeScreen(first.id, root.id);
      },
    );
    await t.test(
      "동시에 서로를 부모로 옮겨도 순환을 만들 수 없음",
      async () => {
        const a = await service.saveScreen(first.id, {
            screenId: "CONCURRENT_A",
            name: "동시 A",
            description: "",
          }),
          b = await service.saveScreen(first.id, {
            screenId: "CONCURRENT_B",
            name: "동시 B",
            description: "",
          });
        const attempts = await Promise.allSettled([
          service.saveScreen(first.id, { parentId: b.id }, a.id),
          service.saveScreen(first.id, { parentId: a.id }, b.id),
        ]);
        assert.equal(
          attempts.filter((r) => r.status === "fulfilled").length,
          1,
        );
        const rejected = attempts.find((r) => r.status === "rejected");
        assert.ok(
          rejected?.status === "rejected" &&
            code("SCREEN_CYCLE")(rejected.reason),
        );
      },
    );
    await t.test("화면 규칙 CRUD·검증·순서·다음 ID·불일치", async () => {
      const project = await asJson<ProjectDto>(
        await request("", "POST", { name: "규칙 테스트" }),
        201,
      );
      const root = `/${project.id}`;
      const body = {
        name: "페이지",
        parts: [
          {
            name: "환경",
            kind: "list",
            codes: [{ code: "PC", meaning: "웹" }],
            value: "",
            digits: 0,
          },
          { name: "번호", kind: "number", codes: [], value: "", digits: 3 },
        ],
      };
      const screen = await asJson<ScreenDto>(
        await request(`${root}/screens`, "POST", {
          screenId: "PC_002",
          name: "화면",
          description: "",
          type: "popup",
        }),
        201,
      );
      assert.equal(screen.type, "popup");
      assert.equal(screen.ruleMismatch, false);
      const rule = await asJson<ScreenIdRuleDto>(
        await request(`${root}/screen-id-rules`, "POST", body),
        201,
      );
      assert.equal(rule.example, "PC_001");
      assert.equal(rule.separator, "_");
      await error(
        await request(`${root}/screen-id-rules`, "POST", body),
        409,
        "DUPLICATE_NAME",
      );
      for (const part of [
        { ...body.parts[0], codes: [] },
        {
          ...body.parts[0],
          codes: [
            { code: "PC", meaning: "" },
            { code: "PC", meaning: "" },
          ],
        },
        { ...body.parts[0], value: "잘못된 값" },
        { ...body.parts[1], digits: 0 },
        { ...body.parts[1], digits: 7 },
        { ...body.parts[0], kind: "fixed", value: "" },
      ])
        await error(
          await request(`${root}/screen-id-rules`, "POST", {
            ...body,
            name: "거부",
            parts: [part],
          }),
          400,
          "VALIDATION_ERROR",
        );
      const other = await asJson<ScreenIdRuleDto>(
        await request(`${root}/screen-id-rules`, "POST", {
          ...body,
          name: "두 번째",
        }),
        201,
      );
      for (const ids of [
        [rule.id],
        [rule.id, rule.id],
        [rule.id, randomUUID()],
      ])
        await error(
          await request(`${root}/screen-id-rules/order`, "PUT", { ids }),
          409,
          "STALE_ORDER",
        );
      const ordered = await asJson<ScreenIdRuleListDto>(
        await request(`${root}/screen-id-rules/order`, "PUT", {
          ids: [other.id, rule.id],
        }),
      );
      assert.deepEqual(
        ordered.items.map((item) => item.id),
        [other.id, rule.id],
      );
      assert.deepEqual(
        await asJson(
          await request(`${root}/screen-id-rules/${rule.id}/next?prefix=PC`),
        ),
        { screenId: "PC_003" },
      );
      await error(
        await request(`/${second.id}/screen-id-rules/${rule.id}`, "PATCH", {
          name: "다른 프로젝트",
        }),
        404,
        "NOT_FOUND",
      );
      await error(
        await request(`/${second.id}/screen-id-rules/${rule.id}`, "DELETE"),
        404,
        "NOT_FOUND",
      );
      await error(
        await request(
          `/${second.id}/screen-id-rules/${rule.id}/next?prefix=PC`,
        ),
        404,
        "NOT_FOUND",
      );
      await error(
        await request(
          `${root}/screen-id-rules/${rule.id}/next?prefix=PC`,
          "GET",
          undefined,
          scoped.cookie,
        ),
        404,
        "NOT_FOUND",
      );
      await asJson(
        await request(`${root}/screens/${screen.id}`, "PATCH", {
          screenId: "BAD",
        }),
      );
      assert.equal(
        (await asJson<ScreenListDto>(await request(`${root}/screens`))).items[0]
          .ruleMismatch,
        true,
      );
      const patched = await asJson<ScreenIdRuleDto>(
        await request(`${root}/screen-id-rules/${rule.id}`, "PATCH", {
          parts: [
            { name: "고정", kind: "fixed", codes: [], value: "BAD", digits: 0 },
          ],
        }),
      );
      assert.equal(patched.example, "BAD");
      assert.equal(
        (await asJson<ScreenListDto>(await request(`${root}/screens`))).items[0]
          .ruleMismatch,
        false,
      );
      for (const id of [rule.id, other.id])
        assert.equal(
          (await request(`${root}/screen-id-rules/${id}`, "DELETE")).status,
          204,
        );
      const saved = (
        await asJson<ScreenListDto>(await request(`${root}/screens`))
      ).items[0];
      assert.equal(saved.screenId, "BAD");
      assert.equal(saved.ruleMismatch, false);
      assert.equal(saved.type, "popup");
    });
    await t.test(
      "IA XLSX 가져오기: 중복·빈 ID·부모 연결·유형·머리글·롤백",
      async () => {
        const project = await asJson<ProjectDto>(
          await request("", "POST", { name: "IA 테스트" }),
          201,
        );
        const root = `/${project.id}`;
        const upload = async (rows: unknown[][], filename = "ia.xlsx") => {
          const workbook = new ExcelJS.Workbook();
          workbook.addWorksheet("IA").addRows(rows);
          workbook.addWorksheet("무시").addRow(["다른 시트"]);
          const form = new FormData();
          form.append(
            "file",
            new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())]),
            filename,
          );
          return fetch(`${base}/api/v1/projects${root}/screens/import`, {
            method: "POST",
            headers: { Cookie: adminCookie },
            body: form,
          });
        };
        const header = [
          "Screen ID (화면)",
          "Type",
          "module",
          "1Depth",
          "2Depth",
          "3Depth",
          "4Depth",
          "5Depth",
          "Note",
        ];
        await asJson(
          await request(`${root}/screens`, "POST", {
            screenId: "OLD",
            name: "기존",
            description: "",
          }),
          201,
        );
        const result = await asJson(
          await upload([
            ["IA 문서"],
            header,
            ["CHILD", "Pop-up", "모듈", "부모", "자식", "", "", "", "설명"],
            ["ROOT", "Page", "모듈", "부모"],
            ["CHILD", "Tab", "중복"],
            ["OLD", "Page", "중복"],
            ["", "Page", "ID 없음"],
            ["BT", "BT", "바텀"],
            ["BOTTOM", "Bottom sheet", "바텀2"],
            ["TAB", "Tab", "탭"],
            ["POP", "Popup", "팝업"],
            ["DEFAULT", "알 수 없음", "기본"],
          ]),
          201,
        );
        assert.deepEqual(result, { created: 7, skipped: 3 });
        const list = (
          await asJson<ScreenListDto>(await request(`${root}/screens`))
        ).items;
        const find = (id: string) => {
          const row = list.find((item) => item.screenId === id);
          assert.ok(row);
          return row;
        };
        assert.equal(find("CHILD").parentId, find("ROOT").id);
        assert.equal(find("CHILD").name, "자식");
        assert.equal(find("CHILD").description, "설명");
        for (const [id, type] of [
          ["CHILD", "popup"],
          ["POP", "popup"],
          ["BT", "bottom_sheet"],
          ["BOTTOM", "bottom_sheet"],
          ["TAB", "tab"],
          ["DEFAULT", "page"],
        ])
          assert.equal(find(id).type, type);
        await error(
          await upload([["화면", "유형"]]),
          400,
          "IMPORT_HEADER_NOT_FOUND",
        );
        await error(await upload([header], "ia.csv"), 400, "VALIDATION_FAILED");
        await error(
          await upload([
            header,
            ["NEW", "Page", "정상"],
            ["INVALID", "Page", ""],
          ]),
          400,
          "VALIDATION_FAILED",
        );
        assert.equal(
          (await asJson<ScreenListDto>(await request(`${root}/screens`))).items
            .length,
          list.length,
        );
        const form = new FormData();
        form.append(
          "file",
          new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
          "large.xlsx",
        );
        assert.equal(
          (
            await fetch(`${base}/api/v1/projects${root}/screens/import`, {
              method: "POST",
              headers: { Cookie: adminCookie },
              body: form,
            })
          ).status,
          413,
        );
      },
    );
    await t.test("메모 부재 응답, upsert 1행과 마지막 수정 계정", async () => {
      await db.delete(projectMemos).where(eq(projectMemos.projectId, first.id));
      assert.deepEqual(await service.memo(first.id, admin.account.id), {
        body: "",
        updatedAt: null,
        updatedBy: null,
      });
      const saved = await asJson<MemoDto>(
        await request(`/${first.id}/memo`, "PUT", { body: "  첫 메모  " }),
      );
      assert.equal(saved.body, "첫 메모");
      assert.equal(saved.updatedBy?.id, admin.account.id);
      const updated = await asJson<MemoDto>(
        await request(
          `/${first.id}/memo`,
          "PUT",
          { body: "  마지막 메모  " },
          manager.cookie,
        ),
      );
      assert.equal(updated.body, "마지막 메모");
      assert.equal(updated.updatedBy?.id, manager.id);
      assert.ok(updated.updatedAt);
      assert.equal(
        (
          await db
            .select()
            .from(projectMemos)
            .where(eq(projectMemos.projectId, first.id))
        ).length,
        1,
      );
      assert.deepEqual(await service.memo(first.id, scoped.id), updated);
      assert.equal((await service.saveMemo(first.id, manager.id, "")).body, "");
    });
    await t.test(
      "마이그레이션의 기본값과 메모 프로젝트 유일 제약",
      async () => {
        const [row] = await db
          .insert(projects)
          .values({ name: "기본값", createdBy: admin.account.id })
          .returning();
        assert.equal(row.description, "");
        await db
          .insert(projectMemos)
          .values({ projectId: row.id, authorId: admin.account.id, body: "" });
        await assert.rejects(
          db.insert(projectMemos).values({
            projectId: row.id,
            authorId: admin.account.id,
            body: "중복",
          }),
        );
        assert.equal(
          (
            await db
              .select()
              .from(projectTemplates)
              .where(eq(projectTemplates.projectId, first.id))
          ).length,
          1,
        );
      },
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
