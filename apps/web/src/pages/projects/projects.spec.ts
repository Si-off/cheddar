import { expect, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  project,
  projectSettings,
} from "../../shared/testing/project-fixtures";

test("프로젝트 만들기 권한이 있으면 프로젝트를 만들고 바로 기본 양식으로 간다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/projects": {
      items: [
        {
          id: "p0",
          name: "사내 결재 시스템",
          description: "결재선과 위임 규칙",
          columnCount: 7,
          screenCount: 12,
          canManage: true,
        },
      ],
    },
    "POST /api/v1/projects": reply(201, project),
    ...projectSettings(),
  });
  await page.goto("/projects");
  await expect(
    page.getByRole("link", { name: /사내 결재 시스템/ }),
  ).toContainText("화면 12");

  await page.getByRole("button", { name: "프로젝트 만들기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(dialog.getByText("프로젝트 이름을 입력하세요")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "프로젝트 이름" })
    .fill("쇼핑몰 앱 리뉴얼");
  await dialog.getByRole("textbox", { name: "설명" }).fill("모바일 쇼핑 앱");
  await dialog.getByRole("button", { name: "만들기" }).click();

  await expect(page).toHaveURL(/\/projects\/p1\/template$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "쇼핑몰 앱 리뉴얼" }),
  ).toBeVisible();
  expect(calls.find((c) => c.key === "POST /api/v1/projects")?.body).toEqual({
    name: "쇼핑몰 앱 리뉴얼",
    description: "모바일 쇼핑 앱",
  });
});

test("구성원도 프로젝트를 만들 수 있다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me({ role: "member" }),
    "GET /api/v1/projects": { items: [] },
  });
  await page.goto("/projects");
  await expect(page.getByText("프로젝트가 없습니다")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "프로젝트 만들기" }),
  ).toBeVisible();
});
