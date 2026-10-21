import ExcelJS from "exceljs";
import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import type { Permission } from "../src/authorization/permissions";
import { createApp } from "../src/common/application";
import type { CreateAccountDto } from "../src/contracts/identity.dto";
import type {
  ColumnsResultDto,
  OpsResultDto,
  TestSetColumnDto,
  TestSetDto,
  TestSetListDto,
  TestSetViewDto,
} from "../src/contracts/test-set.dto";
import {
  projectTemplates,
  testCases,
  testSetMembers,
} from "../src/database/schema";
import { ProjectsService } from "../src/projects/projects.service";
import { RolesService } from "../src/roles/roles.service";
import { LocalStorage } from "../src/storage/local-storage";
import { CaseOperationsService } from "../src/test-sets/case-operations.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { openTestDatabase } from "./database";

const password = "테스트-세트-비밀번호-12345";
test("실제 PostgreSQL에서 테스트 세트 권한, 양식, 연산, 보기 설정 계약", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(lease.config, lease.folder);
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl(),
      db = lease.database.db;
    const auth = app.get(AuthService),
      accounts = app.get(AccountsService),
      authorization = app.get(AuthorizationService),
      roles = app.get(RolesService),
      projects = app.get(ProjectsService),
      sets = app.get(TestSetsService),
      operations = app.get(CaseOperationsService);
    const admin = await createFirstAdministrator(
      authorization,
      accounts,
      "testsets-admin@example.com",
      "세트 관리자",
    );
    lease.accountIds.push(admin.account.id);
    await auth.setPassword(admin.token, password, "invite");
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.email, password)).token}`;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      actorCookie = cookie,
    ) =>
      fetch(`${base}/api/v1/test-sets${path}`, {
        method,
        headers: {
          Cookie: actorCookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()) as T;
    };
    const error = async (response: Response, status: number, code: string) => {
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        code,
      );
    };
    const actor = async (
      permissions: Permission[] = [],
      projectIds?: string[],
    ) => {
      const assignments: CreateAccountDto["assignments"] = [];
      if (permissions.length) {
        const role = await roles.create({
          name: randomUUID(),
          permissions,
          requiresExpiry: false,
          defaultExpiryDays: null,
        });
        lease.roleIds.push(role.id);
        assignments.push({
          roleId: role.id,
          scope: projectIds ? "projects" : "global",
          projectIds: projectIds ?? [],
        });
      }
      const result = await accounts.create({
        name: "세트 사용자",
        email: `${randomUUID()}@example.com`,
        affiliationId: admin.account.affiliation.id,
        assignments,
      });
      lease.accountIds.push(result.account.id);
      await auth.setPassword(result.token, password, "invite");
      return {
        id: result.account.id,
        cookie: `${SESSION_COOKIE}=${(await auth.login(result.account.email, password)).token}`,
      };
    };
    const p = await projects.create(admin.account.id, {
      name: "첫 프로젝트",
      description: "",
    });
    const otherProject = await projects.create(admin.account.id, {
      name: "다른 프로젝트",
      description: "",
    });
    const viewer = await actor(["test_set.export"], [p.id]),
      editor = await actor(["test_set.create"], [p.id]),
      allViewer = await actor(["test_set.view_all"], [p.id]),
      outsider = await actor();
    let first!: TestSetDto, other!: TestSetDto, ownedByEditor!: TestSetDto;
    await t.test(
      "만들기는 이름과 프로젝트를 검증하고 기본 양식을 새 UUID로 복사",
      async () => {
        first = await json<TestSetDto>(
          await request("", "POST", {
            name: "  Alpha 세트  ",
            projectId: p.id,
          }),
          201,
        );
        other = await json<TestSetDto>(
          await request("", "POST", {
            name: "다른 프로젝트",
            projectId: otherProject.id,
            memo: "메모",
          }),
          201,
        );
        ownedByEditor = await json<TestSetDto>(
          await request(
            "",
            "POST",
            { name: "내 소유", projectId: p.id },
            editor.cookie,
          ),
          201,
        );
        assert.equal(first.name, "Alpha 세트");
        assert.equal(first.memo, "");
        assert.equal(first.isPublic, false);
        assert.deepEqual(first.cases, []);
        assert.equal(first.project.id, p.id);
        assert.equal(first.owner.id, admin.account.id);
        const template = await projects.template(p.id, admin.account.id);
        assert.deepEqual(
          first.columns.map(({ id: _id, ...c }) => c),
          template.columns
            .filter((c) => c.enabled)
            .map(({ id: _id, enabled: _enabled, ...c }) => c),
        );
        assert.ok(
          first.columns.every(
            (c) => !template.columns.some((old) => old.id === c.id),
          ),
        );
        template.columns[2].enabled = false;
        await projects.saveTemplate(p.id, template);
        const filtered = await sets.create(admin.account.id, {
          name: "꺼진 열 제외",
          projectId: p.id,
          memo: "",
        });
        assert.equal(filtered.columns.length, 12);
        assert.ok(
          filtered.columns.every(
            (c) => c.presetKey !== "test_case" && c.presetKey !== "extra",
          ),
        );
        await sets.remove(filtered.id, admin.account.id);
        assert.equal(
          (await sets.detail(first.id, admin.account.id)).columns[2].name,
          "테스트 케이스",
        );
        await error(
          await request(
            "",
            "POST",
            { name: "불가", projectId: p.id },
            viewer.cookie,
          ),
          403,
          "FORBIDDEN",
        );
        await error(
          await request(
            "",
            "POST",
            { name: "숨김", projectId: p.id },
            outsider.cookie,
          ),
          404,
          "NOT_FOUND",
        );
        await error(
          await request("", "POST", { name: "없음", projectId: randomUUID() }),
          404,
          "NOT_FOUND",
        );
        await db.insert(testSetMembers).values([
          { testSetId: first.id, accountId: viewer.id, access: "view" },
          { testSetId: first.id, accountId: editor.id, access: "edit" },
          { testSetId: first.id, accountId: admin.account.id, access: "view" },
        ]);
      },
    );
    await t.test(
      "세트 상세는 NO_ACCESS를 주고 하위 경로는 숨기며 보이는 쓰기는 권한별 403",
      async () => {
        const validView = {
          view: "table",
          groupByColumnId: null,
          columnWidths: {},
          rowHeights: {},
        };
        for (const [suffix, method, body] of [
          ["", "GET", undefined],
          ["", "PATCH", { memo: "메모" }],
          ["", "DELETE", undefined],
          ["/columns", "PUT", { columns: first.columns }],
          ["/ops", "POST", { ops: [{ type: "delete_cases", caseIds: [] }] }],
          ["/view", "GET", undefined],
          ["/view", "PUT", validView],
          ["/export", "GET", undefined],
        ] as const) {
          await error(
            await request(
              `/${first.id}${suffix}`,
              method,
              body,
              outsider.cookie,
            ),
            suffix === "" && method === "GET" ? 403 : 404,
            suffix === "" && method === "GET" ? "NO_ACCESS" : "NOT_FOUND",
          );
          await error(
            await request(`/${randomUUID()}${suffix}`, method, body),
            404,
            "NOT_FOUND",
          );
        }
        for (const who of [viewer, allViewer]) {
          const detail = await json<TestSetDto>(
            await request(`/${first.id}`, "GET", undefined, who.cookie),
          );
          assert.equal(detail.access.canEdit, false);
          assert.equal(detail.access.canRename, false);
          assert.equal(detail.access.canDelete, false);
          for (const [suffix, method, body] of [
            ["", "PATCH", { name: "변경" }],
            ["", "DELETE", undefined],
            ["/columns", "PUT", { columns: first.columns }],
            ["/ops", "POST", { ops: [{ type: "delete_cases", caseIds: [] }] }],
          ] as const)
            await error(
              await request(`/${first.id}${suffix}`, method, body, who.cookie),
              403,
              "FORBIDDEN",
            );
        }
        const access = (
          await json<TestSetDto>(
            await request(`/${first.id}`, "GET", undefined, editor.cookie),
          )
        ).access;
        assert.deepEqual(access, {
          canEdit: true,
          canRename: true,
          canDelete: false,
          canExport: false,
        });
        await error(
          await request(`/${first.id}`, "DELETE", undefined, editor.cookie),
          403,
          "FORBIDDEN",
        );
        await json(
          await request(
            `/${first.id}`,
            "PATCH",
            { memo: "편집자 메모" },
            editor.cookie,
          ),
        );
        assert.equal(
          (await sets.detail(first.id, admin.account.id)).memo,
          "편집자 메모",
        );
        const beforeEmptyPatch = await sets.detail(first.id, admin.account.id);
        const afterEmptyPatch = await json<TestSetDto>(
          await request(`/${first.id}`, "PATCH", {}),
        );
        assert.equal(afterEmptyPatch.name, beforeEmptyPatch.name);
        assert.equal(afterEmptyPatch.memo, beforeEmptyPatch.memo);
        await error(
          await request(`/${other.id}`, "GET", undefined, allViewer.cookie),
          403,
          "NO_ACCESS",
        );
        await error(
          await request(`/${first.id}/export`, "GET", undefined, editor.cookie),
          403,
          "FORBIDDEN",
        );
        await error(
          await request(
            `/${first.id}/export`,
            "GET",
            undefined,
            allViewer.cookie,
          ),
          403,
          "FORBIDDEN",
        );
        const exported = await request(
          `/${first.id}/export`,
          "GET",
          undefined,
          viewer.cookie,
        );
        assert.equal(exported.status, 200);
        assert.match(
          exported.headers.get("content-type") ?? "",
          /spreadsheetml\.sheet/,
        );
        assert.ok(
          (exported.headers.get("content-disposition") ?? "").includes(
            encodeURIComponent(`${first.name}.xlsx`),
          ),
        );
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await exported.arrayBuffer());
        const sheet = workbook.worksheets[0];
        assert.ok(sheet);
        const header = (sheet.getRow(1).values as unknown[])
          .slice(1)
          .map(String);
        assert.deepEqual(
          header,
          first.columns.map((c) => c.name),
        );
      },
    );
    await t.test(
      "목록은 소유, 초대, 범위 보기와 대소문자 무시 부분 검색, 최근 수정순",
      async () => {
        const list = async (query: string, who: typeof editor) =>
          (
            await json<TestSetListDto>(
              await request(query, "GET", undefined, who.cookie),
            )
          ).items;
        assert.deepEqual(
          (await list("?filter=mine", editor)).map((s) => s.id),
          [ownedByEditor.id],
        );
        assert.deepEqual(
          (await list("?filter=shared", editor)).map((s) => s.id),
          [first.id],
        );
        assert.deepEqual(
          (await list("?filter=shared", { id: admin.account.id, cookie })).map(
            (s) => s.id,
          ),
          [],
        );
        assert.equal((await list("?filter=all", allViewer)).length, 2);
        assert.deepEqual(await list("?filter=all", outsider), []);
        assert.deepEqual(
          (await list("?search=aLpH", viewer)).map((s) => s.id),
          [first.id],
        );
        assert.deepEqual(await list("?search=없는이름", viewer), []);
        const items = await list("", editor);
        assert.equal(items[0].id, first.id);
        assert.equal(items[0].owner.id, admin.account.id);
        assert.equal(items[0].reviewCount, 0);
        assert.equal(items[0].caseCount, 0);
      },
    );
    const caseA = randomUUID(),
      caseB = randomUUID(),
      caseC = randomUUID();
    const tid = () => first.columns[0].id,
      title = () => {
        const column = first.columns.find((c) => c.systemKey === "title");
        assert.ok(column);
        return column.id;
      };
    await t.test(
      "연산 추가는 번호와 작성자를 저장하고 이동, 셀 변경, 삭제는 원자적으로 적용",
      async () => {
        const before = await sets.detail(first.id, admin.account.id);
        const added = await json<OpsResultDto>(
          await request(
            `/${first.id}/ops`,
            "POST",
            {
              ops: [
                {
                  type: "add_case",
                  caseId: caseA,
                  afterCaseId: null,
                  values: { [title()]: "첫 제목" },
                },
                { type: "add_case", caseId: caseB, afterCaseId: caseA },
                {
                  type: "add_case",
                  caseId: caseC,
                  afterCaseId: null,
                  values: { [tid()]: "TC-999" },
                },
              ],
            },
            editor.cookie,
          ),
        );
        assert.equal(added.version, before.version + 1);
        assert.deepEqual(
          added.cases.map((c) => c.id),
          [caseC, caseA, caseB],
        );
        assert.equal(added.cases[1].values[tid()], "TC-001");
        assert.equal(added.cases[2].values[tid()], "TC-002");
        const [stored] = await db
          .select()
          .from(testCases)
          .where(eq(testCases.id, caseA));
        assert.equal(stored.createdBy, editor.id);
        assert.equal(stored.authorName, "세트 사용자");
        const changed = await json<OpsResultDto>(
          await request(`/${first.id}/ops`, "POST", {
            ops: [
              { type: "move_case", caseId: caseB, afterCaseId: null },
              {
                type: "set_cell",
                caseId: caseA,
                columnId: title(),
                value: "이전",
              },
              {
                type: "set_cell",
                caseId: caseA,
                columnId: title(),
                value: "마지막",
              },
            ],
          }),
        );
        assert.deepEqual(
          changed.cases.map((c) => c.id),
          [caseB, caseA],
        );
        assert.equal(changed.cases[1].values[title()], "마지막");
        assert.deepEqual(
          (await sets.detail(first.id, admin.account.id)).cases.map(
            (c) => c.id,
          ),
          [caseB, caseC, caseA],
        );
        assert.ok(
          new Date((await sets.detail(first.id, admin.account.id)).updatedAt) >
            new Date(before.updatedAt),
        );
        const removed = await json<OpsResultDto>(
          await request(`/${first.id}/ops`, "POST", {
            ops: [{ type: "delete_cases", caseIds: [caseC, caseC] }],
          }),
        );
        assert.deepEqual(removed.deletedCaseIds, [caseC]);
        assert.deepEqual(removed.cases, []);
        const next = randomUUID();
        const result = await operations.apply(first.id, editor.id, {
          ops: [{ type: "add_case", caseId: next, afterCaseId: caseA }],
        });
        assert.equal(result.cases[0].values[tid()], "TC-1000");
        assert.equal(
          (await json<TestSetListDto>(await request("?search=Alpha"))).items[0]
            .caseCount,
          3,
        );
      },
    );
    await t.test(
      "잘못된 값, 없는 대상과 다른 세트 참조는 전체 요청을 되돌림",
      async () => {
        const foreignCase = randomUUID();
        await operations.apply(other.id, admin.account.id, {
          ops: [{ type: "add_case", caseId: foreignCase, afterCaseId: null }],
        });
        for (const [op, status, code] of [
          [
            { type: "set_cell", caseId: caseA, columnId: title(), value: true },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              type: "set_cell",
              caseId: caseA,
              columnId: title(),
              value: "x".repeat(20001),
            },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              type: "set_cell",
              caseId: caseA,
              columnId: other.columns[1].id,
              value: "값",
            },
            404,
            "NOT_FOUND",
          ],
          [
            {
              type: "set_cell",
              caseId: foreignCase,
              columnId: title(),
              value: "값",
            },
            404,
            "NOT_FOUND",
          ],
          [
            { type: "delete_cases", caseIds: [caseA, foreignCase] },
            404,
            "NOT_FOUND",
          ],
          [
            { type: "move_case", caseId: caseA, afterCaseId: foreignCase },
            404,
            "NOT_FOUND",
          ],
          [
            { type: "move_case", caseId: caseA, afterCaseId: caseA },
            400,
            "VALIDATION_FAILED",
          ],
          [
            { type: "add_case", caseId: caseA, afterCaseId: null },
            409,
            "DUPLICATE_CASE",
          ],
          [
            { type: "add_case", caseId: foreignCase, afterCaseId: null },
            409,
            "DUPLICATE_CASE",
          ],
          [
            {
              type: "add_case",
              caseId: randomUUID(),
              afterCaseId: foreignCase,
            },
            404,
            "NOT_FOUND",
          ],
        ] as const) {
          const before = await sets.detail(first.id, admin.account.id);
          await error(
            await request(`/${first.id}/ops`, "POST", {
              ops: [
                { type: "add_case", caseId: randomUUID(), afterCaseId: null },
                op,
              ],
            }),
            status,
            code,
          );
          assert.deepEqual(
            await sets.detail(first.id, admin.account.id),
            before,
          );
        }
        const results = await Promise.all(
          [randomUUID(), randomUUID()].map((caseId) =>
            operations.apply(first.id, editor.id, {
              ops: [{ type: "add_case", caseId, afterCaseId: null }],
            }),
          ),
        );
        const numbers = results.map((r) => r.cases[0].values[tid()]);
        assert.equal(new Set(numbers).size, 2);
        assert.deepEqual(new Set(numbers), new Set(["TC-1001", "TC-1002"]));
      },
    );
    let select!: TestSetColumnDto,
      tags!: TestSetColumnDto,
      checkbox!: TestSetColumnDto;
    await t.test(
      "열 검증 재사용, 값 정리와 형식 변환은 기본 양식을 바꾸지 않음",
      async () => {
        const custom = (
          name: string,
          type: TestSetColumnDto["type"],
          options: string[] = [],
        ): TestSetColumnDto => ({
          id: randomUUID(),
          systemKey: null,
          presetKey: null,
          name,
          type,
          options,
          description: "",
        });
        select = custom("선택", "select", ["가", "나"]);
        tags = custom("태그", "tags", ["가", "나"]);
        checkbox = custom("체크", "checkbox");
        const columns = [...first.columns, select, tags, checkbox];
        const originalTemplate = await projects.template(
          p.id,
          admin.account.id,
        );
        first = {
          ...first,
          ...(await json<ColumnsResultDto>(
            await request(
              `/${first.id}/columns`,
              "PUT",
              { columns },
              editor.cookie,
            ),
          )),
        };
        assert.deepEqual(
          first.columns.map((c) => c.presetKey),
          columns.map((c) => c.presetKey),
        );
        const preserved = await sets.saveColumns(first.id, editor.id, {
          columns: first.columns.map((c) => ({ ...c, presetKey: "forged" })),
        });
        assert.deepEqual(
          preserved.columns.map((c) => c.presetKey),
          first.columns.map((c) => c.presetKey),
        );
        await operations.apply(first.id, editor.id, {
          ops: [
            {
              type: "set_cell",
              caseId: caseA,
              columnId: select.id,
              value: "가",
            },
            {
              type: "set_cell",
              caseId: caseA,
              columnId: tags.id,
              value: ["가", "나"],
            },
            {
              type: "set_cell",
              caseId: caseA,
              columnId: checkbox.id,
              value: true,
            },
            {
              type: "set_cell",
              caseId: caseA,
              columnId: first.columns[2].id,
              value: "지울 열",
            },
          ],
        });
        for (const [columnId, value] of [
          [select.id, "다"],
          [tags.id, ["가", "가"]],
          [checkbox.id, "예"],
        ])
          await error(
            await request(`/${first.id}/ops`, "POST", {
              ops: [{ type: "set_cell", caseId: caseA, columnId, value }],
            }),
            400,
            "VALIDATION_FAILED",
          );
        const trimmed = columns
          .filter((c) => c.id !== first.columns[2].id)
          .map((c) =>
            c.id === select.id
              ? { ...c, options: ["나"] }
              : c.id === tags.id
                ? { ...c, options: ["나"] }
                : c.id === checkbox.id
                  ? { ...c, type: "text" as const }
                  : c,
          );
        const saved = await json<ColumnsResultDto>(
          await request(`/${first.id}/columns`, "PUT", { columns: trimmed }),
        );
        const values = saved.cases.find((c) => c.id === caseA)?.values;
        assert.ok(values);
        assert.equal(select.id in values, false);
        assert.deepEqual(values[tags.id], ["나"]);
        assert.equal(values[checkbox.id], "예");
        assert.equal(first.columns[2].id in values, false);
        assert.deepEqual(
          await projects.template(p.id, admin.account.id),
          originalTemplate,
        );
        const bad = structuredClone(trimmed);
        bad[0].name = "변경 금지";
        await error(
          await request(`/${first.id}/columns`, "PUT", { columns: bad }),
          400,
          "VALIDATION_FAILED",
        );
        const foreign = [
          ...trimmed,
          { ...other.columns[2], name: "다른 세트 열" },
        ];
        const before = await sets.detail(first.id, admin.account.id);
        await error(
          await request(`/${first.id}/columns`, "PUT", { columns: foreign }),
          400,
          "VALIDATION_FAILED",
        );
        assert.deepEqual(await sets.detail(first.id, admin.account.id), before);
        first = await sets.detail(first.id, admin.account.id);
        assert.equal(
          (
            await db
              .select()
              .from(projectTemplates)
              .where(eq(projectTemplates.projectId, p.id))
          ).length,
          1,
        );
      },
    );
    await t.test(
      "보기 설정은 사용자별이며 묶기 범위와 크기를 검증하고 삭제된 참조를 정리",
      async () => {
        const empty = {
          view: "table",
          groupByColumnId: null,
          columnWidths: {},
          rowHeights: {},
        };
        assert.deepEqual(
          await json(
            await request(`/${first.id}/view`, "GET", undefined, viewer.cookie),
          ),
          empty,
        );
        const view = {
          view: "card",
          groupByColumnId: tags.id,
          columnWidths: { [tags.id]: 2000 },
          rowHeights: { [caseA]: 2000 },
        };
        assert.deepEqual(
          await json(
            await request(`/${first.id}/view`, "PUT", view, viewer.cookie),
          ),
          view,
        );
        assert.deepEqual(
          await json(
            await request(`/${first.id}/view`, "GET", undefined, viewer.cookie),
          ),
          view,
        );
        assert.deepEqual(await json(await request(`/${first.id}/view`)), empty);
        for (const patch of [
          { groupByColumnId: first.columns[0].id },
          { groupByColumnId: other.columns[5].id },
          { columnWidths: { [tags.id]: 39 } },
          { rowHeights: { [caseA]: 23 } },
          { rowHeights: { [randomUUID()]: 40 } },
          { columnWidths: { [other.columns[0].id]: 40 } },
        ])
          await error(
            await request(
              `/${first.id}/view`,
              "PUT",
              { ...view, ...patch },
              viewer.cookie,
            ),
            400,
            "VALIDATION_FAILED",
          );
        await json(
          await request(`/${first.id}/columns`, "PUT", {
            columns: first.columns.filter((c) => c.id !== tags.id),
          }),
        );
        const cleaned = await json<TestSetViewDto>(
          await request(`/${first.id}/view`, "GET", undefined, viewer.cookie),
        );
        assert.equal(cleaned.groupByColumnId, null);
        assert.deepEqual(cleaned.columnWidths, {});
        await operations.apply(first.id, admin.account.id, {
          ops: [{ type: "delete_cases", caseIds: [caseA] }],
        });
        assert.deepEqual(
          (
            await json<TestSetViewDto>(
              await request(
                `/${first.id}/view`,
                "GET",
                undefined,
                viewer.cookie,
              ),
            )
          ).rowHeights,
          {},
        );
        await json(
          await request(
            `/${first.id}/view`,
            "PUT",
            { ...empty, groupByColumnId: select.id },
            viewer.cookie,
          ),
        );
        assert.equal((await request(`/${first.id}`, "DELETE")).status, 204);
        await error(await request(`/${first.id}`), 404, "NOT_FOUND");
      },
    );
    await t.test(
      "XLSX 파일은 현재 열 이름과 순서로 전체 케이스를 담고 태그와 체크박스를 글자로 쓴다",
      async () => {
        const set = await json<TestSetDto>(
          await request("", "POST", { name: "내보내기 세트", projectId: p.id }),
          201,
        );
        const columns: TestSetColumnDto[] = [
          ...set.columns.filter((c) => c.systemKey),
          {
            id: randomUUID(),
            systemKey: null,
            presetKey: null,
            name: "영역",
            type: "tags",
            description: "",
            options: ["회원", "약관"],
          },
          {
            id: randomUUID(),
            systemKey: null,
            presetKey: null,
            name: "자동화",
            type: "checkbox",
            description: "",
            options: [],
          },
        ];
        const saved = await json<ColumnsResultDto>(
          await request(`/${set.id}/columns`, "PUT", { columns }),
        );
        const [id, title, tags, auto] = saved.columns;
        assert.ok(id && title && tags && auto);
        const first = randomUUID(),
          second = randomUUID();
        await json<OpsResultDto>(
          await request(`/${set.id}/ops`, "POST", {
            ops: [
              {
                type: "add_case",
                caseId: first,
                afterCaseId: null,
                values: {
                  [title.id]: "가입한다",
                  [tags.id]: ["회원", "약관"],
                  [auto.id]: true,
                },
              },
              {
                type: "add_case",
                caseId: second,
                afterCaseId: first,
                values: { [title.id]: "탈퇴한다", [auto.id]: false },
              },
            ],
          }),
        );
        const exported = await request(`/${set.id}/export`);
        assert.equal(exported.status, 200);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(await exported.arrayBuffer());
        const sheet = workbook.worksheets[0];
        assert.ok(sheet);
        const row = (n: number) =>
          (sheet.getRow(n).values as unknown[]).slice(1).map((v) => v ?? "");
        assert.deepEqual(row(1), ["테스트 ID", "제목", "영역", "자동화"]);
        assert.deepEqual(row(2), ["TC-001", "가입한다", "회원, 약관", "예"]);
        assert.deepEqual(row(3), ["TC-002", "탈퇴한다", "", ""]);
        assert.equal(sheet.rowCount, 3);
        assert.equal((await request(`/${set.id}`, "DELETE")).status, 204);
      },
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
