import { expect, type Page, test } from "@playwright/test";
import { API, me, mockApi, reply } from "../../shared/testing/mock-api";
import {
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

const uploadId = "0f1e2d3c-4b5a-4968-8776-655443322110";

/** 생성 진행을 SSE로 흉내 낸다. 이벤트를 한 번에 보내고 연결을 닫는다. */
async function mockEvents(page: Page, events: string) {
  await page.route(`${API}/api/v1/generations/*/events`, (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
        "cache-control": "no-cache",
      },
      contentType: "text/event-stream",
      body: events,
    }),
  );
}

const running = {
  jobId: "j1",
  kind: "initial",
  status: "running",
  stage: "screens",
  addedCount: 0,
  reviewCount: 0,
  errorMessage: null,
};

test("진행 이벤트를 받은 뒤 이전 단계로 돌아가며 깜빡이지 않는다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets/t1": testSet,
    "GET /api/v1/test-sets/t1/generations/current": running,
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`${API}/api/v1/generations/*/events`, async (route) => {
    await ready;
    await route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": "http://127.0.0.1:5173",
        "access-control-allow-credentials": "true",
      },
      contentType: "text/event-stream",
      body: 'event: progress\ndata: {"stage":"cases","status":"running"}\n\n',
    });
  });
  await page.goto("/test-sets/t1/generating");
  const steps = page.getByRole("list", { name: "진행 단계" });
  await expect(steps.locator('[aria-current="step"]')).toHaveText(
    "화면 살펴보기",
  );
  await steps.evaluate((element) => {
    const history: string[] = [];
    (window as Window & { stageHistory?: string[] }).stageHistory = history;
    new MutationObserver(() => {
      const label =
        element.querySelector('[aria-current="step"]')?.textContent ?? "";
      if (history.at(-1) !== label) history.push(label);
    }).observe(element, { subtree: true, attributes: true, childList: true });
  });
  release();
  await expect(steps.locator('[aria-current="step"]')).toHaveText(
    "테스트 케이스 작성하기",
  );
  // 진행 상태가 다시 렌더링된 뒤에도 이전 단계가 잠깐 표시되지 않아야 한다.
  await page.waitForTimeout(500);
  const history = await page.evaluate(
    () => (window as Window & { stageHistory?: string[] }).stageHistory ?? [],
  );
  expect(history).toContain("테스트 케이스 작성하기");
  expect(
    history.slice(history.indexOf("테스트 케이스 작성하기")),
  ).not.toContain("화면 살펴보기");
});

test("플러그인에서 올린 프레임으로 케이스를 생성하면 진행 단계를 보여준 뒤 테스트 세트를 연다", async ({
  page,
}) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets": { items: [] },
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
      ],
    },
    [`GET /api/v1/temp-uploads/${uploadId}`]: {
      id: uploadId,
      expiresAt: "2026-10-19T09:00:00Z",
      frames: [
        { id: "f1", name: "회원가입_시작", imageCount: 0 },
        { id: "f2", name: "회원가입_이메일", imageCount: 0 },
      ],
    },
    "POST /api/v1/test-sets": reply(201, testSet),
    ...testSetResponses({
      "POST /api/v1/test-sets/t1/generations": reply(202, { jobId: "j1" }),
      "GET /api/v1/test-sets/t1/generations/current": running,
    }),
  });
  await mockEvents(
    page,
    [
      'event: progress\ndata: {"stage":"flows","status":"running"}\n\n',
      'event: progress\ndata: {"stage":"cases","status":"running"}\n\n',
      'event: done\ndata: {"status":"succeeded","addedCount":2,"reviewCount":1}\n\n',
    ].join(""),
  );
  await page.goto(`/test-sets/new?upload=${uploadId}`);
  await expect(page.getByText("회원가입_이메일")).toBeVisible();
  await page
    .getByRole("textbox", { name: "테스트 세트 이름" })
    .fill(testSet.name);
  await page.getByRole("textbox", { name: "메모" }).fill("휴대폰 인증 추가");
  await page.getByRole("button", { name: "케이스 생성" }).click();

  await expect(
    page.getByText("케이스 2개를 추가했습니다. 확인 필요 1건이 있습니다"),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/test-sets\/t1$/);
  expect(
    calls.find((c) => c.key === "POST /api/v1/test-sets/t1/generations")?.body,
  ).toEqual({ kind: "initial", uploadId, memo: "휴대폰 인증 추가" });
});

test("생성 진행 화면은 단계만 보여주고, 실패하면 이유를 알린다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets/t1": testSet,
    "GET /api/v1/test-sets/t1/generations/current": {
      ...running,
      stage: "cases",
    },
  });
  await mockEvents(
    page,
    'event: done\ndata: {"status":"failed","errorMessage":"AI 응답을 받지 못했습니다. 잠시 뒤 다시 시도하세요."}\n\n',
  );
  await page.goto("/test-sets/t1/generating");
  await expect(page.getByText("케이스를 만들지 못했습니다")).toBeVisible();
  await expect(
    page.getByText("AI 응답을 받지 못했습니다. 잠시 뒤 다시 시도하세요."),
  ).toBeVisible();
  await page.getByRole("link", { name: "테스트 세트로 이동" }).click();
  await expect(page).toHaveURL(/\/test-sets\/t1$/);
});

test("진행 중인 단계까지 체크가 그려지고 지금 단계만 강조한다", async ({
  page,
}) => {
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    "GET /api/v1/test-sets/t1": testSet,
    "GET /api/v1/test-sets/t1/generations/current": {
      ...running,
      stage: "cases",
    },
  });
  // 끝 이벤트 없이 연결만 유지한다
  await mockEvents(page, ": keep-alive\n\n");
  await page.goto("/test-sets/t1/generating");
  const steps = page.getByRole("list", { name: "진행 단계" });
  await expect(steps.getByRole("listitem")).toHaveCount(4);
  await expect(steps.locator('[aria-current="step"]')).toHaveText(
    "테스트 케이스 작성하기",
  );
});

test("생성 시작 응답을 받지 못하면 진행 화면에서 작업이 나타나기를 기다렸다가 이어서 보여준다", async ({
  page,
}) => {
  let polls = 0;
  await mockApi(page, {
    "GET /api/v1/auth/me": me(),
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
      ],
    },
    [`GET /api/v1/temp-uploads/${uploadId}`]: {
      id: uploadId,
      expiresAt: "2026-10-19T09:00:00Z",
      frames: [{ id: "f1", name: "회원가입_시작", imageCount: 0 }],
    },
    "POST /api/v1/test-sets": reply(201, testSet),
    ...testSetResponses({
      // 첫 조회에는 아직 작업이 보이지 않는다
      "GET /api/v1/test-sets/t1/generations/current": () =>
        ++polls < 2 ? null : running,
    }),
  });
  await page.route(`${API}/api/v1/test-sets/t1/generations`, (route) =>
    route.request().method() === "POST" ? route.abort() : route.fallback(),
  );
  await mockEvents(
    page,
    'event: done\ndata: {"status":"succeeded","addedCount":3,"reviewCount":0}\n\n',
  );
  await page.goto(`/test-sets/new?upload=${uploadId}`);
  await page
    .getByRole("textbox", { name: "테스트 세트 이름" })
    .fill(testSet.name);
  await page.getByRole("button", { name: "케이스 생성" }).click();
  await expect(
    page
      .getByText(
        "테스트 세트는 만들었습니다. 생성이 시작됐는지 진행 상황을 확인하세요.",
      )
      .first(),
  ).toBeVisible();
  await expect(page.getByText("케이스 3개를 추가했습니다")).toBeVisible();
  await expect(page).toHaveURL(/\/test-sets\/t1$/);
});
