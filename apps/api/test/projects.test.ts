import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import type {
  FeatureGroupDto,
  FeatureGroupListDto,
  MemoDto,
  ProjectDto,
  ProjectListDto,
  ScreenDraftListDto,
  ScreenDto,
  ScreenIdRuleDraftListDto,
  ScreenIdRuleDto,
  ScreenIdRuleListDto,
  ScreenListDto,
  TemplateDto,
} from "../src/contracts/project.dto";
import {
  projectMemos,
  projects,
  projectTemplates,
} from "../src/database/schema";
import { readAiConfig } from "../src/generation/model-config";
import { ProjectsService } from "../src/projects/projects.service";
import { findPresetColumn } from "../src/projects/template";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";

const code = (expected: string) => (error: unknown) =>
  error instanceof ApiError && error.code === expected;
const password = "프로젝트-테스트-비밀번호-12345";
test("실제 PostgreSQL에서 프로젝트 설정·권한·충돌·화면 구조 계약", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(
    { ...lease.config, ai: readAiConfig({ AI_PROVIDER: "fake" }) },
    lease.folder,
  );
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const service = app.get(ProjectsService),
      accounts = app.get(AccountsService),
      auth = app.get(AuthService),
      authorization = app.get(AuthorizationService);
    const db = lease.database.db;
    const admin = await createFirstAdministrator(
      authorization,
      accounts,
      "projects-admin@example.com",
      "프로젝트 관리자",
    );
    lease.accountIds.push(admin.account.id);
    await accounts.resetPassword(admin.account.id, password);
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
    const actor = async () => {
      const account = await accounts.create({
        name: "설정 사용자",
        loginId: `${randomUUID()}@example.com`,
        role: "member",
        password,
      });
      lease.accountIds.push(account.id);
      return {
        id: account.id,
        cookie: `${SESSION_COOKIE}=${(await auth.login(account.loginId, password)).token}`,
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
        assert.ok(
          template.columns.every(
            (c) =>
              c.description ===
              findPresetColumn(c.presetKey ?? "")?.description,
          ),
        );
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
      const fault = `cheddar_test_${randomUUID().replaceAll("-", "")}`;
      // 프로젝트와 양식 삽입 후 메모 저장이 실패해도 전체 생성이 롤백되어야 한다.
      await lease.database.pool.query(
        `CREATE FUNCTION "${fault}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_MEMO_WRITE_FAILED'; END $$`,
      );
      try {
        await lease.database.pool.query(
          `CREATE TRIGGER "${fault}" BEFORE INSERT ON project_memos FOR EACH ROW EXECUTE FUNCTION "${fault}"()`,
        );
        await assert.rejects(
          service.create(admin.account.id, { name, description: "" }),
          (error: unknown) =>
            error instanceof Error &&
            error.cause instanceof Error &&
            error.cause.message === "TEST_MEMO_WRITE_FAILED",
        );
      } finally {
        await lease.database.pool.query(
          `DROP TRIGGER IF EXISTS "${fault}" ON project_memos`,
        );
        await lease.database.pool.query(`DROP FUNCTION "${fault}"()`);
      }
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
    const scoped = await actor(),
      manager = await actor();
    await t.test("구성원은 모든 프로젝트와 설정을 보고 편집한다", async () => {
      for (const who of [scoped, manager]) {
        const list = await asJson<ProjectListDto>(
          await request("", "GET", undefined, who.cookie),
        );
        assert.deepEqual(
          list.items.map((p) => p.id),
          [first.id, second.id],
        );
        assert.ok(list.items.every((p) => p.canManage));
        for (const project of [first, second]) {
          for (const suffix of [
            "",
            "/template",
            "/feature-groups",
            "/screens",
            "/screen-id-rules",
            "/memo",
          ])
            assert.equal(
              (
                await request(
                  `/${project.id}${suffix}`,
                  "GET",
                  undefined,
                  who.cookie,
                )
              ).status,
              200,
            );
          assert.equal(
            (
              await request(
                `/${project.id}`,
                "PATCH",
                { description: "새 설명" },
                who.cookie,
              )
            ).status,
            200,
          );
        }
      }
      await error(await request(`/${randomUUID()}`), 404, "NOT_FOUND");
      const created = await asJson<ProjectDto>(
        await request("", "POST", { name: "구성원 프로젝트" }, scoped.cookie),
        201,
      );
      assert.equal(created.canManage, true);
      const saved = await asJson<MemoDto>(
        await request(
          `/${created.id}/memo`,
          "PUT",
          { body: "작성" },
          manager.cookie,
        ),
      );
      assert.equal(saved.body, "작성");
    });
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
      assert.equal(
        (
          await request(
            `${root}/screen-id-rules/${rule.id}/next?prefix=PC`,
            "GET",
            undefined,
            scoped.cookie,
          )
        ).status,
        200,
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
      "파일에서 화면 초안: 상위 경로 잇기, 중복, ID 없는 행, 버튼, 기존 화면, 일괄 추가",
      async () => {
        const project = await asJson<ProjectDto>(
          await request("", "POST", { name: "IA 테스트" }),
          201,
        );
        const root = `/${project.id}`;
        const post = async (
          path: string,
          files: { name: string; body: Uint8Array | string }[],
          text?: string,
        ) => {
          const form = new FormData();
          if (text !== undefined) form.append("text", text);
          for (const file of files)
            form.append("files[]", new Blob([file.body]), file.name);
          return fetch(`${base}/api/v1/projects${root}${path}`, {
            method: "POST",
            headers: { Cookie: adminCookie },
            body: form,
          });
        };
        const workbook = new ExcelJS.Workbook();
        workbook
          .addWorksheet("IA")
          .addRows([
            ["IA 문서"],
            [
              "No",
              "module",
              "1Depth",
              "2Depth",
              "Type",
              "Screen ID_최종",
              "Note",
            ],
            [1, "홈", "", "", "Page", "U_HOME_PG_001", ""],
            [2, "", "공지", "", "Page", "U_HOME_PG_002", "목록"],
            [3, "", "", "상세", "Popup", "U_HOME_PO_001", "설명"],
            [4, "", "", "다운로드", "Button", "", ""],
            [5, "", "", "탭", "Tab", "U_HOME_PG_002", ""],
            [6, "", "알림", "", "Page", "", ""],
            [7, "", "", "알림 상세", "Bottom sheet", "U_HOME_BT_001", ""],
            [8, "마이", "", "", "Page", "OLD", ""],
          ]);
        workbook.addWorksheet("메모").addRow(["다른 시트"]);
        const xlsx = new Uint8Array(await workbook.xlsx.writeBuffer());
        await asJson(
          await request(`${root}/screens`, "POST", {
            screenId: "OLD",
            name: "기존",
            description: "",
          }),
          201,
        );
        const drafts = await asJson<ScreenDraftListDto>(
          await post("/screens/drafts", [
            { name: "화면 목록.xlsx", body: xlsx },
            { name: "설명.pdf", body: "pdf" },
          ]),
          201,
        );
        assert.deepEqual(drafts.unreadFiles, ["설명.pdf"]);
        assert.equal(drafts.skipped, 1);
        const draft = (id: string) => {
          const row = drafts.items.find((item) => item.screenId === id);
          assert.ok(row, id);
          return row;
        };
        assert.deepEqual(
          drafts.items.map((item) => item.screenId),
          [
            "U_HOME_PG_001",
            "U_HOME_PG_002",
            "U_HOME_PO_001",
            "U_HOME_BT_001",
            "OLD",
          ],
        );
        assert.equal(
          draft("U_HOME_PG_002").parentKey,
          draft("U_HOME_PG_001").key,
        );
        assert.equal(
          draft("U_HOME_PO_001").parentKey,
          draft("U_HOME_PG_002").key,
        );
        assert.equal(draft("U_HOME_PO_001").name, "상세");
        assert.equal(draft("U_HOME_PO_001").type, "popup");
        assert.equal(draft("U_HOME_PO_001").description, "설명");
        // 상위 행(알림)에 ID가 없으면 그 위 화면에 잇는다.
        assert.equal(
          draft("U_HOME_BT_001").parentKey,
          draft("U_HOME_PG_001").key,
        );
        assert.equal(draft("U_HOME_BT_001").type, "bottom_sheet");
        assert.equal(draft("OLD").exists, true);
        assert.equal(draft("U_HOME_PG_001").exists, false);

        const keyToId = new Map(drafts.items.map((d) => [d.key, d.screenId]));
        const result = await asJson(
          await request(`${root}/screens/batch`, "POST", {
            items: drafts.items.map((d) => ({
              screenId: d.screenId,
              name: d.name,
              type: d.type,
              description: d.description,
              parentScreenId: d.parentKey ? keyToId.get(d.parentKey) : null,
            })),
          }),
          201,
        );
        assert.deepEqual(result, { created: 4, skipped: 1 });
        const list = (
          await asJson<ScreenListDto>(await request(`${root}/screens`))
        ).items;
        const saved = (id: string) => {
          const row = list.find((item) => item.screenId === id);
          assert.ok(row, id);
          return row;
        };
        assert.equal(
          saved("U_HOME_PO_001").parentId,
          saved("U_HOME_PG_002").id,
        );
        assert.equal(saved("U_HOME_PG_001").parentId, null);

        // 붙여 넣은 글에서도 화면 ID만 뽑는다.
        const pasted = await asJson<ScreenDraftListDto>(
          await post(
            "/screens/drafts",
            [],
            "U_HOME_PG_009 새 화면\n제목만 있는 줄",
          ),
          201,
        );
        assert.deepEqual(
          pasted.items.map((d) => [d.screenId, d.exists]),
          [["U_HOME_PG_009", false]],
        );
        await error(
          await post("/screens/drafts", [{ name: "a.pdf", body: "x" }]),
          422,
          "SOURCE_UNREADABLE",
        );
        await error(
          await post("/screens/drafts", [], "화면 ID 없음"),
          422,
          "SCREEN_IDS_NOT_FOUND",
        );
        await error(await post("/screens/drafts", []), 400, "VALIDATION_ERROR");
        assert.equal(
          (
            await post("/screens/drafts", [
              {
                name: "large.xlsx",
                body: new Uint8Array(10 * 1024 * 1024 + 1),
              },
            ])
          ).status,
          413,
        );
        // 서로를 상위로 가리켜도 순환을 저장하지 않는다
        await asJson(
          await request(`${root}/screens/batch`, "POST", {
            items: [
              {
                screenId: "LOOP_A",
                name: "A",
                description: "",
                parentScreenId: "LOOP_B",
              },
              {
                screenId: "LOOP_B",
                name: "B",
                description: "",
                parentScreenId: "LOOP_A",
              },
            ],
          }),
          201,
        );
        const looped = (
          await asJson<ScreenListDto>(await request(`${root}/screens`))
        ).items.filter((item) => item.screenId.startsWith("LOOP_"));
        assert.equal(looped.length, 2);
        assert.equal(looped.filter((item) => item.parentId === null).length, 1);
        // 파일 합계가 한도를 넘으면 본문을 읽기 전에 막는다
        const oversized = await new Promise<number>((resolve, reject) => {
          const req = httpRequest(
            `${base}/api/v1/projects${root}/screens/drafts`,
            {
              method: "POST",
              headers: {
                Cookie: adminCookie,
                "Content-Length": String(32 * 1024 * 1024),
              },
            },
            (res) => {
              res.resume();
              res.on("end", () => resolve(res.statusCode ?? 0));
            },
          );
          req.on("error", reject);
          req.end();
        });
        assert.equal(oversized, 413);
        await error(
          await request(`${root}/screens/batch`, "POST", { items: [] }),
          400,
          "VALIDATION_ERROR",
        );
      },
    );
    await t.test(
      "파일에서 화면 ID 규칙 초안: 맞는 ID가 있는 규칙만, 이름 겹침 피하기",
      async () => {
        const project = await asJson<ProjectDto>(
          await request("", "POST", { name: "규칙 초안" }),
          201,
        );
        const root = `/${project.id}`;
        await asJson(
          await request(`${root}/screen-id-rules`, "POST", {
            name: "규칙 1",
            separator: "_",
            parts: [
              { name: "번호", kind: "number", codes: [], value: "", digits: 3 },
            ],
          }),
          201,
        );
        const form = new FormData();
        form.append(
          "text",
          "PC_CPN_REG_PG_001 쿠폰 등록\nPC_ORD_LIST_PG_002 주문 목록\nU_SP_0101_PG 스플래시",
        );
        const drafts = await asJson<ScreenIdRuleDraftListDto>(
          await fetch(`${base}/api/v1/projects${root}/screen-id-rules/drafts`, {
            method: "POST",
            headers: { Cookie: adminCookie },
            body: form,
          }),
          201,
        );
        assert.equal(drafts.items.length, 2);
        assert.ok(!drafts.items.some((rule) => rule.name === "규칙 1"));
        const [admin] = drafts.items;
        assert.equal(admin.parts.length, 5);
        assert.deepEqual(
          admin.parts[1].codes.map((c) => c.code),
          ["CPN", "ORD"],
        );
        assert.equal(admin.parts[4].kind, "number");
        assert.equal(admin.example, "PC_CPN_REG_PG_001");
        // 초안은 그대로 규칙으로 저장할 수 있다.
        await asJson(
          await request(`${root}/screen-id-rules`, "POST", {
            name: admin.name,
            separator: admin.separator,
            parts: admin.parts,
          }),
          201,
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
