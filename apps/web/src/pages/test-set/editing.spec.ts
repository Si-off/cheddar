import { expect, type Page, test } from "@playwright/test";
import { me, mockApi } from "../../shared/testing/mock-api";
import { testSetResponses } from "../../shared/testing/test-set-fixtures";

type Op = { type: string; [key: string]: unknown };

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const opsHandler = () => {
  let version = 1;
  return () => ({ version: ++version, cases: [], deletedCaseIds: [] });
};
const opsBodies = (calls: { key: string; body: unknown }[]) =>
  calls
    .filter((c) => c.key === "POST /api/v1/test-sets/t1/ops")
    .map((c) => (c.body as { ops: Op[] }).ops);

// 첫 칸은 행 선택 체크박스
const columnIndex: Record<string, number> = {
  "테스트 ID": 1,
  제목: 2,
  "예상 결과": 3,
  우선순위: 4,
};
const cell = (page: Page, row: number, column: string) =>
  page
    .getByRole("table", { name: "케이스" })
    .getByRole("row")
    .nth(row)
    .getByRole("cell")
    .nth(columnIndex[column] ?? 0);
const tools = (page: Page) =>
  page.getByRole("toolbar", { name: "테스트 세트 도구" });
const open = async (page: Page) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({ "POST /api/v1/test-sets/t1/ops": opsHandler() }),
  });
  await page.goto("/test-sets/t1");
  await expect(cell(page, 1, "제목")).toBeVisible();
  return calls;
};

test("Shift를 누른 채 셀을 누르면 범위를 고르고, 복사는 스프레드시트 형식으로, Delete는 범위를 비운다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "제목").click();
  await cell(page, 2, "예상 결과").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("status").filter({ hasText: "선택" })).toHaveText(
    "2행 2열 선택",
  );
  await tools(page).getByRole("button", { name: "수정" }).click();
  await page.getByRole("menuitem", { name: "복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "이메일 형식이 아니면 가입할 수 없다\t오류 문구 표시\n약관 동의 없이 가입 버튼이 비활성이다\t가입 버튼 비활성",
  );
  await cell(page, 1, "제목").click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Delete");
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-title", value: "" },
      { type: "set_cell", caseId: "k2", columnId: "c-title", value: "" },
    ]);
});

test("잘라내기는 범위를 복사하고 비운다", async ({ page }) => {
  const calls = await open(page);
  await cell(page, 1, "예상 결과").click();
  await tools(page).getByRole("button", { name: "수정" }).click();
  await page.getByRole("menuitem", { name: "잘라내기" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "오류 문구 표시",
  );
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-exp", value: "" },
    ]);
});

test("실행취소는 내가 고친 값을 되돌리고 재실행은 다시 고친다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "예상 결과").click();
  await page.keyboard.type("바뀐 결과");
  await page.keyboard.press("Enter");
  await expect(cell(page, 1, "예상 결과")).toHaveText("바뀐 결과");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(cell(page, 1, "예상 결과")).toHaveText("오류 문구 표시");
  await page.keyboard.press("ControlOrMeta+y");
  await expect(cell(page, 1, "예상 결과")).toHaveText("바뀐 결과");
  await expect.poll(() => opsBodies(calls).length).toBe(3);
  expect(opsBodies(calls).map((ops) => ops[0]?.value)).toEqual([
    "바뀐 결과",
    "오류 문구 표시",
    "바뀐 결과",
  ]);

  // 도구 상자의 실행취소로 지운 행을 같은 자리에 되살린다
  await cell(page, 1, "예상 결과").click();
  await tools(page).getByRole("button", { name: "수정" }).click();
  await page.getByRole("menuitem", { name: "행 삭제" }).click();
  await expect(cell(page, 1, "테스트 ID")).toHaveText("TC-002");
  await tools(page)
    .getByRole("button", { name: /^실행취소/ })
    .click();
  await expect(cell(page, 1, "테스트 ID")).toHaveText("TC-001");
  await expect
    .poll(() => opsBodies(calls).at(-1)?.[0])
    .toMatchObject({ type: "add_case", caseId: "k1", afterCaseId: null });
});

test("아래로 채우기는 범위의 첫 행 값으로 나머지 행을 채운다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "우선순위").click();
  await cell(page, 2, "우선순위").click({ modifiers: ["Shift"] });
  await page.keyboard.press("ControlOrMeta+d");
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k2", columnId: "c-pri", value: "높음" },
    ]);
  await expect(cell(page, 2, "우선순위")).toHaveText("높음");
});

test("행 위로 이동은 고른 행을 한 칸 올린다", async ({ page }) => {
  const calls = await open(page);
  await cell(page, 2, "제목").click();
  await tools(page).getByRole("button", { name: "수정" }).click();
  await expect(
    page.getByRole("menuitem", { name: "행 아래로 이동" }),
  ).toBeDisabled();
  await page.getByRole("menuitem", { name: "행 위로 이동" }).click();
  await expect(cell(page, 1, "테스트 ID")).toHaveText("TC-002");
  expect(opsBodies(calls)[0]).toEqual([
    { type: "move_case", caseId: "k1", afterCaseId: "k2" },
  ]);
});

test("세로로 병합은 한 열의 범위를 맨 위 값으로 맞춰 한 칸으로 보이게 한다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "제목").click();
  await cell(page, 2, "제목").click({ modifiers: ["Shift"] });
  await tools(page).getByRole("button", { name: "셀 병합" }).click();
  await page.getByRole("menuitem", { name: "세로로 병합" }).click();
  // 값이 다르면 맨 위 값만 남는다고 먼저 묻는다
  const confirm = page.getByRole("dialog", { name: "셀 병합" });
  await expect(confirm).toContainText("맨 위 셀의 값만 남고");
  await confirm.getByRole("button", { name: "병합" }).click();
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      {
        type: "set_cell",
        caseId: "k2",
        columnId: "c-title",
        value: "이메일 형식이 아니면 가입할 수 없다",
      },
    ]);
  await expect(cell(page, 1, "제목")).toHaveAttribute("rowspan", "2");
});

test("찾기 및 바꾸기는 다음 셀로 옮겨 가고, 모두 바꾸기는 찾은 셀을 모두 바꾼다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "테스트 ID").click();
  await tools(page).getByRole("button", { name: "수정" }).click();
  await page.getByRole("menuitem", { name: "찾기 및 바꾸기" }).click();
  const dialog = page.getByRole("dialog", { name: "찾기 및 바꾸기" });
  await dialog.getByRole("textbox", { name: "찾기" }).fill("버튼");
  await dialog.getByRole("button", { name: "찾기", exact: true }).click();
  // 대화상자가 열린 동안 표는 가려지므로 셀을 위치로 찾는다
  await expect(
    page.locator('td[data-row="k2"][data-col="c-title"]'),
  ).toHaveAttribute("aria-current", "true");
  await dialog.getByRole("textbox", { name: "찾기" }).fill("가입");
  await dialog.getByRole("textbox", { name: "바꾸기" }).fill("회원가입");
  await dialog.getByRole("button", { name: "모두 바꾸기" }).click();
  await expect(dialog.getByRole("status")).toHaveText("3개를 바꿨습니다");
  expect(opsBodies(calls)[0]).toEqual([
    {
      type: "set_cell",
      caseId: "k1",
      columnId: "c-title",
      value: "이메일 형식이 아니면 회원가입할 수 없다",
    },
    {
      type: "set_cell",
      caseId: "k2",
      columnId: "c-title",
      value: "약관 동의 없이 회원가입 버튼이 비활성이다",
    },
    {
      type: "set_cell",
      caseId: "k2",
      columnId: "c-exp",
      value: "회원가입 버튼 비활성",
    },
  ]);
});

test("마지막 행까지 지워 표가 비어도 실행취소로 되살린다", async ({ page }) => {
  const calls = await open(page);
  await page.getByRole("checkbox", { name: "모두 선택" }).click();
  await tools(page).getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("케이스가 없습니다")).toBeVisible();
  await tools(page)
    .getByRole("button", { name: /^실행취소/ })
    .click();
  await expect(cell(page, 2, "테스트 ID")).toHaveText("TC-002");
  expect(opsBodies(calls).at(-1)).toEqual([
    expect.objectContaining({ type: "add_case", caseId: "k1" }),
    expect.objectContaining({ type: "add_case", caseId: "k2" }),
  ]);
});

test("메뉴의 붙여넣기도 범위의 왼쪽 위부터 채운다", async ({ page }) => {
  const calls = await open(page);
  await page.evaluate(() => navigator.clipboard.writeText("새 제목"));
  await cell(page, 2, "예상 결과").click();
  await cell(page, 1, "제목").click({ modifiers: ["Shift"] });
  await tools(page).getByRole("button", { name: "수정" }).click();
  await page.getByRole("menuitem", { name: "붙여넣기" }).click();
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      { type: "set_cell", caseId: "k1", columnId: "c-title", value: "새 제목" },
    ]);
});

test("스프레드시트 단축키로 위에 행을 넣고 행을 지운다", async ({ page }) => {
  const calls = await open(page);
  await cell(page, 2, "제목").click();
  await page.keyboard.press("ControlOrMeta+Alt+Equal");
  await expect
    .poll(() => opsBodies(calls)[0]?.[0])
    .toMatchObject({ type: "add_case", afterCaseId: "k1" });
  await cell(page, 1, "제목").click();
  await page.keyboard.press("ControlOrMeta+Alt+Minus");
  await expect
    .poll(() => opsBodies(calls)[1])
    .toEqual([{ type: "delete_cases", caseIds: ["k1"] }]);
});
