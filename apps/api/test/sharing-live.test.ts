import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  isClientMessage,
  isServerMessage,
  type ServerMessage,
} from "@cheddar/contracts";
import { and, eq } from "drizzle-orm";
import { WebSocket } from "ws";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import type {
  SharedTestSetDto,
  SharingDto,
} from "../src/contracts/sharing.dto";
import type {
  OpsResultDto,
  TestSetDto,
  TestSetViewDto,
} from "../src/contracts/test-set.dto";
import {
  accounts as accountRows,
  generationJobs,
  reviewItems,
  sessions,
  testCases,
  testSets,
  visitorSessions,
} from "../src/database/schema";
import { StageRunner } from "../src/generation/stage-runner";
import type { GenerationInput } from "../src/generation/types";
import { LiveEvents } from "../src/live/live-events";
import { ProjectsService } from "../src/projects/projects.service";
import { VISITOR_COOKIE } from "../src/sharing/shared.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { openTestDatabase } from "./database";

type Message<T extends ServerMessage["type"]> = Extract<
  ServerMessage,
  { type: T }
>;
function live(url: string, cookie: string, origin = "http://127.0.0.1:5173") {
  const ws = new WebSocket(url, {
    headers: { Cookie: cookie, Origin: origin },
  });
  const pending: {
    type: string;
    accept: (message: ServerMessage) => boolean;
    resolve: (message: ServerMessage) => void;
  }[] = [];
  const messages: ServerMessage[] = [];
  ws.on("error", () => {});
  ws.on("message", (data) => {
    const message: unknown = JSON.parse(data.toString());
    assert.ok(isServerMessage(message), JSON.stringify(message));
    const index = pending.findIndex(
      (p) => p.type === message.type && p.accept(message),
    );
    if (index >= 0) pending.splice(index, 1)[0].resolve(message);
    else messages.push(message);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.once("close", (code, reason) =>
      resolve({ code, reason: reason.toString() }),
    ),
  );
  const next = <T extends ServerMessage["type"]>(
    type: T,
    accept: (message: Message<T>) => boolean = () => true,
  ): Promise<Message<T>> => {
    const index = messages.findIndex(
      (m) => m.type === type && accept(m as Message<T>),
    );
    if (index >= 0)
      return Promise.resolve(messages.splice(index, 1)[0] as Message<T>);
    return new Promise<Message<T>>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`메시지 시간 초과: ${type}`)),
        5000,
      );
      timer.unref();
      pending.push({
        type,
        accept: (m) => accept(m as Message<T>),
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message as Message<T>);
        },
      });
    });
  };
  return { ws, next, closed, messages };
}
async function refused(
  url: string,
  cookie = "",
  origin = "http://127.0.0.1:5173",
) {
  const ws = new WebSocket(url, {
    headers: { Cookie: cookie, Origin: origin },
  });
  ws.on("error", () => {});
  return new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("연결 거부 시간 초과"));
    }, 5000);
    ws.once("unexpected-response", (_req, res) => {
      clearTimeout(timer);
      res.resume();
      ws.terminate();
      resolve(res.statusCode ?? 0);
    });
    ws.once("open", () => {
      clearTimeout(timer);
      ws.terminate();
      reject(new Error("연결이 허용됨"));
    });
  });
}

test("공동 편집 메시지 판별 함수는 알 수 없는 종류와 잘못된 본문을 거부", () => {
  assert.ok(isClientMessage({ type: "hello", version: 0 }));
  assert.ok(isClientMessage({ type: "select", cell: null }));
  for (const bad of [
    null,
    [],
    { type: "hello", version: -1 },
    { type: "hello", version: 0.5 },
    { type: "select", cell: {} },
    { type: "ops", ops: [] },
  ])
    assert.equal(isClientMessage(bad), false);
  assert.equal(
    isServerMessage({ type: "access", access: { canEdit: true } }),
    false,
  );
  assert.equal(
    isServerMessage({ type: "ops", version: 1, ops: [{ type: "drop" }] }),
    false,
  );
});

test("실제 PostgreSQL에서 공유, 링크 방문자와 WebSocket 공동 편집", {
  timeout: 120000,
}, async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(
    { ...lease.config, workersEnabled: false },
    lease.folder,
  );
  const sockets: ReturnType<typeof live>[] = [];
  try {
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`,
      wsBase = base.replace(/^http/, "ws"),
      db = lease.database.db;
    const auth = app.get(AuthService),
      accounts = app.get(AccountsService),
      authorization = app.get(AuthorizationService),
      sets = app.get(TestSetsService),
      projects = app.get(ProjectsService);
    const admin = await createFirstAdministrator(
      authorization,
      accounts,
      "sharing-admin@example.com",
      "공유 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "공동편집-비밀번호-12345";
    await accounts.resetPassword(admin.account.id, password);
    const adminCookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.loginId, password)).token}`;
    const project = await projects.create(admin.account.id, {
      name: "공동 편집",
      description: "",
    });
    const set = await sets.create(admin.account.id, {
      projectId: project.id,
      name: "공유 테스트",
      memo: "",
    });
    const actor = async () => {
      const result = await accounts.create({
        name: "구성원",
        loginId: `${randomUUID()}@example.com`,
        role: "member",
        password,
      });
      lease.accountIds.push(result.id);
      return {
        id: result.id,
        loginId: result.loginId,
        cookie: `${SESSION_COOKIE}=${(await auth.login(result.loginId, password)).token}`,
      };
    };
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = adminCookie,
      connectionId?: string,
    ) =>
      fetch(`${base}${path}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(connectionId ? { "x-cheddar-connection": connectionId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return response.json() as Promise<T>;
    };
    const error = async (response: Response, status: number, code: string) => {
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        code,
      );
    };
    const sharing = `/test-sets/${set.id}/sharing`,
      members = `/test-sets/${set.id}/members`;
    const connect = (path: string, cookie = adminCookie) => {
      const c = live(`${wsBase}${path}`, cookie);
      sockets.push(c);
      return c;
    };
    const edit = await actor(),
      linkOnly = await actor(),
      outsider = await actor(),
      candidate = await actor();
    let state!: SharingDto,
      token!: string,
      visitorCookie!: string,
      visitor!: SharedTestSetDto;
    await t.test(
      "모든 활성 계정은 링크를 설정하고 삭제한 사람 공유 API는 404",
      async () => {
        for (const who of [edit, linkOnly, outsider]) {
          state = await json<SharingDto>(
            await request(sharing, "GET", undefined, who.cookie),
          );
          assert.deepEqual(state, {
            visibility: "private",
            linkPermission: "view",
            linkToken: null,
          });
          assert.equal(
            (
              await request(
                sharing,
                "PATCH",
                { linkPermission: "view" },
                who.cookie,
              )
            ).status,
            200,
          );
        }
        for (const [path, method, body] of [
          [`${sharing}/candidates`, "GET", undefined],
          [`${members}/${candidate.id}`, "PUT", { access: "edit" }],
          [`${members}/${candidate.id}`, "DELETE", undefined],
        ] as const)
          assert.equal((await request(path, method, body)).status, 404);
        const rotated = await json<SharingDto>(
          await request(`${sharing}/link`, "POST"),
          201,
        );
        assert.equal(rotated.visibility, "private");
        assert.equal(rotated.linkToken, null);
        const detail = await json<TestSetDto>(
          await request(
            `/test-sets/${set.id}`,
            "GET",
            undefined,
            outsider.cookie,
          ),
        );
        assert.deepEqual(detail.access, {
          canEdit: true,
          canRename: true,
          canDelete: false,
          canExport: true,
        });
        assert.equal(
          (
            await request(
              `/test-sets/${set.id}/view`,
              "GET",
              undefined,
              outsider.cookie,
            )
          ).status,
          200,
        );
        await error(
          await request(
            `/test-sets/${randomUUID()}`,
            "GET",
            undefined,
            outsider.cookie,
          ),
          404,
          "NOT_FOUND",
        );
      },
    );
    await t.test(
      "공개 전환은 256비트 토큰을 만들고 공유 창이 원문을 다시 읽음",
      async () => {
        state = await json<SharingDto>(
          await request(
            sharing,
            "PATCH",
            { visibility: "public" },
            linkOnly.cookie,
          ),
        );
        token = state.linkToken ?? "";
        assert.match(token, /^[\w-]{43}$/);
        assert.equal(
          (
            await json<SharingDto>(
              await request(sharing, "GET", undefined, edit.cookie),
            )
          ).linkToken,
          token,
        );
        const response = await request(
          `/shared/${token}`,
          "GET",
          undefined,
          "",
        );
        const setCookie = response.headers.get("set-cookie") ?? "";
        assert.match(setCookie, /HttpOnly/i);
        assert.match(setCookie, /SameSite=Lax/i);
        assert.match(setCookie, /Path=\//i);
        assert.match(setCookie, /Max-Age=31536000/i);
        visitorCookie = setCookie.split(";")[0];
        assert.match(
          visitorCookie,
          new RegExp(`^${VISITOR_COOKIE}=[\\w-]{43}$`),
        );
        visitor = await json<SharedTestSetDto>(response);
        assert.equal(visitor.me.kind, "visitor");
        assert.equal(visitor.access.canEdit, false);
        assert.equal(visitor.owner.name, "공유 관리자");
      },
    );
    await t.test(
      "같은 쿠키는 같은 이름, 동시 방문자와 같은 브라우저의 세트별 이름은 충돌 없음",
      async () => {
        const again = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.deepEqual(again.me, visitor.me);
        const people = await Promise.all(
          Array.from({ length: 8 }, async () =>
            json<SharedTestSetDto>(
              await request(`/shared/${token}`, "GET", undefined, ""),
            ),
          ),
        );
        assert.equal(
          new Set([visitor.me.name, ...people.map((p) => p.me.name)]).size,
          9,
        );
        const same = await Promise.all(
          Array.from({ length: 4 }, async () =>
            json<SharedTestSetDto>(
              await request(
                `/shared/${token}`,
                "GET",
                undefined,
                visitorCookie,
              ),
            ),
          ),
        );
        assert.ok(same.every((p) => p.me.id === visitor.me.id));
      },
    );
    await t.test(
      "보기 링크는 연산을 거부하고 편집 링크는 방문자 이름과 null 작성자로 저장",
      async () => {
        const input = {
          ops: [
            {
              type: "add_case",
              caseId: randomUUID(),
              afterCaseId: null,
              values: { [set.columns[1].id]: "방문자 케이스" },
            },
          ],
        };
        await error(
          await request(`/shared/${token}/ops`, "POST", input, visitorCookie),
          403,
          "FORBIDDEN",
        );
        await json(await request(sharing, "PATCH", { linkPermission: "edit" }));
        await json(
          await request(`/shared/${token}/ops`, "POST", input, visitorCookie),
        );
        const [saved] = await db
          .select()
          .from(testCases)
          .where(eq(testCases.id, input.ops[0].caseId));
        assert.equal(saved.createdBy, null);
        assert.equal(saved.authorName, visitor.me.name);
        const detail = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.deepEqual(detail.access, {
          canEdit: true,
          canRename: false,
          canDelete: false,
          canExport: true,
        });
        // 편집 링크여도 열 연산(항목 변경 포함)은 계정만 한다
        const custom = detail.columns[1];
        for (const op of [
          {
            type: "update_column",
            columnId: custom.id,
            name: custom.name,
            description: custom.description,
          },
          { type: "remove_column", columnId: custom.id },
          {
            type: "reorder_columns",
            columnIds: detail.columns.map((c) => c.id),
          },
          {
            type: "add_column",
            columnId: randomUUID(),
            column: {
              name: "방문자 열",
              type: "select",
              description: "",
              options: ["가"],
              presetKey: null,
            },
            afterColumnId: detail.columns[0].id,
          },
        ]) {
          await error(
            await request(
              `/shared/${token}/ops`,
              "POST",
              { ops: [op] },
              visitorCookie,
            ),
            403,
            "FORBIDDEN",
          );
          assert.deepEqual(
            await json<SharedTestSetDto>(
              await request(
                `/shared/${token}`,
                "GET",
                undefined,
                visitorCookie,
              ),
            ).then((d) => [d.version, d.columns]),
            [detail.version, detail.columns],
          );
        }
        for (const [suffix, method, body] of [
          ["", "PATCH", { name: "방문자 변경" }],
          ["", "DELETE", undefined],
          ["/sharing", "PATCH", { visibility: "private" }],
          ["/generations", "POST", { kind: "append", memo: "변경" }],
        ] as const)
          await error(
            await request(
              `/shared/${token}${suffix}`,
              method,
              body,
              visitorCookie,
            ),
            404,
            "NOT_FOUND",
          );
      },
    );
    await t.test(
      "방문자는 셀 변경·케이스 추가·삭제만 하고 행 이동은 원자적으로 거부",
      async () => {
        const one = randomUUID(),
          two = randomUUID();
        await json(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [
                { type: "add_case", caseId: one, afterCaseId: null },
                { type: "add_case", caseId: two, afterCaseId: one },
              ],
            },
            visitorCookie,
          ),
        );
        const beforeMove = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        await error(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [
                {
                  type: "set_cell",
                  caseId: one,
                  columnId: set.columns[1].id,
                  value: "거부 시 보존",
                },
                { type: "move_case", caseId: two, afterCaseId: null },
              ],
            },
            visitorCookie,
          ),
          403,
          "FORBIDDEN",
        );
        assert.deepEqual(
          await json<SharedTestSetDto>(
            await request(`/shared/${token}`, "GET", undefined, visitorCookie),
          ),
          beforeMove,
        );
        await json(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [
                {
                  type: "set_cell",
                  caseId: one,
                  columnId: set.columns[1].id,
                  value: "방문자 수정",
                },
                { type: "delete_cases", caseIds: [one] },
              ],
            },
            visitorCookie,
          ),
        );
        const before = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.equal(before.cases[0].id, two);
        assert.ok(!before.cases.some((c) => c.id === one));
        await error(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [
                {
                  type: "set_cell",
                  caseId: two,
                  columnId: set.columns[1].id,
                  value: "취소됨",
                },
                {
                  type: "set_cell",
                  caseId: randomUUID(),
                  columnId: set.columns[1].id,
                  value: "오류",
                },
              ],
            },
            visitorCookie,
          ),
          404,
          "NOT_FOUND",
        );
        assert.deepEqual(
          await json(
            await request(`/shared/${token}`, "GET", undefined, visitorCookie),
          ),
          before,
        );
      },
    );
    await t.test(
      "방문자 보기 설정은 사람별로 저장하며 내보내기는 항상 허용",
      async () => {
        const select = set.columns.find((column) => column.type === "select");
        assert.ok(select);
        const view: TestSetViewDto = {
          view: "canvas",
          canvasGroup: "column",
          canvasDensity: "brief",
          groupByColumnId: select.id,
          columnWidths: { [set.columns[1].id]: 150 },
          rowHeights: {},
        };
        await json(
          await request(`/shared/${token}/view`, "PUT", view, visitorCookie),
        );
        assert.deepEqual(
          await json(
            await request(
              `/shared/${token}/view`,
              "GET",
              undefined,
              visitorCookie,
            ),
          ),
          view,
        );
        assert.equal(
          (
            await json<TestSetViewDto>(
              await request(`/shared/${token}/view`, "GET", undefined, ""),
            )
          ).view,
          "table",
        );
        assert.equal(
          (
            await request(
              `/shared/${token}/export`,
              "GET",
              undefined,
              visitorCookie,
            )
          ).status,
          200,
        );
        for (const cookie of [visitorCookie, outsider.cookie, adminCookie])
          assert.equal(
            (await request(`/shared/${token}/export`, "GET", undefined, cookie))
              .status,
            200,
          );
      },
    );
    await t.test(
      "로그인 계정은 계정 이름과 편집 권한을 받으며 계정별 보기 설정을 공유",
      async () => {
        const account = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, outsider.cookie),
        );
        assert.equal(account.me.kind, "account");
        assert.equal(account.me.id, outsider.id);
        assert.equal(account.access.canEdit, true);
        assert.equal(account.access.canRename, true);
        await json(await request(sharing, "PATCH", { linkPermission: "view" }));
        assert.equal(
          (
            await json<SharedTestSetDto>(
              await request(`/shared/${token}`, "GET", undefined, edit.cookie),
            )
          ).access.canEdit,
          true,
        );
        assert.equal(
          (
            await json<SharedTestSetDto>(
              await request(
                `/shared/${token}`,
                "GET",
                undefined,
                outsider.cookie,
              ),
            )
          ).access.canEdit,
          true,
        );
        const view: TestSetViewDto = {
          view: "canvas",
          canvasGroup: "feature",
          canvasDensity: "brief",
          groupByColumnId: null,
          columnWidths: {},
          rowHeights: {},
        };
        await json(
          await request(`/shared/${token}/view`, "PUT", view, edit.cookie),
        );
        assert.deepEqual(
          await json(
            await request(
              `/test-sets/${set.id}/view`,
              "GET",
              undefined,
              edit.cookie,
            ),
          ),
          view,
        );
      },
    );
    await t.test(
      "WebSocket은 Origin과 세션·세트 접근·링크 토큰을 검사",
      async () => {
        const path = `/test-sets/${set.id}/live`;
        assert.equal(
          await refused(
            `${wsBase}${path}`,
            adminCookie,
            "https://other.example",
          ),
          403,
        );
        assert.equal(await refused(`${wsBase}${path}`, ""), 403);
        const member = connect(path, outsider.cookie);
        assert.equal((await member.next("welcome")).access.canEdit, true);
        member.ws.close();
        await member.closed;
        assert.equal(
          await refused(
            `${wsBase}/test-sets/${randomUUID()}/live`,
            outsider.cookie,
          ),
          403,
        );
        assert.equal(
          await refused(
            `${wsBase}/shared/${"x".repeat(43)}/live`,
            visitorCookie,
          ),
          403,
        );
      },
    );
    await t.test(
      "연산은 커밋 뒤 connectionId·서버 번호와 함께 모든 연결에 전파하고 hello로 복구",
      async () => {
        const readOnlyCase = (await sets.detail(set.id, admin.account.id))
          .cases[0];
        await error(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [
                {
                  type: "set_feature_group",
                  caseId: readOnlyCase.id,
                  featureGroupId: null,
                },
              ],
            },
            visitorCookie,
          ),
          403,
          "FORBIDDEN",
        );
        await json(await request(sharing, "PATCH", { linkPermission: "edit" }));
        const first = connect(`/test-sets/${set.id}/live`),
          second = connect(`/shared/${token}/live`, visitorCookie);
        const welcome = await first.next("welcome"),
          other = await second.next("welcome");
        assert.notEqual(welcome.me.color, other.me.color);
        assert.equal(other.me.kind, "visitor");
        const before = await sets.detail(set.id, admin.account.id);
        first.ws.send(
          JSON.stringify({ type: "hello", version: before.version }),
        );
        second.ws.send(
          JSON.stringify({ type: "hello", version: before.version }),
        );
        const caseId = randomUUID();
        const response = await json<{ version: number }>(
          await request(
            `/test-sets/${set.id}/ops`,
            "POST",
            { ops: [{ type: "add_case", caseId, afterCaseId: null }] },
            adminCookie,
            welcome.connectionId,
          ),
        );
        const op = await first.next("ops"),
          mirrored = await second.next("ops");
        assert.deepEqual(op, mirrored);
        assert.equal(op.connectionId, welcome.connectionId);
        assert.equal(op.version, response.version);
        assert.equal(op.actor.id, admin.account.id);
        assert.equal(op.ops[0].type, "add_case");
        if (op.ops[0].type === "add_case")
          assert.ok(op.ops[0].values?.[set.columns[0].id]);
        const saved = await db
          .select()
          .from(testCases)
          .where(eq(testCases.id, caseId));
        assert.equal(saved.length, 1);
        second.ws.send(
          JSON.stringify({ type: "hello", version: before.version }),
        );
        assert.equal((await second.next("ops")).version, response.version);
        const group = await projects.saveGroup(project.id, {
          name: "실시간 그룹",
          description: "",
        });
        const groupResync = await first.next("resync");
        assert.equal(groupResync.version, response.version + 1);
        assert.deepEqual(groupResync, await second.next("resync"));
        const groupOp = {
          type: "set_feature_group",
          caseId,
          featureGroupId: group.id,
        };
        const grouped = await json<OpsResultDto>(
          await request(
            `/shared/${token}/ops`,
            "POST",
            { ops: [groupOp] },
            visitorCookie,
          ),
        );
        assert.equal(grouped.version, groupResync.version + 1);
        assert.equal(grouped.cases[0].featureGroupId, group.id);
        const groupEvent = await first.next("ops");
        assert.deepEqual(groupEvent, await second.next("ops"));
        assert.deepEqual(groupEvent.ops, [groupOp]);
        assert.equal(groupEvent.actor.kind, "visitor");
        second.ws.send(
          JSON.stringify({ type: "hello", version: groupResync.version }),
        );
        assert.deepEqual((await second.next("ops")).ops, [groupOp]);
        const childId = randomUUID();
        await json(
          await request(
            `/shared/${token}/ops`,
            "POST",
            {
              ops: [{ type: "add_case", caseId: childId, afterCaseId: caseId }],
            },
            visitorCookie,
          ),
        );
        const inherited = (await first.next("ops")).ops[0];
        assert.equal(inherited.type, "add_case");
        if (inherited.type === "add_case")
          assert.equal(inherited.featureGroupId, group.id);
        await second.next("ops");
        const sharedGroups = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.ok(
          sharedGroups.featureGroups.some(
            (g) => g.id === group.id && g.name === group.name,
          ),
        );
        assert.equal(
          sharedGroups.cases.find((c) => c.id === childId)?.featureGroupId,
          group.id,
        );
        second.ws.send(
          JSON.stringify({
            type: "select",
            cell: { caseId, columnId: set.columns[1].id },
          }),
        );
        assert.equal(
          (await first.next("selection")).connectionId,
          other.connectionId,
        );
        await json(
          await request(`/test-sets/${set.id}`, "PATCH", { memo: "다시 읽기" }),
        );
        const resync = await first.next("resync");
        assert.ok(resync.version > response.version);
        assert.equal(
          (await sets.detail(set.id, admin.account.id)).cases.find(
            (c) => c.id === caseId,
          )?.featureGroupId,
          group.id,
        );
        second.ws.send(JSON.stringify({ type: "hello", version: 0 }));
        assert.equal(
          (await second.next("resync", (m) => m.version === resync.version))
            .version,
          resync.version,
        );
      },
    );
    await t.test(
      "열 연산은 커밋 뒤 ops로 전파하고 AI 결과·확인 필요 추가는 resync로 다시 읽게 함",
      async () => {
        const c = connect(`/test-sets/${set.id}/live`);
        await c.next("welcome");
        const before = await sets.detail(set.id, admin.account.id);
        const columns = [
          before.columns[0],
          ...before.columns.slice(1).reverse(),
        ];
        const saved = await json<{ version: number }>(
          await request(`/test-sets/${set.id}/ops`, "POST", {
            ops: [
              { type: "reorder_columns", columnIds: columns.map((c) => c.id) },
            ],
          }),
        );
        const broadcast = await c.next("ops");
        assert.equal(broadcast.version, saved.version);
        assert.deepEqual(broadcast.ops, [
          { type: "reorder_columns", columnIds: columns.map((c) => c.id) },
        ]);
        const addedColumnId = randomUUID();
        for (const op of [
          {
            type: "add_column",
            columnId: addedColumnId,
            column: {
              name: "전파 확인",
              type: "text",
              description: "",
              options: [],
              colors: {},
              presetKey: null,
            },
            afterColumnId: columns[0].id,
          },
          { type: "remove_column", columnId: addedColumnId },
        ]) {
          const response = await json<{ version: number }>(
            await request(`/test-sets/${set.id}/ops`, "POST", { ops: [op] }),
          );
          const event = await c.next("ops");
          assert.equal(event.version, response.version);
          assert.deepEqual(event.ops, [op]);
        }
        const [job] = await db
          .insert(generationJobs)
          .values({
            testSetId: set.id,
            requestedBy: admin.account.id,
            kind: "append",
            status: "running",
          })
          .returning();
        const input: GenerationInput = {
          columns,
          memo: "",
          frames: [],
          featureGroups: [],
          viewpoints: [],
          screenStructure: [],
          styleExamples: [],
          existingCases: [],
        };
        const draft = { [set.columns[1].id]: "공동 편집 생성 결과" };
        await app.get(StageRunner).finish(job, input, {
          cases: [draft],
          reviews: [
            {
              reason: "결과 확인",
              question: "예상 결과는 무엇인가요?",
              screenDescription: "화면 설명",
              draft,
            },
          ],
          coverage: [],
          mergedCount: 0,
        });
        const generated = await c.next("resync");
        assert.ok(generated.version > saved.version);
        const detail = await sets.detail(set.id, admin.account.id);
        assert.ok(
          detail.cases.some(
            (item) =>
              item.values[set.columns[1].id] === draft[set.columns[1].id],
          ),
        );
        const [review] = await db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.testSetId, set.id));
        await json(
          await request(`/review-items/${review.id}`, "PATCH", {
            answer: "답변",
          }),
        );
        const patched = await c.next("resync");
        assert.ok(patched.version > generated.version);
        const accepted = await json<{ version: number }>(
          await request(`/review-items/${review.id}/accept`, "POST", { draft }),
        );
        assert.equal((await c.next("resync")).version, accepted.version);
      },
    );
    await t.test(
      "재연결은 최근 500묶음을 복구하고 보관 범위를 벗어난 버전은 resync",
      async () => {
        const before = await sets.detail(set.id, admin.account.id);
        const caseId = before.cases[0].id;
        for (let index = 0; index < 501; index++)
          await json(
            await request(`/test-sets/${set.id}/ops`, "POST", {
              ops: [
                {
                  type: "set_cell",
                  caseId,
                  columnId: set.columns[1].id,
                  value: `연결 복구 ${index}`,
                },
              ],
            }),
          );
        const c = connect(`/test-sets/${set.id}/live`);
        await c.next("welcome");
        c.ws.send(JSON.stringify({ type: "hello", version: before.version }));
        assert.equal((await c.next("resync")).version, before.version + 501);
        c.ws.send(
          JSON.stringify({ type: "hello", version: before.version + 1 }),
        );
        for (let index = 2; index <= 501; index++)
          assert.equal((await c.next("ops")).version, before.version + index);
      },
    );
    await t.test(
      "관리자 등급 변경은 열린 연결의 삭제 권한에 반영한다",
      async () => {
        const person = await actor();
        const c = connect(`/test-sets/${set.id}/live`, person.cookie);
        assert.equal((await c.next("welcome")).access.canDelete, false);
        await accounts.update(person.id, { role: "admin" });
        assert.equal((await c.next("access")).access.canDelete, true);
        await accounts.update(person.id, { role: "member" });
        assert.equal((await c.next("access")).access.canDelete, false);
        assert.equal(c.ws.readyState, WebSocket.OPEN);
        c.ws.close();
        await c.closed;
      },
    );
    await t.test(
      "링크 편집→보기는 방문자에게 access를 보내고 계정의 높은 권한은 보존",
      async () => {
        await json(await request(sharing, "PATCH", { linkPermission: "edit" }));
        const visitor = connect(`/shared/${token}/live`, visitorCookie),
          owner = connect(`/shared/${token}/live`, adminCookie);
        await visitor.next("welcome");
        await owner.next("welcome");
        await json(await request(sharing, "PATCH", { linkPermission: "view" }));
        assert.equal((await visitor.next("access")).access.canEdit, false);
        assert.equal(visitor.ws.readyState, WebSocket.OPEN);
        assert.ok(
          !owner.messages.some((m) => m.type === "access" && !m.access.canEdit),
        );
      },
    );
    await t.test("같은 계정의 탭별 Peer와 이름 변경·퇴장 알림", async () => {
      const first = connect(`/test-sets/${set.id}/live`),
        second = connect(`/test-sets/${set.id}/live`);
      const a = await first.next("welcome"),
        b = await second.next("welcome");
      assert.equal(a.me.id, b.me.id);
      assert.notEqual(a.connectionId, b.connectionId);
      assert.notEqual(a.me.color, b.me.color);
      await accounts.update(admin.account.id, { name: "이름 바꾼 관리자" });
      const changed = await first.next("peers", (m) =>
        m.peers.some(
          (p) =>
            p.connectionId === b.connectionId && p.name === "이름 바꾼 관리자",
        ),
      );
      assert.ok(changed.peers.some((p) => p.connectionId === a.connectionId));
      second.ws.close();
      await second.closed;
      await first.next(
        "peers",
        (m) => !m.peers.some((p) => p.connectionId === b.connectionId),
      );
    });
    await t.test(
      "링크 새로 만들기는 링크 연결을 닫고 이전 토큰·방문자 세션·보기를 폐기",
      async () => {
        const c = connect(`/shared/${token}/live`, visitorCookie);
        await c.next("welcome");
        const old = token;
        state = await json<SharingDto>(
          await request(`${sharing}/link`, "POST"),
          201,
        );
        token = state.linkToken ?? "";
        assert.notEqual(token, old);
        assert.deepEqual(await c.closed, {
          code: 4403,
          reason: "LINK_REPLACED",
        });
        await error(
          await request(`/shared/${old}`, "GET", undefined, visitorCookie),
          404,
          "LINK_NOT_FOUND",
        );
        assert.equal(
          (
            await db
              .select()
              .from(visitorSessions)
              .where(eq(visitorSessions.testSetId, set.id))
          ).length,
          0,
        );
        const fresh = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.notEqual(fresh.me.id, visitor.me.id);
        assert.equal(
          (
            await json<TestSetViewDto>(
              await request(
                `/shared/${token}/view`,
                "GET",
                undefined,
                visitorCookie,
              ),
            )
          ).view,
          "table",
        );
      },
    );
    await t.test(
      "비공개 전환은 계정도 링크로 들어온 연결이면 종료하고 다시 공개해도 세션은 새로 발급",
      async () => {
        const guest = connect(`/shared/${token}/live`, visitorCookie),
          account = connect(`/shared/${token}/live`, adminCookie);
        await guest.next("welcome");
        await account.next("welcome");
        const previous = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        const old = token;
        state = await json<SharingDto>(
          await request(sharing, "PATCH", { visibility: "private" }),
        );
        assert.equal((await guest.closed).code, 4403);
        assert.equal((await account.closed).code, 4403);
        assert.equal(state.linkToken, null);
        await error(
          await request(`/shared/${old}`, "GET", undefined, visitorCookie),
          404,
          "LINK_NOT_FOUND",
        );
        state = await json<SharingDto>(
          await request(sharing, "PATCH", { visibility: "public" }),
        );
        token = state.linkToken ?? "";
        const fresh = await json<SharedTestSetDto>(
          await request(`/shared/${token}`, "GET", undefined, visitorCookie),
        );
        assert.notEqual(fresh.me.id, previous.me.id);
      },
    );
    await t.test(
      "비활성화와 관리자 비밀번호 변경은 열린 연결을 끊는다",
      async () => {
        for (const change of ["deactivate", "password"]) {
          const person = await actor();
          const c = connect(`/test-sets/${set.id}/live`, person.cookie);
          await c.next("welcome");
          if (change === "deactivate")
            await accounts.setActive(person.id, false);
          else await accounts.resetPassword(person.id, `${password}-새로`);
          const closed = await c.closed;
          assert.equal(closed.code, 4403);
          assert.equal(closed.reason, "SESSION_EXPIRED");
        }
      },
    );
    await t.test("내 비밀번호 변경은 다른 세션 연결만 끊는다", async () => {
      const person = await actor();
      const otherCookie = `${SESSION_COOKIE}=${(await auth.login(person.loginId, password)).token}`;
      const current = connect(`/test-sets/${set.id}/live`, person.cookie),
        other = connect(`/test-sets/${set.id}/live`, otherCookie);
      await current.next("welcome");
      await other.next("welcome");
      assert.equal(
        (
          await request(
            "/auth/password",
            "POST",
            { currentPassword: password, newPassword: `${password}-새로` },
            person.cookie,
          )
        ).status,
        204,
      );
      assert.equal((await other.closed).code, 4403);
      assert.equal(current.ws.readyState, WebSocket.OPEN);
      current.ws.send(
        JSON.stringify({
          type: "hello",
          version: (await sets.detail(set.id, person.id)).version,
        }),
      );
      current.ws.close();
      await current.closed;
    });
    await t.test("세션 만료를 재검사하고 세트 삭제는 4404로 종료", async () => {
      const expired = connect(`/test-sets/${set.id}/live`, outsider.cookie);
      await expired.next("welcome");
      await db
        .update(sessions)
        .set({ expiresAt: new Date(0) })
        .where(eq(sessions.accountId, outsider.id));
      await app.get(LiveEvents).publish({ type: "identity" });
      assert.deepEqual(await expired.closed, {
        code: 4403,
        reason: "SESSION_EXPIRED",
      });
      const c = connect(`/test-sets/${set.id}/live`);
      await c.next("welcome");
      await sets.remove(set.id, admin.account.id);
      assert.equal((await c.closed).code, 4404);
      assert.equal(
        (await db.select().from(testSets).where(eq(testSets.id, set.id)))
          .length,
        0,
      );
    });
    // 아래 확인은 테스트 데이터 정리 전에 연결이 모두 닫힌 상태임을 보장한다.
    assert.ok(sockets.every((c) => c.ws.readyState !== WebSocket.OPEN));
    assert.equal(
      (
        await db
          .select()
          .from(visitorSessions)
          .where(and(eq(visitorSessions.testSetId, set.id)))
      ).length,
      0,
    );
    assert.equal(
      (
        await db
          .select()
          .from(accountRows)
          .where(eq(accountRows.id, admin.account.id))
      ).length,
      1,
    );
  } finally {
    for (const c of sockets) c.ws.terminate();
    await app.close();
    await lease.close();
  }
});
