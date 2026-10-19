import { expect, type Page, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  cases,
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

type Op = { type: string; [key: string]: unknown };

/** 받은 연산을 그대로 반영했다고 답한다. 새 케이스에는 다음 번호를 붙인다. */
function opsHandler() {
  let next = 3;
  return (_route: unknown, body: unknown) => {
    const ops = (body as { ops: Op[] }).ops;
    const changed = ops
      .filter((op) => op.type === "add_case")
      .map((op) => ({
        id: op.caseId as string,
        values: {
          ...(op.values as object),
          "c-id": `TC-00${next++}`,
        },
      }));
    const deleted = ops
      .filter((op) => op.type === "delete_cases")
      .flatMap((op) => op.caseIds as string[]);
    return { version: 2, cases: changed, deletedCaseIds: deleted };
  };
}

const opsBodies = (calls: { key: string; body: unknown }[]) =>
  calls
    .filter((c) => c.key === "POST /api/v1/test-sets/t1/ops")
    .map((c) => (c.body as { ops: Op[] }).ops);

const cell = (page: Page, row: number, column: string) =>
  page
    .getByRole("table", { name: "케이스" })
    .getByRole("row")
    .nth(row)
    .getByRole("cell")
    .nth(columnIndex[column] ?? 0);

// 첫 칸은 행 선택 체크박스
const columnIndex: Record<string, number> = {
  "테스트 ID": 1,
  제목: 2,
  "예상 결과": 3,
  우선순위: 4,
  영역: 5,
  자동화: 6,
};

test("셀을 골라 Enter로 고치고, 글자를 치면 바로 바꾸고, Delete로 비운다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await expect(page.getByRole("heading", { name: testSet.name })).toBeVisible();

  await cell(page, 1, "예상 결과").click();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("textbox", { name: "예상 결과" });
  await editor.press("End");
  await editor.pressSequentially(" 후 입력 칸 강조");
  await editor.press("Enter");
  await expect(cell(page, 1, "예상 결과")).toHaveText(
    "오류 문구 표시 후 입력 칸 강조",
  );

  await cell(page, 2, "예상 결과").click();
  await page.keyboard.type("B");
  await page.getByRole("textbox", { name: "예상 결과" }).press("Enter");
  await cell(page, 2, "우선순위").click();
  await page.keyboard.press("Delete");

  await expect.poll(() => opsBodies(calls).length).toBe(3);
  expect(opsBodies(calls)).toEqual([
    [
      {
        type: "set_cell",
        caseId: "k1",
        columnId: "c-exp",
        value: "오류 문구 표시 후 입력 칸 강조",
      },
    ],
    [{ type: "set_cell", caseId: "k2", columnId: "c-exp", value: "B" }],
    [{ type: "set_cell", caseId: "k2", columnId: "c-pri", value: null }],
  ]);
  await expect(page.getByRole("status").getByText("저장됨")).toBeVisible();
});

test("케이스를 추가하면 서버가 붙인 번호가 보이고, 고른 케이스를 지운다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "케이스 추가", exact: true }).click();
  await expect(cell(page, 3, "테스트 ID")).toHaveText("TC-003");
  const added = opsBodies(calls)[0]?.[0];
  expect(added).toMatchObject({ type: "add_case", afterCaseId: "k2" });

  await page.getByRole("checkbox", { name: "행 선택" }).first().click();
  await expect(page.getByText("1개 선택")).toBeVisible();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByText(cases[0]?.values["c-title"] as string),
  ).toHaveCount(0);
  expect(opsBodies(calls)[1]).toEqual([
    { type: "delete_cases", caseIds: ["k1"] },
  ]);
});

test("스프레드시트에서 복사한 여러 셀을 붙여넣으면 형식에 맞는 값만 바꾼다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 1, "예상 결과").click();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "가입 실패\t낮음\n버튼 활성\t없는값\n");
    document.activeElement?.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true }),
    );
  });
  await expect.poll(() => opsBodies(calls).length).toBe(1);
  expect(opsBodies(calls)[0]).toEqual([
    { type: "set_cell", caseId: "k1", columnId: "c-exp", value: "가입 실패" },
    { type: "set_cell", caseId: "k1", columnId: "c-pri", value: "낮음" },
    { type: "set_cell", caseId: "k2", columnId: "c-exp", value: "버튼 활성" },
  ]);
  await expect(
    page.getByText("1칸은 항목 형식에 맞지 않거나 표 밖이라 넣지 않았습니다"),
  ).toBeVisible();
});

test("카드 보기에서 우선순위로 묶고 카드를 다른 열로 끌면 값이 바뀐다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("tab", { name: "카드" }).click();
  await page.getByRole("combobox", { name: "묶기 기준" }).click();
  await page.getByRole("option", { name: "우선순위" }).click();
  const lane = (name: string) =>
    page.getByRole("listitem", { name, exact: true });
  await expect(lane("높음")).toContainText("TC-001");
  await lane("높음")
    .getByRole("button", { name: /TC-001/ })
    .dragTo(lane("낮음"));
  await expect(lane("낮음")).toContainText("TC-001");
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-pri", value: "낮음" },
    ]);
  // 보기와 묶기 기준은 사람별로 저장한다
  await expect
    .poll(
      () =>
        calls.filter((c) => c.key === "PUT /api/v1/test-sets/t1/view").at(-1)
          ?.body,
    )
    .toMatchObject({ view: "card", groupByColumnId: "c-pri" });
});

test("양식 편집에서 항목 이름을 바꾸면 이 테스트 세트의 항목만 저장한다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "PUT /api/v1/test-sets/t1/columns": (_route: unknown, body: unknown) => ({
        version: 2,
        columns: (body as { columns: unknown[] }).columns,
        cases,
      }),
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "양식 편집" }).click();
  const sheet = page.getByRole("dialog", { name: "테스트 세트 양식" });
  await sheet.getByRole("button").filter({ hasText: "예상 결과" }).click();
  await sheet.getByRole("textbox", { name: "항목 이름" }).fill("기대 결과");
  await sheet.getByRole("button", { name: "저장" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole("columnheader", { name: "기대 결과" }),
  ).toBeVisible();
  const body = calls.find((c) => c.key === "PUT /api/v1/test-sets/t1/columns")
    ?.body as { columns: { name: string }[] };
  expect(body.columns.map((c) => c.name)).toContain("기대 결과");
});

test("XLSX 내보내기를 누르면 파일을 받는다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses(),
  });
  await page.route("**/api/v1/test-sets/t1/export", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
      },
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "xlsx",
    }),
  );
  await page.goto("/test-sets/t1");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX 내보내기" }).click();
  expect((await download).suggestedFilename()).toBe(`${testSet.name}.xlsx`);
});

test("편집 권한이 없으면 표를 고칠 수 없고 양식 편집도 없다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1": {
        ...testSet,
        access: {
          canEdit: false,
          canRename: false,
          canDelete: false,
          canExport: false,
        },
      },
    }),
  });
  await page.goto("/test-sets/t1");
  await expect(page.getByRole("button", { name: "양식 편집" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "XLSX 내보내기" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "케이스 추가" })).toHaveCount(
    0,
  );
  await cell(page, 1, "예상 결과").click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "예상 결과" })).toHaveCount(0);
  expect(opsBodies(calls)).toHaveLength(0);
});

test("저장에 실패하면 알리고 서버의 내용으로 되돌린다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "POST /api/v1/test-sets/t1/ops": reply(403, {
        error: {
          code: "FORBIDDEN",
          message: "이 테스트 세트를 편집할 권한이 없습니다.",
          requestId: "t",
        },
      }),
    }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 1, "예상 결과").click();
  await page.keyboard.type("X");
  await page.getByRole("textbox", { name: "예상 결과" }).press("Enter");
  await expect(
    page.getByText("이 테스트 세트를 편집할 권한이 없습니다.").first(),
  ).toBeVisible();
  await expect(cell(page, 1, "예상 결과")).toHaveText("오류 문구 표시");
});

test("키보드로 표에 들어오면 첫 셀을 고르고 방향키와 Enter로 편집한다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("table", { name: "케이스" }).focus();
  // 첫 셀(테스트 ID)에서 오른쪽으로 한 칸 가면 제목이다
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("textbox", { name: "제목" })).toBeFocused();
});

test("카드를 태그 없음 열로 옮기면 태그를 모두 비운다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/view": {
        view: "card",
        groupByColumnId: "c-tags",
        columnWidths: {},
        rowHeights: {},
      },
      "GET /api/v1/test-sets/t1": {
        ...testSet,
        cases: [
          {
            ...cases[0],
            values: { ...cases[0]?.values, "c-tags": ["회원", "약관"] },
          },
        ],
      },
      "POST /api/v1/test-sets/t1/ops": opsHandler(),
    }),
  });
  await page.goto("/test-sets/t1");
  const lane = (name: string) =>
    page.getByRole("listitem", { name, exact: true });
  await lane("회원")
    .getByRole("button", { name: /TC-001/ })
    .dragTo(lane("태그 없음"));
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-tags", value: [] },
    ]);
  await expect(lane("태그 없음")).toContainText("TC-001");
});

test("먼저 보낸 저장의 응답이 늦게 와도 그 뒤에 고친 값을 되돌리지 않는다", async ({
  page,
}) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let count = 0;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "POST /api/v1/test-sets/t1/ops": async () => {
        count++;
        if (count === 1) {
          await gate;
          // 첫 연산만 반영된 서버 상태
          return {
            version: 2,
            cases: [
              {
                ...cases[0],
                values: { ...cases[0]?.values, "c-exp": "첫 수정" },
              },
            ],
            deletedCaseIds: [],
          };
        }
        return { version: 3, cases: [], deletedCaseIds: [] };
      },
    }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 1, "예상 결과").click();
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "예상 결과" }).fill("첫 수정");
  await page.getByRole("textbox", { name: "예상 결과" }).press("Enter");
  await cell(page, 1, "우선순위").click();
  await page.keyboard.press("Delete");
  await expect(cell(page, 1, "우선순위")).toHaveText("");
  release();
  await expect.poll(() => count).toBe(2);
  await expect(cell(page, 1, "예상 결과")).toHaveText("첫 수정");
  await expect(cell(page, 1, "우선순위")).toHaveText("");
});

test("셀을 고르고 바로 한글을 조합해 치면 첫 글자부터 빠짐없이 들어간다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 1, "예상 결과").click();

  // 운영체제 입력기처럼 키를 누르면 조합이 시작되고, 조합이 끝나면 글자가 확정된다
  const cdp = await page.context().newCDPSession(page);
  const compose = async (steps: string[], done: string) => {
    await cdp.send("Input.dispatchKeyEvent", {
      type: "rawKeyDown",
      key: "Process",
      windowsVirtualKeyCode: 229,
    });
    for (const text of steps)
      await cdp.send("Input.imeSetComposition", {
        text,
        selectionStart: text.length,
        selectionEnd: text.length,
      });
    await cdp.send("Input.insertText", { text: done });
  };
  await compose(["ㅎ", "하", "한"], "한");
  await compose(["ㄱ", "그", "글"], "글");
  await page.getByRole("textbox", { name: "예상 결과" }).press("Enter");

  await expect(cell(page, 1, "예상 결과")).toHaveText("한글");
  expect(
    calls.find((c) => c.key === "POST /api/v1/test-sets/t1/ops")?.body,
  ).toMatchObject({
    ops: [{ type: "set_cell", columnId: "c-exp", value: "한글" }],
  });
});

test("글자 셀에서 방향키로 선택 항목 셀로 옮겨도 키보드 조작이 이어진다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 1, "예상 결과").click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Delete");
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-pri", value: null },
    ]);
});
