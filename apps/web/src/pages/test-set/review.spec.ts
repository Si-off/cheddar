import { expect, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  cases,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

const item = {
  id: "ri1",
  reason: "탈퇴 후 재가입 제한 기간이 화면과 설명에 없습니다.",
  question: "재가입 제한 기간",
  answer: "",
  draft: {
    "c-title": "탈퇴한 회원의 이메일로 다시 가입할 수 없다",
    "c-exp": "",
    "c-pri": "높음",
  },
  status: "pending",
};

const second = {
  ...item,
  id: "ri2",
  reason: "메일 발송 여부를 화면에서 확인할 수 없습니다.",
  question: null,
  draft: { "c-title": "가입 완료 메일이 발송된다" },
};

test("확인 필요 항목을 고쳐 테스트 세트에 추가하고, 다른 항목은 제외한다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/generations/current": null,
      "GET /api/v1/test-sets/t1/review-items": { items: [item, second] },
      "PATCH /api/v1/review-items/ri1": (_route: unknown, body: unknown) => ({
        ...item,
        ...(body as object),
      }),
      "PATCH /api/v1/review-items/ri2": (_route: unknown, body: unknown) => ({
        ...second,
        ...(body as object),
      }),
      "POST /api/v1/review-items/ri1/accept": (
        _route: unknown,
        body: unknown,
      ) => ({
        item: { ...item, status: "resolved" },
        case: {
          id: "k3",
          values: {
            ...(body as { draft: object }).draft,
            "c-id": "TC-003",
          },
        },
        version: 3,
      }),
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: /확인 필요/ }).click();
  const panel = page.getByRole("complementary", { name: "확인 필요" });
  await expect(panel.getByText(item.reason)).toBeVisible();

  await panel
    .getByRole("textbox", { name: "예상 결과" })
    .fill("재가입 제한 안내");
  await panel.getByRole("textbox", { name: "예상 결과" }).blur();
  await expect
    .poll(
      () => calls.find((c) => c.key === "PATCH /api/v1/review-items/ri1")?.body,
    )
    .toMatchObject({ draft: { "c-exp": "재가입 제한 안내" } });

  await panel.getByRole("button", { name: "테스트 세트에 추가" }).click();
  await expect(
    page.getByText("테스트 세트에 추가했습니다").first(),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "케이스" })).toContainText(
    "TC-003",
  );
  // 처리하면 다음 남은 항목으로 넘어간다
  await expect(panel.getByText(second.reason)).toBeVisible();
  await panel.getByRole("button", { name: "제외" }).click();
  await expect
    .poll(
      () => calls.find((c) => c.key === "PATCH /api/v1/review-items/ri2")?.body,
    )
    .toEqual({ status: "excluded" });
  expect(cases.length).toBe(2);
});

test("질문에 답하고 다시 작성하면 끝난 뒤 새 초안을 보여준다", async ({
  page,
}) => {
  let rewritten = false;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/generations/current": null,
      "GET /api/v1/test-sets/t1/review-items": () => ({
        items: [
          rewritten
            ? {
                ...item,
                answer: "30일",
                draft: { ...item.draft, "c-exp": "30일 동안 재가입 제한 안내" },
              }
            : item,
        ],
      }),
      "POST /api/v1/review-items/ri1/rewrite": () => {
        rewritten = true;
        return reply(202, { jobId: "j9" });
      },
    }),
  });
  await page.route("**/api/v1/generations/j9/events", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
      },
      contentType: "text/event-stream",
      body: 'event: done\ndata: {"status":"succeeded","addedCount":0,"reviewCount":1}\n\n',
    }),
  );
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: /확인 필요/ }).click();
  const panel = page.getByRole("complementary", { name: "확인 필요" });
  await expect(
    panel.getByRole("button", { name: "답변으로 다시 작성" }),
  ).toBeDisabled();
  await panel.getByRole("textbox", { name: "재가입 제한 기간" }).fill("30일");
  await panel.getByRole("button", { name: "답변으로 다시 작성" }).click();
  await expect(panel.getByRole("textbox", { name: "예상 결과" })).toHaveValue(
    "30일 동안 재가입 제한 안내",
  );
});

test("케이스 추가 생성은 설명만으로도 시작하고 진행 화면으로 간다", async ({
  page,
}) => {
  let started = false;
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/generations/current": () =>
        started
          ? {
              jobId: "j2",
              kind: "append",
              status: "running",
              stage: "screens",
              addedCount: 0,
              reviewCount: 0,
              errorMessage: null,
            }
          : null,
      "GET /api/v1/test-sets/t1/review-items": { items: [] },
      "POST /api/v1/test-sets/t1/generations": () => {
        started = true;
        return reply(202, { jobId: "j2" });
      },
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: "케이스 추가 생성" }).click();
  const sheet = page.getByRole("dialog", { name: "케이스 추가 생성" });
  await expect(sheet.getByRole("button", { name: "생성 시작" })).toBeDisabled();
  await sheet
    .getByRole("textbox", { name: "설명" })
    .fill("쿠폰 만료일은 가입일로부터 7일");
  await sheet.getByRole("button", { name: "생성 시작" }).click();
  await expect(page).toHaveURL(/\/test-sets\/t1\/generating$/);
  expect(
    calls.find((c) => c.key === "POST /api/v1/test-sets/t1/generations")?.body,
  ).toEqual({ kind: "append", memo: "쿠폰 만료일은 가입일로부터 7일" });
});

test("모두 제외해도 확인 필요 버튼이 남아 되돌릴 수 있다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/review-items": {
        items: [{ ...item, status: "excluded" }],
      },
      "PATCH /api/v1/review-items/ri1": (_route: unknown, body: unknown) => ({
        ...item,
        ...(body as object),
      }),
    }),
  });
  await page.goto("/test-sets/t1");
  await page.getByRole("button", { name: /확인 필요/ }).click();
  const panel = page.getByRole("complementary", { name: "확인 필요" });
  await panel.getByRole("button", { name: "되돌리기" }).click();
  await expect
    .poll(
      () => calls.find((c) => c.key === "PATCH /api/v1/review-items/ri1")?.body,
    )
    .toEqual({ status: "pending" });
});
