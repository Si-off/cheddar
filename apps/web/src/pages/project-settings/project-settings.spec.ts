import { expect, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  groups,
  project,
  projectSettings,
  screenDrafts,
  screenIdRuleDrafts,
  screens,
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
    "GET /api/v1/projects/p1/screen-id-rules/r1/next": {
      screenId: "PC_SIGNUP_03",
    },
    "POST /api/v1/projects/p1/screens": reply(201, {
      ...screens[0],
      id: "s4",
      screenId: "PC_SIGNUP_03",
      name: "가입 완료",
      parentId: "s1",
    }),
  });
  await page.goto("/projects/p1/screens");
  await expect(page.getByText("규칙 불일치")).toHaveCount(1);

  await page.getByRole("button", { name: "회원가입 작업" }).click();
  await expect(page.getByRole("menuitem", { name: "삭제" })).toBeDisabled();
  await page.getByRole("menuitem", { name: "편집" }).click();
  await page.getByRole("combobox", { name: "상위 화면" }).click();
  await expect(page.getByRole("option", { name: /약관 동의/ })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /주문서/ })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "취소" }).click();

  // 규칙이 있으면 다음 번호를 붙인 ID를 미리 채운다
  await page.getByRole("button", { name: "화면 추가" }).first().click();
  await expect(page.getByRole("textbox", { name: "화면 ID" })).toHaveValue(
    "PC_SIGNUP_03",
  );
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
      screenId: "PC_SIGNUP_03",
      name: "가입 완료",
      type: "page",
      parentId: "s1",
      description: "",
    });
});

test("화면 ID 규칙: 예시 ID를 부분별로 보여주고 메뉴에서 확인 뒤 지운다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "DELETE /api/v1/projects/p1/screen-id-rules/r1": reply(204),
  });
  await page.goto("/projects/p1/screens");
  const rule = page
    .getByRole("list", { name: "화면 ID 규칙" })
    .getByRole("listitem");
  await expect(rule).toContainText("PC");
  await expect(rule).toContainText("SIGNUP");
  await expect(rule).toContainText("01");
  await rule.getByRole("button", { name: "기본 작업" }).click();
  await page.getByRole("menuitem", { name: "삭제" }).click();
  await page
    .getByRole("dialog", { name: "기본 삭제" })
    .getByRole("button", { name: "삭제" })
    .click();
  await expect
    .poll(() =>
      calls.some(
        (c) => c.key === "DELETE /api/v1/projects/p1/screen-id-rules/r1",
      ),
    )
    .toBe(true);
});

test("화면 ID 규칙 추가: 파일을 넣으면 AI 초안을 고르고 고친 뒤 고른 규칙만 저장한다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "POST /api/v1/projects/p1/screen-id-rules/drafts": screenIdRuleDrafts,
    "POST /api/v1/projects/p1/screen-id-rules": (
      _route: unknown,
      body: unknown,
    ) => reply(201, { ...(body as object), id: "r9", example: "" }),
  });
  await page.goto("/projects/p1/screens");
  await page.getByRole("button", { name: "규칙 추가" }).first().click();
  const dialog = page.getByRole("dialog", { name: "규칙 추가" });
  const make = dialog.getByRole("button", { name: "규칙 만들기" });
  await expect(make).toBeDisabled();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "IA.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("xlsx"),
  });
  await expect(dialog.getByRole("list", { name: "첨부한 파일" })).toContainText(
    "IA.xlsx",
  );
  await make.click();
  await expect
    .poll(
      () =>
        calls.find(
          (c) => c.key === "POST /api/v1/projects/p1/screen-id-rules/drafts",
        )?.body,
    )
    .toContain('filename="IA.xlsx"');

  const found = dialog.getByRole("list", { name: "찾은 규칙" });
  await expect(found.getByRole("listitem")).toHaveCount(2);
  await found.getByRole("button", { name: /앱 화면 ID/ }).click();
  await expect(dialog.getByRole("group", { name: "예시 ID" })).toContainText(
    "0101",
  );
  // 고른 부분의 코드 뜻을 그 자리에서 고친다
  // 한 글자 부분도 가운데를 눌러 고를 수 있다(모서리 메뉴가 가리지 않는다)
  const channel = dialog.getByRole("button", { name: "U 채널" });
  await channel.click();
  await expect(channel).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "CS 영역" }).click();
  await dialog.getByRole("button", { name: "뜻 고객지원" }).click();
  await dialog.getByRole("textbox", { name: "뜻 입력" }).fill("고객 지원");
  await dialog.getByRole("textbox", { name: "뜻 입력" }).press("Enter");
  await found.getByRole("checkbox", { name: "관리자 화면 ID 추가" }).click();
  await dialog.getByRole("button", { name: "규칙 1개 추가" }).click();

  await expect(dialog).toHaveCount(0);
  const saved = calls.filter(
    (c) => c.key === "POST /api/v1/projects/p1/screen-id-rules",
  );
  expect(saved).toHaveLength(1);
  expect(saved[0]?.body).toMatchObject({
    name: "앱 화면 ID",
    separator: "_",
  });
  const { parts } = (saved[0]?.body ?? { parts: [] }) as {
    parts: { codes: { meaning: string }[] }[];
  };
  expect(parts[3]?.codes[0]?.meaning).toBe("고객 지원");
});

test("화면 ID 규칙 추가: 직접 만들기는 빈 편집기로 가고, 자료가 없으면 오류를 그 자리에 보인다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "POST /api/v1/projects/p1/screen-id-rules/drafts": reply(422, {
      error: {
        code: "SCREEN_IDS_NOT_FOUND",
        message:
          "화면 ID를 찾지 못했습니다. 화면 ID가 있는 파일을 넣어 주세요.",
        requestId: "t",
      },
    }),
  });
  await page.goto("/projects/p1/screens");
  await page.getByRole("button", { name: "규칙 추가" }).first().click();
  const dialog = page.getByRole("dialog", { name: "규칙 추가" });
  await dialog
    .getByRole("textbox", { name: "화면 ID 자료" })
    .fill("회원가입 화면");
  await dialog.getByRole("button", { name: "규칙 만들기" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "화면 ID를 찾지 못했습니다. 화면 ID가 있는 파일을 넣어 주세요.",
  );
  await dialog.getByRole("button", { name: "직접 만들기" }).click();
  await expect(
    page.getByRole("dialog", { name: /화면 ID 규칙/ }).getByRole("group", {
      name: "예시 ID",
    }),
  ).toBeVisible();
});

test("화면 가져오기: 모듈별로 고르고, 이미 있는 화면은 빼며, 고르지 않은 상위 화면은 건너뛰어 잇는다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...projectSettings(),
    "POST /api/v1/projects/p1/screens/drafts": screenDrafts,
    "POST /api/v1/projects/p1/screens/batch": reply(201, {
      created: 8,
      skipped: 0,
    }),
  });
  await page.goto("/projects/p1/screens");
  await page.getByRole("button", { name: "가져오기" }).click();
  const dialog = page.getByRole("dialog", { name: "화면 가져오기" });
  await dialog
    .getByRole("textbox", { name: "화면 자료" })
    .fill("U_SP_0103_CS_PG_001 고객지원");
  await dialog.getByRole("button", { name: "가져오기" }).click();

  const table = dialog.getByRole("table", { name: "가져올 화면" });
  await expect(
    dialog.getByText("앱 화면 목록.pdf 파일을 읽지 못했습니다."),
  ).toBeVisible();
  await expect(dialog.getByText("ID 없는 화면 13개 제외")).toBeVisible();
  await expect(
    table.getByRole("checkbox", { name: "마스터 쿠폰 관리 선택" }),
  ).toBeDisabled();
  await expect(table.getByText("있음")).toHaveCount(1);
  await expect(table.getByText("규칙 불일치")).toHaveCount(1);
  await expect(
    dialog.getByRole("button", { name: "화면 9개 추가" }),
  ).toBeVisible();

  // 묶음을 접어도 고른 상태는 남는다
  await table.getByRole("button", { name: /^홈/ }).click();
  await expect(table.getByText("eSIM 사용 가이드")).toHaveCount(0);
  await table
    .getByRole("checkbox", { name: "마스터 쿠폰 등록/수정 선택" })
    .click();
  await dialog.getByRole("button", { name: "화면 8개 추가" }).click();

  await expect(dialog).toHaveCount(0);
  const body = calls.find(
    (c) => c.key === "POST /api/v1/projects/p1/screens/batch",
  )?.body as { items: { screenId: string; parentScreenId: string | null }[] };
  expect(body.items.map((i) => i.screenId)).not.toContain("PC_CPN_LIST_PG_001");
  expect(body.items.map((i) => i.screenId)).not.toContain("PC_CPN_REG_PG_001");
  expect(
    body.items.find((i) => i.screenId === "PC_CPN_SELECT_PO_001")
      ?.parentScreenId,
  ).toBe("PC_CPN_LIST_PG_001");
  expect(
    body.items.find((i) => i.screenId === "U_SP_0103_ES_BT_001")
      ?.parentScreenId,
  ).toBe("U_SP_0103_ES_PG_001");
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
    "GET /api/v1/auth/me": me({ role: "member" }),
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
