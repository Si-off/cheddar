import { expect, type Route, test } from "@playwright/test";
import { API, me, mockApi, reply } from "../../shared/testing/mock-api";
import { template } from "../../shared/testing/project-fixtures";
import {
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

const projects = {
  items: [
    {
      id: "p1",
      name: "mobi",
      description: "",
      columnCount: 6,
      screenCount: 0,
      canManage: true,
    },
  ],
};
const UPLOAD = "10000000-0000-4000-8000-0000000000a1";
const frame = (id: string, name: string) => ({ id, name, imageCount: 1 });
const upload = (frames: ReturnType<typeof frame>[]) => ({
  id: UPLOAD,
  expiresAt: "2026-10-27T10:00:00Z",
  frames,
});
const pay = [
  frame("10000000-0000-4000-8000-000000000f01", "결제 수단 선택"),
  frame("10000000-0000-4000-8000-000000000f02", "카드 등록"),
  frame("10000000-0000-4000-8000-000000000f03", "결제 완료"),
];
const image = frame("10000000-0000-4000-8000-000000000f04", "알림 설정.png");
const PAY_LINK =
  "https://www.figma.com/design/AbCdEf1234567/mobi?node-id=12-34";

test("토큰을 등록하면 기다리던 Figma 링크를 읽고, 이미지와 함께 생성에 쓴다", async ({
  page,
}) => {
  let token: unknown = null;
  let current = upload([]);
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/projects": projects,
    "GET /api/v1/projects/p1/template": template,
    "GET /api/v1/projects/p1/recent-test-set-template": {
      testSet: null,
      columns: [],
    },
    "GET /api/v1/figma-token": () => ({ token }),
    "PUT /api/v1/figma-token": (_: Route, body: unknown) => {
      if ((body as { token: string }).token !== "figd_good-1234")
        return reply(400, {
          error: {
            code: "FIGMA_TOKEN_INVALID",
            message: "Figma 토큰을 확인하지 못했습니다.",
            requestId: "t",
          },
        });
      token = { handle: "최하늘", email: "h@example.com", tokenSuffix: "1234" };
      return { token };
    },
    [`GET /api/v1/temp-uploads/${UPLOAD}`]: () => current,
    "POST /api/v1/temp-uploads/figma": () => {
      if (token) current = upload(pay);
      return token
        ? reply(201, {
            upload: current,
            addedFrameIds: pay.map((f) => f.id),
            title: "결제 플로우",
            omittedCount: 0,
          })
        : reply(409, {
            error: {
              code: "FIGMA_TOKEN_REQUIRED",
              message: "Figma 토큰을 등록해주세요.",
              requestId: "t",
            },
          });
    },
    "POST /api/v1/temp-uploads/images": () => {
      current = upload([...pay, image]);
      return reply(201, {
        upload: current,
        addedFrameIds: [image.id],
        omittedCount: 0,
      });
    },
    "POST /api/v1/test-sets": reply(201, testSet),
    "POST /api/v1/test-sets/t1/generations": reply(202, { jobId: "j1" }),
    ...testSetResponses(),
  });
  await page.route(`${API}/api/v1/temp-uploads/*/frames/*/thumbnail`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/svg+xml",
      headers: { "access-control-allow-origin": "*" },
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#f1f2f6"/><rect x="24" y="32" width="160" height="16" fill="#c8ccd7"/></svg>',
    }),
  );
  await page.goto("/test-sets/new");
  await page.getByRole("textbox", { name: "테스트 세트 이름" }).fill("2.4.0");
  const generate = page.getByRole("button", { name: "케이스 생성" });
  await expect(generate).toBeDisabled();
  await test.info().attach("비어 있음", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });

  // 토큰이 없으면 링크는 남겨 두고 등록을 권한다
  const link = page.getByRole("textbox", { name: "Figma 링크" });
  await link.fill(PAY_LINK);
  await link.press("Enter");
  await expect(
    page.getByText("Figma 토큰이 없어 링크 1개를 읽지 못했습니다"),
  ).toBeVisible();
  await test.info().attach("토큰 없음", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "토큰 등록" }).click();
  const dialog = page.getByRole("dialog", { name: "Figma 토큰", exact: true });
  await expect(dialog.getByRole("link", { name: "발급 방법" })).toHaveAttribute(
    "href",
    "/guides/figma-token",
  );
  await dialog.getByLabel("개인 액세스 토큰").fill("figd_wrong");
  await dialog.getByRole("button", { name: "등록" }).click();
  await expect(dialog.getByText("토큰을 확인하지 못했습니다")).toBeVisible();
  await test.info().attach("토큰 확인 실패", {
    body: await page.screenshot(),
    contentType: "image/png",
  });
  await dialog.getByLabel("개인 액세스 토큰").fill("figd_good-1234");
  await dialog.getByRole("button", { name: "등록" }).click();
  await expect(dialog).toBeHidden();

  // 등록하면 기다리던 링크를 다시 읽는다
  await expect(page.getByText("결제 플로우")).toBeVisible();
  await expect(page.getByText("3개 중 3개 선택")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "알림 설정.png",
    mimeType: "image/png",
    buffer: Buffer.from("png"),
  });
  await expect(page.getByText("4개 중 4개 선택")).toBeVisible();
  await test.info().attach("자료 넣음", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  const sent = calls.filter((c) => c.key === "POST /api/v1/temp-uploads/figma");
  expect(sent.at(-1)?.body).toEqual({ url: PAY_LINK });

  // 링크 칩을 빼면 그 링크의 프레임은 생성에 넣지 않는다
  await page.getByRole("button", { name: "결제 플로우 빼기" }).click();
  await expect(page.getByText("1개 중 1개 선택")).toBeVisible();
  await generate.click();
  await expect
    .poll(
      () =>
        calls.find((c) => c.key === "POST /api/v1/test-sets/t1/generations")
          ?.body,
    )
    .toMatchObject({
      kind: "initial",
      uploadId: UPLOAD,
      frameIds: [image.id],
    });
});

test("Figma 토큰 발급 방법을 단계별로 보여주고 바로 등록한다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/figma-token": { token: null },
  });
  await page.goto("/guides/figma-token");
  await expect(
    page.getByRole("heading", { name: "Figma 토큰 발급" }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(5);
  await test.info().attach("발급 방법", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "토큰 등록" }).click();
  await expect(
    page.getByRole("dialog", { name: "Figma 토큰", exact: true }),
  ).toBeVisible();
});
