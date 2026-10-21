import { expect, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  groups,
  project,
  projectSettings,
  template,
} from "../../shared/testing/project-fixtures";

test("양식: 사전 정의 열은 켜고 끄기만 하고, 사용자 열은 선택 항목을 채워야 추가되며, 저장하면 revision과 함께 보낸다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "PUT /api/v1/projects/p1/template": (_route: unknown, body: unknown) => ({
      ...(body as object),
      revision: 4,
    }),
  });
  await page.goto("/projects/p1");
  await expect(page).toHaveURL(/\/projects\/p1\/template$/);

  // 테스트 ID와 제목은 끌 수 없고, 사전 정의 열에는 작업 메뉴가 없다
  await expect(page.getByRole("switch", { name: "테스트 ID" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "수행 절차 작업" }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "추가 정보" }).click();

  await page.getByRole("button", { name: "열 추가", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "사용자 열 추가" });
  await dialog.getByRole("textbox", { name: "이름" }).fill("테스트 데이터");
  await dialog.getByRole("radio", { name: "단일 선택" }).click();
  await dialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(dialog.getByText("빈 선택 항목이 있습니다")).toBeVisible();
  await dialog.getByRole("textbox", { name: "선택 항목 이름" }).fill("계정 A");
  await dialog.getByRole("button", { name: "추가", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByText("저장했습니다").first()).toBeVisible();
  const body = calls.find((c) => c.key === "PUT /api/v1/projects/p1/template")
    ?.body as typeof template;
  expect(body.revision).toBe(3);
  expect(body.columns.map((c) => [c.name, c.enabled])).toEqual([
    ["테스트 ID", true],
    ["제목", true],
    ["수행 절차", true],
    ["추가 정보", true],
    ["우선순위", true],
    ["테스트 데이터", true],
  ]);
  expect(body.columns[5]).toMatchObject({
    presetKey: null,
    type: "select",
    options: ["계정 A"],
  });
});

test("기능 그룹: 추가하고, 손잡이에서 아래 화살표로 순서를 바꾼다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "POST /api/v1/projects/p1/feature-groups": reply(201, {
      id: "g3",
      name: "장바구니",
      description: "",
    }),
    "PUT /api/v1/projects/p1/feature-groups/order": { items: groups },
  });
  await page.goto("/projects/p1/feature-groups");
  await page.getByRole("button", { name: "기능 그룹 추가" }).first().click();
  const addDialog = page.getByRole("dialog", { name: "기능 그룹 추가" });
  await addDialog.getByRole("textbox", { name: "그룹 이름" }).fill("장바구니");
  await addDialog.getByRole("button", { name: "추가" }).click();
  await expect
    .poll(
      () =>
        calls.find((c) => c.key === "POST /api/v1/projects/p1/feature-groups")
          ?.body,
    )
    .toEqual({ name: "장바구니", description: "" });

  await page.getByRole("button", { name: "회원가입 순서 이동" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(
      () =>
        calls.find(
          (c) => c.key === "PUT /api/v1/projects/p1/feature-groups/order",
        )?.body,
    )
    .toEqual({ ids: ["g2", "g1"] });
});

test("화면 구조: 하위 화면이 있으면 지울 수 없고, 자기 하위를 상위 화면으로 고를 수 없다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "POST /api/v1/projects/p1/screens": reply(201, {
      id: "s4",
      screenId: "SIGNUP-DONE",
      name: "가입 완료",
      parentId: "s1",
      description: "",
    }),
  });
  await page.goto("/projects/p1/screens");
  await expect(
    page.getByText("하위 화면 1개가 있어 삭제할 수 없습니다"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "삭제" })).toBeDisabled();
  await page.getByRole("combobox", { name: "상위 화면" }).click();
  await expect(page.getByRole("option", { name: /약관 동의/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /주문서/ })).toHaveCount(1);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "화면 추가" }).click();
  await page.getByRole("textbox", { name: "화면 ID" }).fill("SIGNUP-DONE");
  await page.getByRole("textbox", { name: "이름" }).fill("가입 완료");
  await page.getByRole("combobox", { name: "상위 화면" }).click();
  await page.getByRole("option", { name: /회원가입/ }).click();
  await page.getByRole("button", { name: "추가", exact: true }).click();
  await expect
    .poll(
      () =>
        calls.find((c) => c.key === "POST /api/v1/projects/p1/screens")?.body,
    )
    .toEqual({
      screenId: "SIGNUP-DONE",
      name: "가입 완료",
      parentId: "s1",
      description: "",
    });
});

test("메모: 입력을 멈추면 저장하고 저장됨을 보여준다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "PUT /api/v1/projects/p1/memo": (_route: unknown, body: unknown) => ({
      ...(body as object),
      updatedAt: "2026-10-19T00:00:00Z",
      updatedBy: { id: "a1", name: "최하늘" },
    }),
  });
  await page.goto("/projects/p1/memo");
  await page
    .getByRole("textbox", { name: "프로젝트 메모" })
    .fill("QA 환경: stage.shop.example.com");
  await expect(page.getByRole("status").getByText("저장됨")).toBeVisible();
  const puts = calls.filter((c) => c.key === "PUT /api/v1/projects/p1/memo");
  expect(puts).toHaveLength(1);
  expect(puts[0]?.body).toEqual({ body: "QA 환경: stage.shop.example.com" });
});

test("프로젝트 설정 관리 권한이 없으면 설정을 볼 수만 있다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(["test_set.create"]),
    ...projectSettings({
      "GET /api/v1/projects/p1": { ...project, canManage: false },
    }),
  });
  await page.goto("/projects/p1/template");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "열 추가", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "추가 정보" })).toBeDisabled();
  await page.getByRole("link", { name: "기능 그룹" }).click();
  await expect(page.getByText("회원가입")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "기능 그룹 추가" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "회원가입 작업" })).toHaveCount(
    0,
  );
});

test("기본 양식: 다른 사람이 먼저 저장했으면 입력을 남긴 채 최신 양식을 불러올 수 있다", async ({
  page,
}) => {
  let latest = false;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings({
      "GET /api/v1/projects/p1/template": () =>
        latest
          ? {
              ...template,
              revision: 4,
              columns: [
                ...template.columns,
                {
                  id: "c-other",
                  presetKey: null,
                  systemKey: null,
                  enabled: true,
                  name: "다른 사람 항목",
                  type: "text",
                  description: "",
                  options: [],
                },
              ],
            }
          : template,
    }),
    "PUT /api/v1/projects/p1/template": () => {
      latest = true;
      return reply(409, {
        error: {
          code: "TEMPLATE_CONFLICT",
          message: "다른 사람이 먼저 저장했습니다.",
          requestId: "t",
        },
      });
    },
  });
  await page.goto("/projects/p1/template");
  await page.getByRole("switch", { name: "추가 정보" }).click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("최신 양식을 불러오면 지금 입력한 내용은 사라집니다."),
  ).toBeVisible();
  await expect(page.getByRole("switch", { name: "추가 정보" })).toBeChecked();

  await page.getByRole("button", { name: "최신 양식 불러오기" }).click();
  await expect(
    page.getByRole("switch", { name: "다른 사람 항목" }),
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "추가 정보" }),
  ).not.toBeChecked();
  await expect(
    page.getByText("최신 양식을 불러오면 지금 입력한 내용은 사라집니다."),
  ).toHaveCount(0);
});

test("메모: 저장에 실패하면 저절로 다시 보내지 않고 다시 저장을 누르면 보낸다", async ({
  page,
}) => {
  let fail = true;
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "PUT /api/v1/projects/p1/memo": (_route: unknown, body: unknown) =>
      fail
        ? reply(503, {
            error: {
              code: "DEPENDENCY_UNAVAILABLE",
              message: "데이터를 읽거나 저장하지 못했습니다.",
              requestId: "t",
            },
          })
        : { ...(body as object), updatedAt: null, updatedBy: null },
  });
  await page.goto("/projects/p1/memo");
  await page
    .getByRole("textbox", { name: "프로젝트 메모" })
    .fill("배포 주기: 격주");
  await expect(page.getByRole("button", { name: "다시 저장" })).toBeVisible();
  await page.waitForTimeout(1500);
  const puts = () =>
    calls.filter((c) => c.key === "PUT /api/v1/projects/p1/memo");
  expect(puts()).toHaveLength(1);

  fail = false;
  await page.getByRole("button", { name: "다시 저장" }).click();
  await expect(page.getByRole("status").getByText("저장됨")).toBeVisible();
  expect(puts()).toHaveLength(2);
});

test("기본 양식: 고치는 중에 다른 사람이 저장하면 입력을 그대로 두고 알린다", async ({
  page,
}) => {
  let newer = false;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings({
      "GET /api/v1/projects/p1/template": () =>
        newer ? { ...template, revision: 4 } : template,
    }),
  });
  await page.goto("/projects/p1/template");
  await page.getByRole("switch", { name: "추가 정보" }).click();

  newer = true;
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByText("저장된 양식이 바뀌었습니다")).toBeVisible();
  await expect(page.getByRole("switch", { name: "추가 정보" })).toBeChecked();
});

test("메모: 저장을 기다리는 중에 다른 탭으로 가도 입력을 저장한다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "PUT /api/v1/projects/p1/memo": (_route: unknown, body: unknown) => ({
      ...(body as object),
      updatedAt: null,
      updatedBy: null,
    }),
  });
  await page.goto("/projects/p1/memo");
  await page
    .getByRole("textbox", { name: "프로젝트 메모" })
    .fill("테스트 카드로만 결제");
  await page.getByRole("link", { name: "기능 그룹" }).click();
  await expect
    .poll(
      () => calls.find((c) => c.key === "PUT /api/v1/projects/p1/memo")?.body,
    )
    .toEqual({ body: "테스트 카드로만 결제" });
});

test("프로젝트 정보에서 이름과 설명을 바꾼다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "PATCH /api/v1/projects/p1": (_route: unknown, body: unknown) => ({
      ...project,
      ...(body as object),
    }),
  });
  await page.goto("/projects/p1/template");
  await page.getByRole("button", { name: "프로젝트 작업" }).click();
  await page.getByRole("menuitem", { name: "프로젝트 정보" }).click();
  const dialog = page.getByRole("dialog", { name: "프로젝트 정보" });
  await dialog
    .getByRole("textbox", { name: "프로젝트 이름" })
    .fill("쇼핑몰 앱 2.0");
  await dialog.getByRole("button", { name: "저장" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "쇼핑몰 앱 2.0" }),
  ).toBeVisible();
  expect(
    calls.find((c) => c.key === "PATCH /api/v1/projects/p1")?.body,
  ).toEqual({ name: "쇼핑몰 앱 2.0", description: "모바일 쇼핑 앱" });
});
