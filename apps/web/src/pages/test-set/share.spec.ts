import { expect, test, type WebSocketRoute } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  cases,
  columns,
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

const owner = {
  id: "a1",
  name: "최하늘",
  loginId: "haneul.choi@cheddar.app",
  affiliation: "사내",
};
const kim = {
  id: "a2",
  name: "김지은",
  loginId: "jieun.kim@cheddar.app",
  affiliation: "A사",
};
const sharing = (overrides: Record<string, unknown> = {}) => ({
  visibility: "private",
  linkAccess: "view",
  linkToken: null,
  canInvite: true,
  canManageLink: true,
  owner,
  members: [] as unknown[],
  ...overrides,
});
const TOKEN = "a".repeat(43);

test("공개로 바꾸면 링크가 생기고, 사람을 찾아 편집 가능으로 초대한다", async ({
  page,
}) => {
  let state = sharing();
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses(),
    "GET /api/v1/test-sets/t1/sharing": () => state,
    "PATCH /api/v1/test-sets/t1/sharing": (_r: unknown, body: unknown) => {
      state = sharing({ ...(body as object), linkToken: TOKEN });
      return state;
    },
    "GET /api/v1/test-sets/t1/sharing/candidates": [kim],
    "PUT /api/v1/test-sets/t1/members/a2": (_r: unknown, body: unknown) => {
      state = {
        ...state,
        members: [{ person: kim, access: (body as { access: string }).access }],
      };
      return state;
    },
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "공유" }).click();
  const dialog = page.getByRole("dialog", { name: "공유" });
  await expect(dialog.getByText("소유자")).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "공유 링크" })).toHaveCount(
    0,
  );

  await dialog.getByRole("combobox", { name: "공개 범위" }).click();
  await page.getByRole("option", { name: /공개 링크가 있는 누구나/ }).click();
  await expect(dialog.getByRole("textbox", { name: "공유 링크" })).toHaveValue(
    new RegExp(`/s/${TOKEN}$`),
  );
  expect(
    calls.find((c) => c.key === "PATCH /api/v1/test-sets/t1/sharing")?.body,
  ).toEqual({ visibility: "public" });

  await dialog.getByRole("textbox", { name: "초대할 사람" }).fill("김");
  await dialog.getByRole("button", { name: /김지은/ }).click();
  await dialog.getByRole("button", { name: "초대" }).click();
  await expect(
    dialog.getByRole("combobox", { name: "김지은 권한" }),
  ).toContainText("편집 가능");
  expect(
    calls.find((c) => c.key === "PUT /api/v1/test-sets/t1/members/a2")?.body,
  ).toEqual({ access: "edit" });
});

test("링크 새로 만들기는 한 번 묻고 실행한다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses(),
    "GET /api/v1/test-sets/t1/sharing": sharing({
      visibility: "public",
      linkToken: TOKEN,
    }),
    "POST /api/v1/test-sets/t1/sharing/link": sharing({
      visibility: "public",
      linkToken: "b".repeat(43),
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "공유" }).click();
  await page.getByRole("button", { name: "링크 새로 만들기" }).click();
  await page.getByRole("button", { name: "새로 만들기" }).click();
  await expect(page.getByRole("textbox", { name: "공유 링크" })).toHaveValue(
    new RegExp(`/s/${"b".repeat(43)}$`),
  );
  expect(
    calls.some((c) => c.key === "POST /api/v1/test-sets/t1/sharing/link"),
  ).toBe(true);
});

test("초대 권한이 없으면 사람을 찾거나 권한을 바꿀 수 없다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses(),
    "GET /api/v1/test-sets/t1/sharing": sharing({
      canInvite: false,
      canManageLink: false,
      members: [{ person: kim, access: "view" }],
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "공유" }).click();
  const dialog = page.getByRole("dialog", { name: "공유" });
  await expect(
    dialog.getByRole("combobox", { name: "김지은 권한" }),
  ).toBeDisabled();
  await expect(
    dialog.getByRole("textbox", { name: "초대할 사람" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "김지은 제거" })).toHaveCount(
    0,
  );
});

test("볼 권한이 없는 테스트 세트는 소유자 이름과 함께 접근 권한 없음을 보여준다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets/t1": reply(403, {
      error: {
        code: "NO_ACCESS",
        message: "접근 권한이 없습니다.",
        requestId: "t",
        details: { ownerName: "최하늘" },
      },
    }),
  });
  await page.goto("/test-sets/t1");
  await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
  await expect(
    page.getByText("소유자 최하늘에게 초대를 요청하세요."),
  ).toBeVisible();
});

// 실시간 메시지는 ID가 UUID여야 받아들인다
const U = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const columnId = (id: string) => U(100 + columns.findIndex((c) => c.id === id));
const liveSet = {
  ...testSet,
  columns: columns.map((c) => ({ ...c, id: columnId(c.id) })),
  cases: cases.map((k, i) => ({
    ...k,
    id: U(200 + i),
    values: Object.fromEntries(
      Object.entries(k.values).map(([id, v]) => [columnId(id), v]),
    ),
  })),
};

const welcome = (ws: WebSocketRoute) =>
  ws.send(
    JSON.stringify({
      type: "welcome",
      connectionId: "00000000-0000-4000-8000-000000000001",
      me: {
        connectionId: "00000000-0000-4000-8000-000000000001",
        kind: "account",
        id: "00000000-0000-4000-8000-0000000000a1",
        name: "최하늘",
        color: 1,
      },
      peers: [
        {
          connectionId: "00000000-0000-4000-8000-000000000001",
          kind: "account",
          id: "00000000-0000-4000-8000-0000000000a1",
          name: "최하늘",
          color: 1,
        },
        {
          connectionId: "00000000-0000-4000-8000-000000000002",
          kind: "visitor",
          id: "00000000-0000-4000-8000-0000000000b1",
          name: "춤추는 수달",
          color: 3,
        },
      ],
      access: testSet.access,
    }),
  );

test("다른 사람의 연산과 셀 선택이 바로 보인다", async ({ page }) => {
  const caseId = liveSet.cases[0].id;
  const titleId = columnId("c-title");
  let socket: WebSocketRoute | undefined;
  await mockApi(
    page,
    {
      "GET /api/v1/auth/me": me(),
      ...testSetResponses({ "GET /api/v1/test-sets/t1": liveSet }),
    },
    {
      live: (ws) => {
        socket = ws;
        ws.onMessage((message) => {
          if (JSON.parse(String(message)).type === "hello") welcome(ws);
        });
      },
    },
  );
  await page.goto("/test-sets/t1");
  await expect(
    page.getByRole("listitem", { name: "춤추는 수달 (방문자)" }),
  ).toBeVisible();
  socket?.send(
    JSON.stringify({
      type: "ops",
      version: testSet.version + 1,
      ops: [
        { type: "set_cell", caseId, columnId: titleId, value: "수달이 고침" },
      ],
      connectionId: "00000000-0000-4000-8000-000000000002",
      actor: {
        kind: "visitor",
        id: "00000000-0000-4000-8000-0000000000b1",
        name: "춤추는 수달",
      },
    }),
  );
  await expect(page.getByRole("table", { name: "케이스" })).toContainText(
    "수달이 고침",
  );
  socket?.send(
    JSON.stringify({
      type: "selection",
      connectionId: "00000000-0000-4000-8000-000000000002",
      cell: { caseId, columnId: titleId },
    }),
  );
  // 고른 셀에 그 사람 이름표가 붙는다
  await expect(
    page.getByRole("table", { name: "케이스" }).getByText(/춤추는 수달/),
  ).toBeVisible();
});

test("권한을 잃어 연결이 끊기면 화면을 닫는다", async ({ page }) => {
  await mockApi(
    page,
    { "GET /api/v1/auth/me": me(), ...testSetResponses() },
    {
      live: (ws) => {
        ws.onMessage(() => ws.close({ code: 4403, reason: "ACCESS_REVOKED" }));
      },
    },
  );
  await page.goto("/test-sets/t1");
  await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
});

test("비공개로 바꾸기 전에 지금 링크가 사라진다고 한 번 묻는다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses(),
    "GET /api/v1/test-sets/t1/sharing": sharing({
      visibility: "public",
      linkToken: TOKEN,
    }),
    "PATCH /api/v1/test-sets/t1/sharing": sharing(),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "공유" }).click();
  await page.getByRole("combobox", { name: "공개 범위" }).click();
  await page.getByRole("option", { name: /비공개/ }).click();
  const confirm = page.getByRole("dialog", { name: "비공개로 바꾸기" });
  await expect(confirm).toContainText("지금 링크를 사용할 수 없게 되며");
  expect(calls.some((c) => c.key.startsWith("PATCH"))).toBe(false);
  await confirm.getByRole("button", { name: "비공개로 바꾸기" }).click();
  await expect(page.getByRole("textbox", { name: "공유 링크" })).toHaveCount(0);
  expect(
    calls.find((c) => c.key === "PATCH /api/v1/test-sets/t1/sharing")?.body,
  ).toEqual({ visibility: "private" });
});

test("늦게 온 내 저장 응답이 그 뒤 다른 사람이 고친 값을 되돌리지 않는다", async ({
  page,
}) => {
  const first = liveSet.cases[0];
  const titleId = columnId("c-title");
  const expId = columnId("c-exp");
  let socket: WebSocketRoute | undefined;
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mockApi(
    page,
    {
      "GET /api/v1/auth/me": me(),
      ...testSetResponses({
        "GET /api/v1/test-sets/t1": liveSet,
        // 응답은 내 연산이 확정된 순번(2)의 행을 담고, 다른 사람의 연산(3)보다 늦게 온다
        "POST /api/v1/test-sets/t1/ops": async () => {
          await held;
          return {
            version: 2,
            cases: [
              {
                ...first,
                values: { ...first.values, [titleId]: "내가 고친 제목" },
              },
            ],
            deletedCaseIds: [],
          };
        },
      }),
    },
    {
      live: (ws) => {
        socket = ws;
        ws.onMessage((message) => {
          if (JSON.parse(String(message)).type === "hello") welcome(ws);
        });
      },
    },
  );
  await page.goto("/test-sets/t1");
  await expect(
    page.getByRole("listitem", { name: "춤추는 수달 (방문자)" }),
  ).toBeVisible();

  const table = page.getByRole("table", { name: "케이스" });
  await table.getByText(String(first.values[titleId])).click();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "제목" });
  await editor.fill("내가 고친 제목");
  await editor.press("Enter");

  const actor = {
    kind: "visitor",
    id: "00000000-0000-4000-8000-0000000000b1",
    name: "춤추는 수달",
  };
  socket?.send(
    JSON.stringify({
      type: "ops",
      version: 2,
      ops: [
        {
          type: "set_cell",
          caseId: first.id,
          columnId: titleId,
          value: "내가 고친 제목",
        },
      ],
      connectionId: "00000000-0000-4000-8000-000000000001",
      actor: { ...actor, kind: "account", name: "최하늘" },
    }),
  );
  socket?.send(
    JSON.stringify({
      type: "ops",
      version: 3,
      ops: [
        {
          type: "set_cell",
          caseId: first.id,
          columnId: expId,
          value: "수달이 고친 결과",
        },
      ],
      connectionId: "00000000-0000-4000-8000-000000000002",
      actor,
    }),
  );
  await expect(table).toContainText("수달이 고친 결과");
  release();
  await expect(page.getByText("저장됨")).toBeVisible();
  await expect(table).toContainText("수달이 고친 결과");
  await expect(table).toContainText("내가 고친 제목");
});

test("편집하는 동안 다른 사람이 같은 셀을 바꿔도 입력 중인 글자를 덮지 않는다", async ({
  page,
}) => {
  const first = liveSet.cases[0];
  const titleId = columnId("c-title");
  let socket: WebSocketRoute | undefined;
  await mockApi(
    page,
    {
      "GET /api/v1/auth/me": me(),
      ...testSetResponses({ "GET /api/v1/test-sets/t1": liveSet }),
    },
    {
      live: (ws) => {
        socket = ws;
        ws.onMessage((message) => {
          if (JSON.parse(String(message)).type === "hello") welcome(ws);
        });
      },
    },
  );
  await page.goto("/test-sets/t1");
  await expect(
    page.getByRole("listitem", { name: "춤추는 수달 (방문자)" }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "케이스" });
  await table.getByText(String(first.values[titleId])).click();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "제목" });
  await editor.fill("내가 쓰는 중");
  socket?.send(
    JSON.stringify({
      type: "ops",
      version: testSet.version + 1,
      ops: [
        {
          type: "set_cell",
          caseId: first.id,
          columnId: titleId,
          value: "수달이 먼저 고침",
        },
      ],
      connectionId: "00000000-0000-4000-8000-000000000002",
      actor: {
        kind: "visitor",
        id: "00000000-0000-4000-8000-0000000000b1",
        name: "춤추는 수달",
      },
    }),
  );
  await page.waitForTimeout(300);
  await expect(editor).toHaveValue("내가 쓰는 중");
});
