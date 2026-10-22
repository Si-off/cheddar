import { expect, test } from "@playwright/test";
import { me, mockApi, reply } from "../../shared/testing/mock-api";

const TOKEN = "r".repeat(43);
const path = `/api/v1/plugin-connections/requests/${TOKEN}`;

test("로그인한 계정으로 플러그인 연결을 승인한다", async ({ page }) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    [`GET ${path}`]: { status: "pending" },
    [`POST ${path}/approve`]: reply(204),
  });
  await page.goto(`/plugin-connect?request=${TOKEN}`);
  await expect(page.getByText("최하늘(haneul.choi)")).toBeVisible();
  await page.getByRole("button", { name: "연결" }).click();
  await expect(page.getByText("플러그인을 연결했습니다")).toBeVisible();
  expect(calls.some((c) => c.key === `POST ${path}/approve`)).toBe(true);
});

test("만료된 요청은 플러그인에서 다시 로그인하라고 알린다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    [`GET ${path}`]: { status: "expired" },
  });
  await page.goto(`/plugin-connect?request=${TOKEN}`);
  await expect(page.getByText("연결 요청이 만료되었습니다")).toBeVisible();
  await expect(page.getByRole("button", { name: "연결" })).toHaveCount(0);
});

test("승인이 실패하면 이유를 보여주고 다시 누를 수 있다", async ({ page }) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    [`GET ${path}`]: { status: "pending" },
    [`POST ${path}/approve`]: reply(500, {
      error: {
        code: "INTERNAL",
        message: "요청을 처리하지 못했습니다.",
        requestId: "t",
      },
    }),
  });
  await page.goto(`/plugin-connect?request=${TOKEN}`);
  await page.getByRole("button", { name: "연결" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "요청을 처리하지 못했습니다.",
  );
  await expect(page.getByRole("button", { name: "연결" })).toBeEnabled();
});
