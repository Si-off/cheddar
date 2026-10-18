import { expect, test } from "@playwright/test";
import {
  me,
  mockApi,
  reply,
  roles,
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
    "GET /api/v1/roles": roles,
  });

  await page.goto("/admin/roles");
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();

  await page
    .getByRole("textbox", { name: "이메일" })
    .fill("haneul.choi@cheddar.app");
  await page
    .locator("input[autocomplete=current-password]")
    .fill("long-password-1");
  await page.getByRole("button", { name: "로그인" }).click();

  await expect(page).toHaveURL(/\/admin\/roles$/);
  await expect(page.getByRole("heading", { name: "관리" })).toBeVisible();
});

test("로그인에 실패하면 서버가 알려준 이유를 보여준다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    "POST /api/v1/auth/login": reply(401, {
      error: {
        code: "INVALID_CREDENTIALS",
        message: "이메일과 비밀번호 또는 계정 상태를 확인해주세요.",
        requestId: "t",
      },
    }),
  });
  await page.goto("/login");
  await page
    .getByRole("textbox", { name: "이메일" })
    .fill("someone@cheddar.app");
  await page.locator("input[autocomplete=current-password]").fill("wrong-pass");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(
    page.getByText("이메일과 비밀번호 또는 계정 상태를 확인해주세요.").first(),
  ).toBeVisible();
});

test("초대 링크로 비밀번호를 정하면 이메일이 채워진 로그인 화면으로 간다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": unauthenticated,
    "GET /api/v1/auth/invitations": {
      name: "정우진",
      email: "woojin.jung@bsoft.kr",
      expiresAt: "2026-10-25T00:00:00Z",
    },
    "POST /api/v1/auth/invitations/accept": reply(204),
  });
  await page.goto("/invite?token=t-123");
  await expect(page.getByText("정우진")).toBeVisible();

  await page
    .locator("input[autocomplete=new-password]")
    .first()
    .fill("long-password-1");
  await page
    .locator("input[autocomplete=new-password]")
    .last()
    .fill("long-password-2");
  await page.getByRole("button", { name: "시작" }).click();
  await expect(page.getByText("비밀번호가 다릅니다")).toBeVisible();

  await page
    .locator("input[autocomplete=new-password]")
    .last()
    .fill("long-password-1");
  await page.getByRole("button", { name: "시작" }).click();
  await expect(page.getByRole("heading", { name: "로그인" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "이메일" })).toHaveValue(
    "woojin.jung@bsoft.kr",
  );
  expect(
    calls.find((c) => c.key === "POST /api/v1/auth/invitations/accept")?.body,
  ).toEqual({
    token: "t-123",
    password: "long-password-1",
  });
});

test("사용할 수 없는 링크면 새 링크를 요청하라고 안내한다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/password-resets": reply(400, {
      error: {
        code: "INVALID_AUTH_TOKEN",
        message: "링크가 만료되었거나 사용할 수 없습니다.",
        requestId: "t",
      },
    }),
  });
  await page.goto("/password-reset?token=expired");
  await expect(page.getByText("링크를 사용할 수 없습니다")).toBeVisible();
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
    .getByRole("textbox", { name: "이메일" })
    .fill("haneul.choi@cheddar.app");
  await page
    .locator("input[autocomplete=current-password]")
    .fill("long-password-1");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/test-sets$/);
});
