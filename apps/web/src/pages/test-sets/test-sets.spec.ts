import { expect, type Route, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

const summary = {
  id: "t1",
  name: testSet.name,
  owner: { id: "a1", name: "최하늘" },
  isPublic: true,
  caseCount: 60,
  reviewCount: 4,
  updatedAt: new Date().toISOString(),
};

test("목록을 범위로 나누고 이름으로 찾는다", async ({ page }) => {
  const queries: string[] = [];
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets": (route: Route) => {
      queries.push(new URL(route.request().url()).search);
      return { items: [summary] };
    },
  });
  await page.goto("/test-sets");
  const row = page.getByRole("row").filter({ hasText: testSet.name });
  await expect(row).toContainText("공개");
  await expect(row).toContainText("확인 필요 4");
  await expect(row).toContainText("방금");

  await page.getByRole("tab", { name: "내 테스트 세트" }).click();
  await expect.poll(() => queries.at(-1)).toContain("filter=mine");
  await page.getByRole("textbox", { name: "테스트 세트 검색" }).fill("회원");
  await expect
    .poll(() => queries.at(-1))
    .toContain("search=%ED%9A%8C%EC%9B%90");
});

test("새 테스트 세트를 직접 작성으로 만들면 바로 테스트 세트를 연다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets": { items: [] },
    "GET /api/v1/projects": {
      items: [
        {
          id: "p1",
          name: "쇼핑몰 앱 리뉴얼",
          description: "",
          columnCount: 6,
          screenCount: 0,
          canManage: true,
        },
        {
          id: "p2",
          name: "사내 결재 시스템",
          description: "",
          columnCount: 6,
          screenCount: 0,
          canManage: true,
        },
      ],
    },
    "POST /api/v1/test-sets": reply(201, testSet),
    ...testSetResponses(),
  });
  await page.goto("/test-sets");
  await page.getByRole("link", { name: "새 테스트 세트" }).click();
  await page.getByRole("button", { name: "직접 작성" }).click();
  await expect(page.getByText("테스트 세트 이름을 입력하세요")).toBeVisible();
  await expect(page.getByText("프로젝트를 고르세요")).toBeVisible();

  await page
    .getByRole("textbox", { name: "테스트 세트 이름" })
    .fill("2.4.0 회원가입 개편");
  await page.getByRole("combobox", { name: "프로젝트" }).click();
  await page.getByRole("option", { name: "쇼핑몰 앱 리뉴얼" }).click();
  await page.getByRole("button", { name: "직접 작성" }).click();
  await expect(page).toHaveURL(/\/test-sets\/t1$/);
  expect(calls.find((c) => c.key === "POST /api/v1/test-sets")?.body).toEqual({
    name: "2.4.0 회원가입 개편",
    projectId: "p1",
    memo: "",
  });
});

test("테스트 세트를 만들 권한이 없으면 새 테스트 세트 버튼이 없다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(["test_set.export"]),
    "GET /api/v1/test-sets": { items: [] },
  });
  await page.goto("/test-sets");
  await expect(page.getByText("테스트 세트가 없습니다")).toBeVisible();
  await expect(page.getByRole("link", { name: "새 테스트 세트" })).toHaveCount(
    0,
  );
});

test("프레임 없이는 케이스 생성을 시작할 수 없고 직접 작성만 된다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/projects": { items: [] },
  });
  await page.goto("/test-sets/new");
  await page.getByRole("textbox", { name: "메모" }).fill("설명만 있음");
  await expect(
    page.getByRole("button", { name: "케이스 생성" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "직접 작성" })).toBeEnabled();
  await expect(
    page.getByText("Figma 플러그인에서 프레임을 올리면 여기에 보입니다"),
  ).toBeVisible();
});
