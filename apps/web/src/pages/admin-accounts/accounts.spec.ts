import { expect, type Route, test } from "@playwright/test";
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
    loginId: "woojin.jung@bsoft.kr",
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
    .getByRole("textbox", { name: "아이디" })
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
    loginId: "woojin.jung@bsoft.kr",
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
    .getByRole("textbox", { name: "아이디" })
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

test("만료일을 바꾸지 않고 저장하면 서버의 만료 시각을 그대로 둔다", async ({
  page,
}) => {
  const external = account({
    id: "a6",
    name: "정우진",
    expiresAt: "2026-12-01T01:30:00Z",
    assignments: [{ roleId: "r3", scope: "global", projectIds: [] }],
  });
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts/a6": external,
    "PATCH /api/v1/accounts/a6": external,
  });
  await page.goto("/admin/accounts/a6");
  await page.getByRole("textbox", { name: "이름" }).fill("정우진B");
  await page.getByRole("button", { name: "저장" }).click();
  await expect(page.getByText("저장했습니다").first()).toBeVisible();
  const kept = calls.find((c) => c.key === "PATCH /api/v1/accounts/a6")
    ?.body as Record<string, unknown>;
  expect(kept.name).toBe("정우진B");
  expect(kept).not.toHaveProperty("expiresAt");

  await page.getByLabel("만료일").fill("2027-01-15");
  await page.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(() => calls.filter((c) => c.key === "PATCH /api/v1/accounts/a6"))
    .toHaveLength(2);
  const changed = calls.filter((c) => c.key === "PATCH /api/v1/accounts/a6")[1]
    ?.body as Record<string, unknown>;
  expect(changed.expiresAt).toBe(new Date("2027-01-15T23:59:59").toISOString());
});

test("자동으로 채운 만료일은 역할이 바뀌면 가장 짧은 기본 기간으로 다시 계산하고, 직접 고친 날짜는 그대로 둔다", async ({
  page,
}) => {
  const shortRole = {
    id: "r6",
    name: "단기 참여자",
    fixed: false,
    requiresExpiry: true,
    defaultExpiryDays: 30,
    permissions: ["test_set.export" as const],
  };
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": [...roles, shortRole],
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts": { items: [], total: 0 },
  });
  const after = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };
  await page.goto("/admin/accounts");
  await page.getByRole("button", { name: "계정 만들기" }).click();
  const dialog = page.getByRole("dialog");
  const expiry = dialog.getByLabel("만료일");
  const roleSelects = dialog.getByRole("combobox", { name: "역할" });
  // 앞서 닫은 선택 목록이 사라진 뒤에 다음 목록을 연다
  const pickRole = async (row: number, name: string) => {
    await roleSelects.nth(row).click();
    await page.getByRole("option", { name }).click();
    await expect(page.getByRole("listbox")).toHaveCount(0);
  };

  await dialog.getByRole("button", { name: "역할 추가" }).click();
  await pickRole(0, "외부 참여자");
  await expect(expiry).toHaveValue(after(90));

  await dialog.getByRole("button", { name: "역할 추가" }).click();
  await pickRole(1, "단기 참여자");
  await expect(expiry).toHaveValue(after(30));

  await dialog.getByRole("button", { name: "역할 할당 제거" }).nth(1).click();
  await expect(expiry).toHaveValue(after(90));

  await expiry.fill("2027-03-01");
  await dialog.getByRole("button", { name: "역할 추가" }).click();
  await pickRole(1, "단기 참여자");
  await expect(expiry).toHaveValue("2027-03-01");
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
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
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
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
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

test("역할 범위를 프로젝트 지정으로 바꾸면 고른 프로젝트로 저장한다", async ({
  page,
}) => {
  const member = account({
    id: "a7",
    name: "박민수",
    assignments: [{ roleId: "r3", scope: "global", projectIds: [] }],
    expiresAt: "2027-01-16T14:59:59Z",
  });
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts/a7": member,
    "PATCH /api/v1/accounts/a7": member,
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
  });
  await page.goto("/admin/accounts/a7");
  await page.getByRole("button", { name: "범위: 전체" }).click();
  const panel = page.getByRole("dialog", { name: "적용 범위" });
  await expect(panel.getByRole("button", { name: "완료" })).toBeEnabled();
  await panel.getByRole("radio", { name: "프로젝트 지정" }).click();
  await expect(panel.getByRole("button", { name: "완료" })).toBeDisabled();
  await panel.getByRole("textbox", { name: "프로젝트 검색" }).fill("결재");
  await expect(
    panel.getByRole("checkbox", { name: "쇼핑몰 앱 리뉴얼" }),
  ).toHaveCount(0);
  await panel.getByRole("checkbox", { name: "사내 결재 시스템" }).click();
  await panel.getByRole("button", { name: "완료" }).click();
  await expect(
    page.getByRole("button", { name: "범위: 사내 결재 시스템" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "저장" }).click();
  await expect
    .poll(() => calls.find((c) => c.key === "PATCH /api/v1/accounts/a7")?.body)
    .toMatchObject({
      assignments: [{ roleId: "r3", scope: "projects", projectIds: ["p2"] }],
    });
});

test("비활성 계정이 소유한 테스트 세트는 활성 계정을 찾아 소유자를 넘긴다", async ({
  page,
}) => {
  const leaver = account({ id: "a8", name: "이서연", status: "inactive" });
  const kim = account({
    id: "a2",
    name: "김지은",
    loginId: "jieun.kim@cheddar.app",
  });
  let owned = [
    { id: "t1", name: "2.3.1 장바구니 합치기", projectName: "쇼핑몰" },
  ];
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts/a8": leaver,
    "GET /api/v1/accounts/a8/owned-test-sets": () => ({ items: owned }),
    "GET /api/v1/accounts": { items: [kim], total: 1 },
    "POST /api/v1/accounts/a8/owned-test-sets/t1/owner": () => {
      owned = [];
      return reply(204);
    },
  });
  await page.goto("/admin/accounts/a8");
  await page.getByRole("button", { name: "소유자 넘기기" }).click();
  const dialog = page.getByRole("dialog", { name: "소유자 넘기기" });
  await dialog.getByRole("textbox", { name: "새 소유자" }).fill("김");
  await dialog.getByRole("button", { name: /김지은/ }).click();
  await dialog.getByRole("button", { name: "넘기기" }).click();
  await expect(page.getByText("소유자를 넘겼습니다")).toBeVisible();
  await expect(page.getByText("2.3.1 장바구니 합치기")).toHaveCount(0);
  expect(
    calls.find(
      (c) => c.key === "POST /api/v1/accounts/a8/owned-test-sets/t1/owner",
    )?.body,
  ).toEqual({ accountId: "a2" });
});

test("활성 계정의 소유 테스트 세트는 넘길 수 없다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/roles": roles,
    "GET /api/v1/affiliations": affiliations,
    "GET /api/v1/accounts/a1": account(),
    "GET /api/v1/accounts/a1/owned-test-sets": {
      items: [{ id: "t1", name: "2.4.0 회원가입 개편", projectName: "쇼핑몰" }],
    },
  });
  await page.goto("/admin/accounts/a1");
  await expect(page.getByText("2.4.0 회원가입 개편")).toBeVisible();
  await expect(page.getByRole("button", { name: "소유자 넘기기" })).toHaveCount(
    0,
  );
});
