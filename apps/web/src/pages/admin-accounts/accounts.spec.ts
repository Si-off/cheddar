import { expect, type Route, test } from "@playwright/test";
import { account, me, mockApi, reply } from "../../shared/testing/mock-api";

test("이름, 아이디, 등급, 처음 비밀번호로 계정을 만든다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/accounts": { items: [account()], total: 1 },
    "POST /api/v1/accounts": reply(
      201,
      account({
        id: "a9",
        name: "정우진",
        loginId: "woojin.jung",
        role: "member",
      }),
    ),
  });

  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "이름" }).fill("정우진");
  await dialog.getByRole("textbox", { name: "아이디" }).fill("Woojin.Jung");
  await dialog.locator("input[autocomplete=new-password]").fill("short");
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(dialog.getByText("12자 이상 입력하세요")).toBeVisible();
  expect(calls.some((c) => c.key === "POST /api/v1/accounts")).toBe(false);

  await dialog
    .locator("input[autocomplete=new-password]")
    .fill("first-password-1");
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(page.getByText("계정을 만들었습니다")).toBeVisible();
  expect(calls.find((c) => c.key === "POST /api/v1/accounts")?.body).toEqual({
    name: "정우진",
    loginId: "Woojin.Jung",
    role: "member",
    password: "first-password-1",
  });
});

test("구성원은 관리 화면 대신 접근 권한 없음을 본다", async ({ page }) => {
  await mockApi(page, { "GET /api/v1/auth/me": me({ role: "member" }) });
  await page.goto("/admin/accounts");
  await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "계정 메뉴" }).click();
  await expect(page.getByRole("menuitem", { name: "관리" })).toHaveCount(0);
});

test("계정 상세에서 등급을 바꿔 저장하고 비밀번호를 다시 정한다", async ({
  page,
}) => {
  const member = account({
    id: "a2",
    name: "김지은",
    loginId: "jieun.kim",
    role: "member",
  });
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/accounts/a2": member,
    "PATCH /api/v1/accounts/a2": { ...member, role: "admin" },
    "PUT /api/v1/accounts/a2/password": reply(204),
  });
  await page.goto("/admin/accounts/a2");
  await expect(page.getByRole("textbox", { name: "아이디" })).toHaveValue(
    "jieun.kim",
  );
  await page.getByRole("combobox", { name: "등급" }).click();
  await page.getByRole("option", { name: "관리자" }).click();
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장했습니다")).toBeVisible();
  expect(
    calls.find((c) => c.key === "PATCH /api/v1/accounts/a2")?.body,
  ).toEqual({ name: "김지은", role: "admin" });

  await page.getByRole("button", { name: "비밀번호 다시 정하기" }).click();
  const dialog = page.getByRole("dialog", { name: "비밀번호 다시 정하기" });
  await dialog
    .locator("input[autocomplete=new-password]")
    .fill("reset-password-1");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("비밀번호를 바꿨습니다")).toBeVisible();
  await expect(dialog).toHaveCount(0);
  expect(
    calls.find((c) => c.key === "PUT /api/v1/accounts/a2/password")?.body,
  ).toEqual({ password: "reset-password-1" });
});

test("계정 목록을 불러오지 못하면 빈 목록 대신 다시 시도를 보여준다", async ({
  page,
}) => {
  let fail = true;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/accounts": () =>
      fail
        ? reply(503, {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message:
                "데이터를 읽거나 저장하지 못했습니다. 저장 결과를 확인해주세요.",
              requestId: "t",
            },
          })
        : { items: [account()], total: 1 },
  });
  await page.goto("/admin/accounts");
  await expect(page.getByText("계정을 불러오지 못했습니다")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("link", { name: "최하늘" })).toBeVisible();
});

test("계정이 100명을 넘으면 페이지를 넘겨 나머지를 볼 수 있고, 조건을 바꾸면 첫 페이지로 돌아간다", async ({
  page,
}) => {
  const offsets: string[] = [];
  let releaseNext = () => {};
  const nextGate = new Promise<void>((resolve) => {
    releaseNext = resolve;
  });
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/accounts": async (route: Route) => {
      const offset =
        new URL(route.request().url()).searchParams.get("offset") ?? "0";
      offsets.push(offset);
      if (offset === "100") await nextGate;
      const name = offset === "0" ? "최하늘" : "정우진";
      return { items: [account({ id: `a-${offset}`, name })], total: 150 };
    },
  });
  await page.goto("/admin/accounts");
  await expect(page.getByText("전체 150명 중 1–100")).toBeVisible();
  await expect(page.getByRole("button", { name: "이전" })).toBeDisabled();
  await page.getByRole("button", { name: "다음" }).click();

  // 다음 페이지 응답 전에는 보이는 목록 그대로의 범위를 보여주고 더 넘기지 않는다
  await expect.poll(() => offsets).toContain("100");
  await expect(page.getByText("전체 150명 중 1–100")).toBeVisible();
  await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();
  releaseNext();

  await expect(page.getByRole("link", { name: "정우진" })).toBeVisible();
  await expect(page.getByText("전체 150명 중 101–150")).toBeVisible();
  await expect(page.getByRole("button", { name: "다음" })).toBeDisabled();

  await page.getByRole("combobox", { name: "상태" }).click();
  await page.getByRole("option", { name: "활성", exact: true }).click();
  await expect(page.getByText("전체 150명 중 1–100")).toBeVisible();
});

test("보던 페이지의 계정이 모두 사라지면 빈 목록 대신 마지막 페이지로 옮긴다", async ({
  page,
}) => {
  let total = 150;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/accounts": (route: Route) => {
      const offset =
        new URL(route.request().url()).searchParams.get("offset") ?? "0";
      if (offset === "100" && total <= 100) return { items: [], total };
      const name = offset === "0" ? "최하늘" : "정우진";
      return { items: [account({ id: `a-${offset}`, name })], total };
    },
  });
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByRole("link", { name: "정우진" })).toBeVisible();

  // 다른 관리자가 계정을 줄인 뒤 화면으로 돌아와 목록을 다시 읽는다
  total = 100;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByRole("link", { name: "최하늘" })).toBeVisible();
  await expect(page.getByText("조건에 맞는 계정이 없습니다")).toHaveCount(0);
  await expect(page.getByText("계정이 없습니다")).toHaveCount(0);
});
