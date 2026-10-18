import { expect, test } from "@playwright/test";
import {
  account,
  affiliations,
  me,
  mockApi,
  reply,
  roles,
} from "../../shared/testing/mock-api";

test("만료일이 필요한 역할을 고르면 기본 기간으로 만료일이 채워지고, 만들면 초대 링크가 나온다", async ({
  page,
}) => {
  const created = account({
    id: "a9",
    name: "정우진",
    email: "woojin.jung@bsoft.kr",
    status: "invited",
    affiliation: affiliations[1],
  });
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts": { items: [account()], total: 1 },
    "POST /api/v1/accounts": reply(201, {
      token: "invite-token",
      expiresAt: "2026-10-25T00:00:00Z",
      account: created,
    }),
  });

  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "이름" }).fill("정우진");
  await dialog
    .getByRole("textbox", { name: "이메일" })
    .fill("woojin.jung@bsoft.kr");
  await dialog.getByRole("combobox", { name: "소속" }).click();
  await page.getByRole("option", { name: "A사" }).click();

  // 역할 없이 만들면 만료일이 필요 없다. 외부 참여자를 고르면 90일 뒤가 채워진다.
  await dialog.getByRole("button", { name: "역할 추가" }).click();
  await dialog.getByRole("combobox", { name: "역할" }).click();
  await page.getByRole("option", { name: "외부 참여자" }).click();
  const expected = new Date();
  expected.setDate(expected.getDate() + 90);
  const pad = (n: number) => String(n).padStart(2, "0");
  await expect(dialog.getByLabel("만료일")).toHaveValue(
    `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`,
  );

  await dialog.getByRole("button", { name: "만들기" }).click();
  const linkDialog = page.getByRole("dialog");
  await expect(
    linkDialog.getByRole("heading", { name: "초대 링크" }),
  ).toBeVisible();
  await expect(linkDialog.getByRole("textbox", { name: "링크" })).toHaveValue(
    /\/invite\?token=invite-token$/,
  );

  const body = calls.find((c) => c.key === "POST /api/v1/accounts")
    ?.body as Record<string, unknown>;
  expect(body).toMatchObject({
    name: "정우진",
    email: "woojin.jung@bsoft.kr",
    affiliationId: "af2",
    assignments: [{ roleId: "r3", scope: "global", projectIds: [] }],
  });
  expect(body.expiresAt).toEqual(expect.any(String));
});

test("만료일이 필요한 역할인데 만료일을 지우면 만들 수 없다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts": { items: [], total: 0 },
  });
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "이름" }).fill("정우진");
  await dialog
    .getByRole("textbox", { name: "이메일" })
    .fill("woojin.jung@bsoft.kr");
  await dialog.getByRole("combobox", { name: "소속" }).click();
  await page.getByRole("option", { name: "A사" }).click();
  await dialog.getByRole("button", { name: "역할 추가" }).click();
  await dialog.getByRole("combobox", { name: "역할" }).click();
  await page.getByRole("option", { name: "외부 참여자" }).click();
  await dialog.getByLabel("만료일").fill("");
  await dialog.getByRole("button", { name: "만들기" }).click();
  await expect(dialog.getByText("만료일을 입력하세요")).toBeVisible();
  expect(calls.some((c) => c.key === "POST /api/v1/accounts")).toBe(false);
});

test("관리 권한이 없으면 관리 화면 대신 접근 권한 없음을 보여준다", async ({
  page,
}) => {
  await mockApi(page, { "GET /api/v1/auth/me": me(["test_set.export"]) });
  await page.goto("/admin/accounts");
  await expect(page.getByText("접근 권한이 없습니다")).toBeVisible();
  await page.getByRole("button", { name: "계정 메뉴" }).click();
  await expect(page.getByRole("menuitem", { name: "관리" })).toHaveCount(0);
});

test("계정 목록을 불러오지 못하면 빈 목록 대신 다시 시도를 보여준다", async ({
  page,
}) => {
  let fail = true;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
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

test("초대 링크를 다시 발급하기 전에 이전 링크가 무효가 된다고 묻는다", async ({
  page,
}) => {
  const invited = account({ id: "a4", name: "정우진", status: "invited" });
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts/a4": invited,
    "POST /api/v1/accounts/a4/invitation": {
      token: "new-token",
      expiresAt: "2026-10-25T00:00:00Z",
    },
  });
  await page.goto("/admin/accounts/a4");
  await expect(page.getByRole("button", { name: "재설정 링크" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "계정 작업" }).click();
  await page.getByRole("menuitem", { name: "초대 링크 다시 발급" }).click();
  await expect(
    page.getByText("이전 초대 링크는 사용할 수 없게 됩니다."),
  ).toBeVisible();
  expect(
    calls.some((c) => c.key === "POST /api/v1/accounts/a4/invitation"),
  ).toBe(false);
  await page.getByRole("button", { name: "발급" }).click();
  await expect(page.getByRole("textbox", { name: "링크" })).toHaveValue(
    /token=new-token$/,
  );
});
