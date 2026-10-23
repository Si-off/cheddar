import { expect, type Page, test } from "@playwright/test";
import { API, me, mockApi, WEB_ORIGIN } from "../../shared/testing/mock-api";
import {
  cases,
  columns,
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

type Op = { type: string; [key: string]: unknown };

const IMAGE_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
// 1×1 투명 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

/** 우선순위에 색을 두고, 글자로 적던 사용자 열 하나(테스트 단말)를 더한 세트 */
const sheet = {
  ...testSet,
  columns: [
    ...columns.map((c) =>
      c.id === "c-pri" ? { ...c, colors: { 높음: "red", 낮음: "green" } } : c,
    ),
    {
      id: "c-dev",
      presetKey: null,
      systemKey: null,
      name: "테스트 단말",
      type: "text",
      description: "",
      options: [],
    },
  ],
  cases: cases.map((c, i) => ({
    ...c,
    values: { ...c.values, "c-dev": i === 0 ? "iPhone 15" : "Galaxy S24" },
  })),
};

const opsBodies = (calls: { key: string; body: unknown }[]) =>
  calls
    .filter((c) => c.key === "POST /api/v1/test-sets/t1/ops")
    .map((c) => (c.body as { ops: Op[] }).ops);

async function open(page: Page) {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1": sheet,
      "POST /api/v1/test-sets/t1/ops": { version: 2, cases: [] },
    }),
  });
  await page.goto("/test-sets/t1");
  await expect(page.getByRole("heading", { name: testSet.name })).toBeVisible();
  return calls;
}

const cell = (page: Page, row: number, columnId: string) =>
  page
    .getByRole("table", { name: "케이스" })
    .locator(`td[data-col="${columnId}"]`)
    .nth(row);

test("선택 칩을 한 번 누르면 바로 목록이 열리고 고른 값으로 바뀐다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 1, "c-pri")
    .getByRole("button", { name: "우선순위 고르기" })
    .click();
  await page.getByRole("menuitemcheckbox", { name: "높음" }).click();
  await expect(cell(page, 1, "c-pri")).toHaveText("높음");
  await expect
    .poll(() => opsBodies(calls))
    .toEqual([
      [{ type: "set_cell", caseId: "k2", columnId: "c-pri", value: "높음" }],
    ]);
});

test("항목 편집에서 항목 색을 바꾸면 열의 색으로 저장한다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 0, "c-pri")
    .getByRole("button", { name: "우선순위 고르기" })
    .click();
  await page.getByRole("menuitem", { name: "우선순위 항목 편집" }).click();
  await page.getByRole("button", { name: "보통 색: 회색" }).click();
  await page.getByRole("button", { name: "파랑" }).click();
  await expect(
    page.getByRole("button", { name: "보통 색: 파랑" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "완료" }).click();
  await expect
    .poll(() => opsBodies(calls))
    .toEqual([
      [
        {
          type: "update_column",
          columnId: "c-pri",
          name: "우선순위",
          description: "",
          colors: { 높음: "red", 보통: "blue", 낮음: "green" },
        },
      ],
    ]);
});

test("삽입 > 드롭다운은 글자 열을 선택 열로 바꾸고 있던 값으로 항목을 채운다", async ({
  page,
}) => {
  const calls = await open(page);
  await cell(page, 0, "c-dev").click();
  await page.getByRole("button", { name: "삽입" }).click();
  await page.getByRole("menuitem", { name: "드롭다운" }).click();
  // 바로 항목 편집이 열리고, 열에 있던 값이 항목이 된다
  const panel = page.getByRole("dialog", { name: "테스트 단말 항목 편집" });
  await expect(
    panel.getByRole("textbox", { name: "선택 항목 이름" }),
  ).toHaveCount(2);
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      {
        type: "update_column",
        columnId: "c-dev",
        name: "테스트 단말",
        description: "",
        columnType: "select",
        options: ["iPhone 15", "Galaxy S24"],
        colors: {},
      },
    ]);
  await page.keyboard.press("Escape");
  await expect(
    cell(page, 1, "c-dev").getByRole("button", { name: "테스트 단말 고르기" }),
  ).toBeVisible();
});

test("사전 정의 열에서는 드롭다운으로 바꿀 수 없다", async ({ page }) => {
  await open(page);
  await cell(page, 0, "c-exp").click();
  await page.getByRole("button", { name: "삽입" }).click();
  await expect(page.getByRole("menuitem", { name: "드롭다운" })).toBeDisabled();
});

test("셀 안에 이미지를 넣으면 셀에 이미지가 보이고 Enter로 크게 본다", async ({
  page,
}) => {
  const calls = await open(page);
  // 업로드와 이미지 조회는 multipart와 바이너리라 따로 답한다
  const headers = {
    "access-control-allow-origin": WEB_ORIGIN,
    "access-control-allow-credentials": "true",
  };
  await page.route(`${API}/api/v1/test-sets/t1/images`, (route) =>
    route.fulfill({
      headers,
      contentType: "application/json",
      body: JSON.stringify({ id: IMAGE_ID, width: 1, height: 1 }),
    }),
  );
  await page.route(`${API}/api/v1/test-sets/t1/images/${IMAGE_ID}`, (route) =>
    route.fulfill({ headers, contentType: "image/png", body: PNG }),
  );

  await cell(page, 1, "c-exp").click();
  await page.getByRole("button", { name: "삽입" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "셀 안에 이미지" }).click();
  await (await chooser).setFiles({
    name: "shot.png",
    mimeType: "image/png",
    buffer: PNG,
  });

  await expect(
    cell(page, 1, "c-exp").getByRole("img", { name: "셀 이미지" }),
  ).toBeVisible();
  await expect
    .poll(() => opsBodies(calls))
    .toEqual([
      [
        {
          type: "set_cell",
          caseId: "k2",
          columnId: "c-exp",
          value: { image: IMAGE_ID },
        },
      ],
    ]);

  await cell(page, 1, "c-exp").click();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog").getByRole("img", { name: "예상 결과 이미지" }),
  ).toBeVisible();
});

test("이미지가 아닌 파일은 넣지 않고 알린다", async ({ page }) => {
  const calls = await open(page);
  await cell(page, 1, "c-exp").click();
  await page.getByRole("button", { name: "삽입" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "셀 안에 이미지" }).click();
  await (await chooser).setFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(
    page.getByText("PNG, JPG, GIF, WebP 이미지만 넣을 수 있습니다").first(),
  ).toBeVisible();
  expect(opsBodies(calls)).toEqual([]);
});

test("이미지가 든 열을 드롭다운으로 바꾸기 전에 지워질 이미지 수를 묻는다", async ({
  page,
}) => {
  const withImage = {
    ...sheet,
    cases: sheet.cases.map((c, i) =>
      i === 1
        ? { ...c, values: { ...c.values, "c-dev": { image: IMAGE_ID } } }
        : c,
    ),
  };
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1": withImage,
      "POST /api/v1/test-sets/t1/ops": { version: 2, cases: [] },
    }),
  });
  await page.goto("/test-sets/t1");
  await cell(page, 0, "c-dev").click();
  await page.getByRole("button", { name: "삽입" }).click();
  await page.getByRole("menuitem", { name: "드롭다운" }).click();
  const confirm = page.getByRole("dialog", { name: "드롭다운" });
  await expect(confirm).toContainText("이 열의 이미지 1개가 지워집니다");
  expect(opsBodies(calls)).toEqual([]);
  await confirm.getByRole("button", { name: "드롭다운으로 바꾸기" }).click();
  await expect
    .poll(() => opsBodies(calls)[0]?.[0])
    .toMatchObject({
      type: "update_column",
      columnType: "select",
      options: ["iPhone 15"],
    });
});
