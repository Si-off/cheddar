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
import { createApp } from "../src/common/application";
import type {
  OpsResultDto,
  RecentTemplateDto,
  TestSetColumnDto,
  TestSetDto,
  TestSetListDto,
  TestSetViewDto,
} from "../src/contracts/test-set.dto";
import {
  projectTemplates,
  testCases,
  testCaseValues,
  testSets,
} from "../src/database/schema";
import { ProjectsService } from "../src/projects/projects.service";
import { defaultColumns } from "../src/projects/template";
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
    await accounts.resetPassword(admin.account.id, password);
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
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
    const actor = async () => {
      const account = await accounts.create({
        name: "세트 사용자",
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
    const p = await projects.create(admin.account.id, {
      name: "첫 프로젝트",
      description: "",
    });
    const otherProject = await projects.create(admin.account.id, {
      name: "다른 프로젝트",
      description: "",
    });
    const viewer = await actor(),
      editor = await actor(),
      allViewer = await actor(),
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
          await request("", "POST", { name: "없음", projectId: randomUUID() }),
          404,
          "NOT_FOUND",
        );
      },
    );
    await t.test(
      "구성원은 타인 세트를 보고 편집·내보내며 삭제는 거부된다",
      async () => {
        for (const who of [viewer, editor, allViewer, outsider]) {
          const detail = await json<TestSetDto>(
            await request(`/${first.id}`, "GET", undefined, who.cookie),
          );
          assert.deepEqual(detail.access, {
            canEdit: true,
            canRename: true,
            canDelete: false,
            canExport: true,
          });
          await error(
            await request(`/${first.id}`, "DELETE", undefined, who.cookie),
            403,
            "FORBIDDEN",
          );
          await error(
            await request(`/${randomUUID()}`, "GET", undefined, who.cookie),
            404,
            "NOT_FOUND",
          );
          assert.equal(
            (await request(`/${other.id}`, "GET", undefined, who.cookie))
              .status,
            200,
          );
          const exported = await request(
            `/${first.id}/export`,
            "GET",
            undefined,
            who.cookie,
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
          assert.deepEqual(
            (workbook.worksheets[0].getRow(2).values as unknown[])
              .slice(1)
              .map(String),
            first.columns.map((c) => c.name),
          );
        }
        const before = await sets.detail(first.id, admin.account.id);
        const emptyPatch = await json<TestSetDto>(
          await request(`/${first.id}`, "PATCH", {}),
        );
        assert.equal(emptyPatch.name, before.name);
        assert.equal(emptyPatch.memo, before.memo);
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
      },
    );
    await t.test(
      "목록은 전체와 내가 만든 필터, 부분 검색과 최근 수정순을 따른다",
      async () => {
        const list = async (query: string, who = editor) =>
          (
            await json<TestSetListDto>(
              await request(query, "GET", undefined, who.cookie),
            )
          ).items;
        assert.deepEqual(
          (await list("?filter=mine")).map((s) => s.id),
          [ownedByEditor.id],
        );
        for (const who of [viewer, editor, allViewer, outsider])
          assert.equal((await list("?filter=all", who)).length, 3);
        for (const filter of ["shared", "owned"])
          assert.equal((await request(`?filter=${filter}`)).status, 400);
        assert.deepEqual(
          (await list("?search=aLpH", viewer)).map((s) => s.id),
          [first.id],
        );
        assert.deepEqual(await list("?search=없는이름"), []);
        const items = await list("");
        assert.equal(items[0].id, first.id);
        assert.equal(items[0].owner.id, admin.account.id);
        assert.equal(items[0].caseCount, 0);
        assert.equal(items[0].reviewCount, 0);
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
      "열 추가와 삭제는 다른 열의 값과 기본 양식을 바꾸지 않음",
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
        await operations.apply(first.id, editor.id, {
          ops: [select, tags, checkbox].map((c, i) => ({
            type: "add_column",
            columnId: c.id,
            column: {
              name: c.name,
              type: c.type,
              description: c.description,
              options: c.options,
              presetKey: c.presetKey,
            },
            afterColumnId:
              i === 0
                ? first.columns[first.columns.length - 1].id
                : [select, tags][i - 1].id,
          })),
        });
        first = await sets.detail(first.id, admin.account.id);
        assert.deepEqual(
          first.columns.map((c) => c.presetKey),
          columns.map((c) => c.presetKey),
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
          [select.id, 3],
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
        const removedId = first.columns[2].id;
        const saved = await operations.apply(first.id, editor.id, {
          ops: [{ type: "remove_column", columnId: removedId }],
        });
        const values = saved.cases.find((c) => c.id === caseA)?.values;
        assert.ok(values);
        assert.equal(values[select.id], "가");
        assert.deepEqual(values[tags.id], ["가", "나"]);
        assert.equal(values[checkbox.id], true);
        assert.equal(removedId in values, false);
        assert.deepEqual(
          await projects.template(p.id, admin.account.id),
          originalTemplate,
        );
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
      "선택 항목은 Excel 목록처럼 바뀌어도 기존 셀 값을 두고 목록 밖 값도 받음",
      async () => {
        await operations.apply(first.id, editor.id, {
          ops: [
            {
              type: "set_cell",
              caseId: caseA,
              columnId: select.id,
              value: "다",
            },
            {
              type: "set_cell",
              caseId: caseA,
              columnId: tags.id,
              value: ["가", "목록 밖"],
            },
          ],
        });
        await operations.apply(first.id, editor.id, {
          ops: [
            {
              type: "update_column",
              columnId: select.id,
              name: select.name,
              description: "",
              options: [" 나 ", "라"],
            },
          ],
        });
        first = await sets.detail(first.id, admin.account.id);
        assert.deepEqual(
          first.columns.find((c) => c.id === select.id)?.options,
          ["나", "라"],
        );
        const values = first.cases.find((c) => c.id === caseA)?.values;
        assert.equal(values?.[select.id], "다");
        assert.deepEqual(values?.[tags.id], ["가", "목록 밖"]);
        // 항목 없이 보내면 항목은 그대로다.
        await operations.apply(first.id, editor.id, {
          ops: [
            {
              type: "update_column",
              columnId: select.id,
              name: "선택 열",
              description: "",
            },
          ],
        });
        assert.deepEqual(
          (await sets.detail(first.id, admin.account.id)).columns.find(
            (c) => c.id === select.id,
          )?.options,
          ["나", "라"],
        );
        const qaResult = first.columns.find((c) => c.presetKey === "qa_result");
        for (const [op, status, code] of [
          [
            {
              type: "update_column",
              columnId: select.id,
              name: "선택 열",
              description: "",
              options: ["나", "나"],
            },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              type: "update_column",
              columnId: select.id,
              name: "선택 열",
              description: "",
              options: [],
            },
            400,
            "VALIDATION_FAILED",
          ],
          ...(qaResult
            ? [
                [
                  {
                    type: "update_column",
                    columnId: qaResult.id,
                    name: qaResult.name,
                    description: qaResult.description,
                    options: ["Pass"],
                  },
                  400,
                  "COLUMN_NOT_EDITABLE",
                ] as const,
              ]
            : []),
        ] as const) {
          const before = await sets.detail(first.id, admin.account.id);
          await error(
            await request(`/${first.id}/ops`, "POST", { ops: [op] }),
            status,
            code,
          );
          assert.deepEqual(
            await sets.detail(first.id, admin.account.id),
            before,
          );
        }
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
          await request(`/${first.id}/ops`, "POST", {
            ops: [{ type: "remove_column", columnId: tags.id }],
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
        await operations.apply(set.id, admin.account.id, {
          ops: [
            ...set.columns
              .filter((c) => !c.systemKey)
              .map((c) => ({ type: "remove_column", columnId: c.id })),
            ...columns.slice(2).map((c, i) => ({
              type: "add_column",
              columnId: c.id,
              column: {
                name: c.name,
                type: c.type,
                description: c.description,
                options: c.options,
                presetKey: c.presetKey,
              },
              afterColumnId: columns[i + 1].id,
            })),
          ],
        });
        const [id, title, tags, auto] = (
          await sets.detail(set.id, admin.account.id)
        ).columns;
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
    await t.test(
      "최근 양식 미리보기는 모든 계정에 같은 정렬과 대체 양식을 쓴다",
      async () => {
        const project = await projects.create(admin.account.id, {
          name: "미리보기 프로젝트",
          description: "",
        });
        const creator = await actor();
        const reader = await actor();
        const preview = (who = creator.cookie, projectId = project.id) =>
          fetch(
            `${base}/api/v1/projects/${projectId}/recent-test-set-template`,
            {
              headers: { Cookie: who },
            },
          );
        const shape = (columns: TestSetColumnDto[]) =>
          columns.map(({ id: _id, ...c }) => c);
        const template = await projects.template(project.id, admin.account.id);
        template.columns[2].enabled = false;
        await projects.saveTemplate(project.id, template);
        const empty = await json<RecentTemplateDto>(await preview());
        assert.equal(empty.testSet, null);
        assert.deepEqual(
          empty.columns,
          template.columns
            .filter((c) => c.enabled)
            .map(({ enabled: _enabled, ...c }) => c),
        );
        const create = async (
          name: string,
          columns?: typeof template.columns,
        ) =>
          json<TestSetDto>(
            await request(
              "",
              "POST",
              {
                name,
                projectId: project.id,
                template: columns
                  ? { kind: "custom", columns }
                  : { kind: "recent" },
              },
              creator.cookie,
            ),
            201,
          );
        const first = await create("첫 세트");
        assert.deepEqual(shape(first.columns), shape(empty.columns));
        const second = await create(
          "두 번째 세트",
          defaultColumns().filter((c) => c.systemKey),
        );
        // 같은 수정 시각이면 ID 오름차순으로 고른다.
        const tied = new Date(Date.now() + 10000);
        for (const set of [first, second])
          await db
            .update(testSets)
            .set({ updatedAt: tied })
            .where(eq(testSets.id, set.id));
        const selected = [first, second].sort((a, b) =>
          a.id.localeCompare(b.id),
        )[0];
        assert.deepEqual(
          (await json<RecentTemplateDto>(await preview())).testSet,
          { id: selected.id, name: selected.name },
        );
        const hidden = await json<TestSetDto>(
          await request("", "POST", {
            name: "다른 사람이 만든 최신 세트",
            projectId: project.id,
          }),
          201,
        );
        await db
          .update(testSets)
          .set({ updatedAt: new Date(tied.getTime() + 10000) })
          .where(eq(testSets.id, hidden.id));
        // 다른 프로젝트의 최신 세트는 제외한다.
        const elsewhere = await sets.create(admin.account.id, {
          name: "다른 프로젝트 최신",
          projectId: otherProject.id,
          memo: "",
        });
        await db
          .update(testSets)
          .set({ updatedAt: new Date(tied.getTime() + 20000) })
          .where(eq(testSets.id, elsewhere.id));
        const result = await json<RecentTemplateDto>(await preview());
        assert.deepEqual(result.testSet, {
          id: hidden.id,
          name: hidden.name,
        });
        assert.deepEqual(result.columns, hidden.columns);
        assert.deepEqual(
          shape((await create("미리보기와 같은 양식")).columns),
          shape(result.columns),
        );
        for (const who of [reader, outsider])
          assert.deepEqual(
            (await json<RecentTemplateDto>(await preview(who.cookie))).testSet,
            { id: hidden.id, name: hidden.name },
          );
        await error(await preview(cookie, randomUUID()), 404, "NOT_FOUND");
        assert.equal((await preview("")).status, 401);
      },
    );
    await t.test(
      "양식 선택은 custom 검증, 최신 세트 사본과 기본 양식 대체를 적용",
      async () => {
        const create = async (template: unknown, who = editor.cookie) =>
          json<TestSetDto>(
            await request(
              "",
              "POST",
              { name: "양식 선택", projectId: p.id, template },
              who,
            ),
            201,
          );
        const picked = defaultColumns().filter(
          (c) => c.systemKey || c.presetKey === "extra",
        );
        const custom = await create({ kind: "custom", columns: picked });
        assert.deepEqual(
          custom.columns.map((c) => c.presetKey),
          ["test_id", "title"],
        );
        assert.ok(
          custom.columns.every(
            (c) => !picked.some((source) => source.id === c.id),
          ),
        );
        const hidden = await create({ kind: "project" }, cookie);
        await db
          .update(testSets)
          .set({ updatedAt: new Date(Date.now() + 10000) })
          .where(eq(testSets.id, hidden.id));
        const recent = await create({ kind: "recent" });
        assert.deepEqual(
          recent.columns.map((c) => c.presetKey),
          hidden.columns.map((c) => c.presetKey),
        );
        assert.ok(
          recent.columns.every(
            (c) => !hidden.columns.some((source) => source.id === c.id),
          ),
        );
        const fresh = await projects.create(admin.account.id, {
          name: "빈 프로젝트",
          description: "",
        });
        const fallback = await json<TestSetDto>(
          await request("", "POST", {
            name: "기본 대체",
            projectId: fresh.id,
            template: { kind: "recent" },
          }),
          201,
        );
        assert.deepEqual(
          fallback.columns.map((c) => c.presetKey),
          defaultColumns()
            .filter((c) => c.enabled)
            .map((c) => c.presetKey),
        );
        for (const template of [
          { kind: "wrong" },
          { kind: "project", columns: picked },
          { kind: "custom" },
          {
            kind: "custom",
            columns: picked.map((c) =>
              c.presetKey === "title" ? { ...c, description: "변조" } : c,
            ),
          },
          {
            kind: "custom",
            columns: [
              ...picked,
              {
                ...picked[0],
                id: randomUUID(),
                systemKey: null,
                presetKey: null,
              },
            ],
          },
        ])
          assert.equal(
            (
              await request("", "POST", {
                name: "검증",
                projectId: p.id,
                template,
              })
            ).status,
            400,
          );
        assert.equal(
          (
            await request(
              `/${custom.id}/columns`,
              "PUT",
              { columns: custom.columns },
              editor.cookie,
            )
          ).status,
          404,
        );
      },
    );
    await t.test(
      "열 연산의 충돌, 순서, 원자성, version과 값 삭제",
      async () => {
        const set = await sets.create(admin.account.id, {
          name: "열 연산",
          projectId: p.id,
          memo: "",
        });
        const id = randomUUID();
        const column = {
          name: "사용자 열",
          type: "text",
          description: "",
          options: [],
          presetKey: null,
        };
        const add = {
          type: "add_column",
          columnId: id,
          column,
          afterColumnId: set.columns[0].id,
        };
        const result = await json<OpsResultDto>(
          await request(`/${set.id}/ops`, "POST", { ops: [add] }),
        );
        assert.equal(result.version, set.version + 1);
        const afterAdd = await sets.detail(set.id, admin.account.id);
        assert.equal(afterAdd.columns[1].id, id);
        const preset = defaultColumns().find((c) => c.presetKey === "extra");
        assert.ok(preset);
        const {
          id: _id,
          enabled: _enabled,
          systemKey: _systemKey,
          ...definition
        } = preset;
        const presetId = randomUUID();
        await operations.apply(set.id, admin.account.id, {
          ops: [
            {
              type: "add_column",
              columnId: presetId,
              column: definition,
              afterColumnId: id,
            },
          ],
        });
        for (const [op, status, code] of [
          [add, 409, "COLUMN_EXISTS"],
          [{ ...add, columnId: randomUUID() }, 400, "VALIDATION_FAILED"],
          [
            {
              ...add,
              columnId: randomUUID(),
              column: {
                name: set.columns[1].name,
                type: set.columns[1].type,
                description: set.columns[1].description,
                options: set.columns[1].options,
                presetKey: set.columns[1].presetKey,
              },
            },
            409,
            "COLUMN_EXISTS",
          ],
          [
            {
              ...add,
              columnId: randomUUID(),
              column: { ...column, name: "새 열" },
              afterColumnId: null,
            },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              ...add,
              columnId: randomUUID(),
              column: { ...definition, presetKey: "test_case", name: "변조" },
            },
            400,
            "VALIDATION_FAILED",
          ],
          [
            { type: "remove_column", columnId: set.columns[0].id },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              type: "remove_column",
              columnId: set.columns.find((c) => c.systemKey === "title")?.id,
            },
            400,
            "VALIDATION_FAILED",
          ],
          [
            {
              type: "reorder_columns",
              columnIds: set.columns.map((c) => c.id),
            },
            409,
            "STALE_ORDER",
          ],
        ] as const) {
          const before = await sets.detail(set.id, admin.account.id);
          await error(
            await request(`/${set.id}/ops`, "POST", {
              ops: [{ type: "remove_column", columnId: presetId }, op],
            }),
            status,
            code,
          );
          assert.deepEqual(await sets.detail(set.id, admin.account.id), before);
        }
        const current = await sets.detail(set.id, admin.account.id);
        const ids = current.columns.map((c) => c.id);
        await error(
          await request(`/${set.id}/ops`, "POST", {
            ops: [{ type: "reorder_columns", columnIds: [...ids].reverse() }],
          }),
          400,
          "VALIDATION_FAILED",
        );
        await error(
          await request(`/${set.id}/ops`, "POST", {
            ops: [
              { type: "reorder_columns", columnIds: ids.map(() => ids[0]) },
            ],
          }),
          409,
          "STALE_ORDER",
        );
        const reordered = [ids[0], ...ids.slice(1).reverse()];
        const reorderedResult = await operations.apply(
          set.id,
          admin.account.id,
          { ops: [{ type: "reorder_columns", columnIds: reordered }] },
        );
        assert.equal(reorderedResult.version, current.version + 1);
        assert.deepEqual(
          (await sets.detail(set.id, admin.account.id)).columns.map(
            (c) => c.id,
          ),
          reordered,
        );
        const caseId = randomUUID();
        await operations.apply(set.id, admin.account.id, {
          ops: [
            {
              type: "add_case",
              caseId,
              afterCaseId: null,
              values: { [id]: "삭제할 값" },
            },
            { type: "remove_column", columnId: id },
          ],
        });
        assert.equal(
          (
            await db
              .select()
              .from(testCaseValues)
              .where(eq(testCaseValues.columnId, id))
          ).length,
          0,
        );
        assert.equal(
          (await sets.detail(set.id, admin.account.id)).cases[0].values[id],
          undefined,
        );
      },
    );
    await t.test("XLSX 2단 묶음과 상위 경계를 따르는 세로 병합", async () => {
      const set = await sets.create(admin.account.id, {
        name: "병합",
        projectId: otherProject.id,
        memo: "",
      });
      const value = (key: string) => {
        const column = set.columns.find((c) => c.presetKey === key);
        assert.ok(column);
        return column.id;
      };
      const caseIds = Array.from({ length: 5 }, () => randomUUID());
      await operations.apply(set.id, admin.account.id, {
        ops: caseIds.map((caseId, i) => ({
          type: "add_case",
          caseId,
          afterCaseId: i ? caseIds[i - 1] : null,
          values: {
            [value("test_env")]: i < 2 ? "W EB" : i < 4 ? "APP" : "",
            [value("test_case")]: "같음",
            [value("title")]: "제목",
            [value("screen_id")]: "화면",
            [value("steps")]: "절차",
            [value("expected")]: "결과",
          },
        })),
      });
      const workbook = new ExcelJS.Workbook();
      const exported = await sets.export(set.id, admin.account.id);
      await workbook.xlsx.load(exported.data as never);
      const sheet = workbook.worksheets[0];
      const merges = sheet.model.merges ?? [];
      assert.ok(merges.includes("I1:J1"));
      assert.ok(merges.includes("L1:M1"));
      for (const letter of ["B", "C", "D", "F", "G"]) {
        assert.ok(merges.includes(`${letter}3:${letter}4`));
        assert.ok(merges.includes(`${letter}5:${letter}6`));
      }
      assert.ok(!merges.some((range) => /^[AH]/.test(range)));
      assert.equal(sheet.getCell("I1").value, "QA 진행");
      assert.equal(sheet.getCell("L1").value, "개발 작업상황");
      // 선택 열은 숨긴 목록 시트를 참조하는 드롭다운을 가진다. 글자 열에는 없다.
      const lists = workbook.getWorksheet("목록");
      assert.ok(lists);
      assert.equal(lists.state, "veryHidden");
      const qa = set.columns.findIndex((c) => c.presetKey === "qa_result");
      const qaColumn = set.columns[qa];
      const listColumn = set.columns
        .filter((c) => c.type === "select" && c.options.length)
        .indexOf(qaColumn);
      const letter = lists.getColumn(listColumn + 1).letter;
      assert.deepEqual(
        qaColumn.options.map(
          (_, row) => lists.getCell(row + 1, listColumn + 1).value,
        ),
        qaColumn.options,
      );
      for (const row of [3, 7])
        assert.deepEqual(sheet.getCell(row, qa + 1).dataValidation, {
          type: "list",
          allowBlank: true,
          formulae: [
            `'목록'!$${letter}$1:$${letter}$${qaColumn.options.length}`,
          ],
        });
      assert.equal(sheet.getCell(3, 1).dataValidation, undefined);
      assert.deepEqual(
        (sheet.getRow(2).values as string[]).slice(1),
        set.columns.map((c) => c.name),
      );
      // 둘 다 남아 있어도 이웃하지 않으면 묶지 않는다.
      const order = [
        set.columns[0],
        ...set.columns
          .slice(1)
          .filter(
            (c) => !["qa_owner", "dev_owner"].includes(c.presetKey ?? ""),
          ),
        ...set.columns.filter((c) =>
          ["qa_owner", "dev_owner"].includes(c.presetKey ?? ""),
        ),
      ];
      await operations.apply(set.id, admin.account.id, {
        ops: [{ type: "reorder_columns", columnIds: order.map((c) => c.id) }],
      });
      const single = new ExcelJS.Workbook();
      await single.xlsx.load(
        (await sets.export(set.id, admin.account.id)).data as never,
      );
      assert.deepEqual(
        (single.worksheets[0].getRow(1).values as string[]).slice(1),
        order.map((c) => c.name),
      );
    });
  } finally {
    await app.close();
    await lease.close();
  }
});
