import { expect, test } from "@playwright/test";
import { mockApi, reply, unauthenticated } from "../../shared/testing/mock-api";
import { testSet } from "../../shared/testing/test-set-fixtures";

const TOKEN = "a".repeat(43);
const shared = (canEdit: boolean) => {
  const { owner: _owner, ...rest } = testSet;
  return {
    ...rest,
    owner: { name: "최하늘" },
    me: { kind: "visitor", id: "v1", name: "졸린 판다" },
    access: { canEdit, canRename: false, canDelete: false, canExport: true },
  };
};

test("보기 링크로 온 방문자는 자동 이름으로 보고 편집할 수 없다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    [`GET /api/v1/shared/${TOKEN}`]: shared(false),
  });
  await page.goto(`/s/${TOKEN}`);
  await expect(page.getByText("보기 전용")).toBeVisible();
  await expect(page.getByText("졸린 판다")).toBeVisible();
  await expect(page.getByRole("link", { name: "로그인" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "XLSX 내보내기" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "케이스 추가" })).toHaveCount(
    0,
  );

  const table = page.getByRole("table", { name: "테스트 케이스" });
  await table.getByText("이메일 형식이 아니면 가입할 수 없다").dblclick();
  await expect(table.getByRole("textbox")).toHaveCount(0);
  expect(calls.some((c) => c.key.includes("/ops"))).toBe(false);
});

test("편집 링크로 온 방문자의 편집은 공개 링크 경로로 저장한다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    [`GET /api/v1/shared/${TOKEN}`]: shared(true),
    [`POST /api/v1/shared/${TOKEN}/ops`]: {
      version: testSet.version + 1,
      cases: [],
      deletedCaseIds: [],
    },
  });
  await page.goto(`/s/${TOKEN}`);
  await expect(page.getByText("보기 전용")).toHaveCount(0);
  await page.getByRole("button", { name: "케이스 추가" }).click();
  await expect
    .poll(() => calls.find((c) => c.key === `POST /api/v1/shared/${TOKEN}/ops`))
    .toBeTruthy();
});

test("바뀌었거나 닫힌 링크는 열 수 없다고 알린다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    [`GET /api/v1/shared/${TOKEN}`]: reply(404, {
      error: {
        code: "LINK_NOT_FOUND",
        message: "열 수 없는 링크입니다.",
        requestId: "t",
      },
    }),
  });
  await page.goto(`/s/${TOKEN}`);
  await expect(page.getByText("열 수 없는 링크입니다")).toBeVisible();
});

test("방문자가 바꾼 열 너비는 공개 링크 경로로 저장해 다음에도 그대로 연다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    [`GET /api/v1/shared/${TOKEN}`]: shared(false),
    [`GET /api/v1/shared/${TOKEN}/view`]: {
      view: "table",
      groupByColumnId: null,
      columnWidths: {},
      rowHeights: {},
    },
    [`PUT /api/v1/shared/${TOKEN}/view`]: (_route: unknown, body: unknown) =>
      body,
  });
  await page.goto(`/s/${TOKEN}`);
  const handle = page.getByRole("separator", { name: "제목 너비" });
  const before = Number(await handle.getAttribute("aria-valuenow"));
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(
      () =>
        (
          calls
            .filter((c) => c.key === `PUT /api/v1/shared/${TOKEN}/view`)
            .at(-1)?.body as
            | { columnWidths?: Record<string, number> }
            | undefined
        )?.columnWidths?.["c-title"],
    )
    .toBeGreaterThan(before);
});

test("공개 링크에서 열 너비를 바꿔도 다른 화면에서 정한 묶기 기준은 그대로 둔다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    [`GET /api/v1/shared/${TOKEN}`]: shared(false),
    [`GET /api/v1/shared/${TOKEN}/view`]: {
      view: "table",
      groupByColumnId: "c-pri",
      columnWidths: {},
      rowHeights: {},
    },
    [`PUT /api/v1/shared/${TOKEN}/view`]: (_route: unknown, body: unknown) =>
      body,
  });
  await page.goto(`/s/${TOKEN}`);
  await page.getByRole("separator", { name: "제목 너비" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(
      () =>
        calls.filter((c) => c.key === `PUT /api/v1/shared/${TOKEN}/view`).at(-1)
          ?.body,
    )
    .toMatchObject({ groupByColumnId: "c-pri" });
});
