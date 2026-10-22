import { expect, test } from "@playwright/test";
import {
  me,
  mockApi,
  reply,
  unauthenticated,
} from "../../shared/testing/mock-api";

test("로그인하지 않으면 로그인 화면으로 가고, 로그인하면 원래 화면으로 돌아간다", async ({
  page,
}) => {
  let loggedIn = false;
  await mockApi(page, {
    "GET /api/v1/auth/me": () => (loggedIn ? me() : unauthenticated),
    "POST /api/v1/auth/login": () => {
      loggedIn = true;
      return {};
    },
    "GET /api/v1/accounts": { items: [], total: 0 },
  });

  await page.goto("/admin/accounts");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await page
    .getByRole("textbox", { name: "아이디" })
    .fill("haneul.choi@cheddar.app");
  await page
    .locator("input[autocomplete=current-password]")
    .fill("long-password-1");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/admin\/accounts$/);
  await expect(page.getByRole("heading", { name: "계정" })).toBeVisible();
});

test("로그인에 실패하면 서버가 알려준 이유를 보여준다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    "POST /api/v1/auth/login": reply(401, {
      error: {
        code: "INVALID_CREDENTIALS",
        message:
          "아이디와 비밀번호를 확인해주세요. 계속 로그인할 수 없다면 관리자에게 문의해주세요.",
        requestId: "t",
      },
    }),
  });
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "아이디" })
    .fill("someone@cheddar.app");
  await page.locator("input[autocomplete=current-password]").fill("wrong-pass");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(
    page
      .getByText(
        "아이디와 비밀번호를 확인해주세요. 계속 로그인할 수 없다면 관리자에게 문의해주세요.",
      )
      .first(),
  ).toBeVisible();
});

test("계정 메뉴에서 현재 비밀번호를 확인하고 비밀번호를 바꾼다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me({ role: "member" }),
    "GET /api/v1/test-sets": { items: [] },
    "POST /api/v1/auth/password": reply(204),
  });
  await page.goto("/test-sets");
  await expect(page.getByRole("menuitem", { name: "관리" })).toHaveCount(0);
  await page.getByRole("button", { name: "계정 메뉴" }).click();
  await expect(page.getByRole("menuitem", { name: "관리" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "비밀번호 바꾸기" }).click();
  const dialog = page.getByRole("dialog", { name: "비밀번호 바꾸기" });
  await dialog
    .locator("input[autocomplete=current-password]")
    .fill("old-password-12");
  await dialog.locator("input[autocomplete=new-password]").fill("short");
  await dialog.getByRole("button", { name: "바꾸기" }).click();
  await expect(dialog.getByText("12자 이상 입력하세요")).toBeVisible();
  expect(calls.some((c) => c.key === "POST /api/v1/auth/password")).toBe(false);

  await dialog
    .locator("input[autocomplete=new-password]")
    .fill("new-password-123");
  await dialog.getByRole("button", { name: "바꾸기" }).click();
  await expect(page.getByText("비밀번호를 바꿨습니다")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(
    calls.find((c) => c.key === "POST /api/v1/auth/password")?.body,
  ).toEqual({
    currentPassword: "old-password-12",
    newPassword: "new-password-123",
  });
});

test("로그인 후 돌아갈 주소가 다른 사이트면 테스트 세트 목록으로 간다", async ({
  page,
}) => {
  let loggedIn = false;
  await mockApi(page, {
    "GET /api/v1/auth/me": () => (loggedIn ? me() : unauthenticated),
    "POST /api/v1/auth/login": () => {
      loggedIn = true;
      return {};
    },
  });
  await page.goto("/login?redirect=%2F%2Fevil.example%2Fsteal");
  await page
    .getByRole("textbox", { name: "아이디" })
    .fill("haneul.choi@cheddar.app");
  await page
    .locator("input[autocomplete=current-password]")
    .fill("long-password-1");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/test-sets$/);
});
