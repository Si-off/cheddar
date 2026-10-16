import { expect, type Locator, type Page, test } from "@playwright/test";
import type {
  AnalysisDto,
  GenerationDto,
  ReviewGenerationResultDto,
  StartGenerationDto,
  TestScenarioSnapshotDto,
} from "@/shared/api/generated";

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed())
    await page.screenshot({
      path: testInfo.outputPath("final-state.png"),
      fullPage: true,
      animations: "disabled",
    });
});

const projectId = "10000000-0000-4000-8000-000000000001",
  testScenarioId = "20000000-0000-4000-8000-000000000001",
  uploadId = "60000000-0000-4000-8000-000000000001";
const fields = [
  "caseCode",
  "title",
  "preconditions",
  "steps",
  "expectedResult",
  "priority",
  "relatedFrames",
  "screens",
] as const;
const frames = [0, 1].map((n) => ({
  id: `70000000-0000-4000-8000-00000000000${n + 1}`,
  name: n ? "결제 완료" : "주문서",
  figmaFileKey: "source-key",
  figmaNodeId: `1:${n + 1}`,
  width: 400,
  height: 800,
  imageFileId: `80000000-0000-4000-8000-00000000000${n + 1}`,
  dataFileId: `90000000-0000-4000-8000-00000000000${n + 1}`,
  uploadId,
}));
function fixture(): TestScenarioSnapshotDto {
  const columns = fields.map((field, index) => ({
    id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    ...(field === "caseCode" || field === "title"
      ? { kind: "system" as const, field }
      : {
          kind: "custom" as const,
          valueType:
            field === "priority" ? ("select" as const) : ("text" as const),
          ...(field === "priority"
            ? {
                options: [
                  { id: "00000000-0000-4000-8000-000000000001", name: "높음" },
                  { id: "00000000-0000-4000-8000-000000000002", name: "보통" },
                  { id: "00000000-0000-4000-8000-000000000003", name: "낮음" },
                ],
              }
            : {}),
        }),
    name: [
      "테스트 ID",
      "테스트 항목",
      "사전 조건",
      "수행 절차",
      "예상 결과",
      "우선순위",
      "관련 화면",
      "화면 ID",
    ][index],
  }));
  return {
    id: testScenarioId,
    projectId,
    name: "주문 테스트",
    kind: "unit",
    uploadId,
    contentRevision: 1,
    viewRevision: 1,
    sourceTemplateRevision: 1,
    createdAt: "2026-10-16T00:00:00Z",
    updatedAt: "2026-10-16T00:00:00Z",
    columns,
    view: columns.map((c) => ({ columnId: c.id, width: 180 })),
    cases: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        caseCode: "TC-001",
        title: "쿠폰 적용",

        relatedFrameIds: [frames[0].id],
        screenIds: [],
        customValues: {
          "30000000-0000-4000-8000-000000000004": "쿠폰을 선택한다.",
          "30000000-0000-4000-8000-000000000005": "기존 예상 결과",
        },
      },
    ],
    references: { frames, iaItems: [] },
  };
}
async function setup(page: Page) {
  const requirementId = "a0000000-0000-4000-8000-000000000001",
    questionId = "a0000000-0000-4000-8000-000000000002";
  const state = {
    snapshot: fixture(),
    jobs: [] as GenerationDto[],
    starts: [] as StartGenerationDto[],
    reviews: [] as ReviewGenerationResultDto[],
    analysis: {
      revision: 1,
      items: [
        {
          id: requirementId,
          kind: "requirement",
          title: "쿠폰 할인",
          text: "쿠폰은 상품 금액에서 차감한다.",
          frameId: frames[0].id,
          nodeId: "1:5",
          region: { x: 0, y: 0, width: 1, height: 1 },
        },
        {
          id: questionId,
          kind: "question",
          title: "결제 실패 후 쿠폰 처리",
          text: "결제 실패 시 쿠폰 처리 정책을 확인한다.",
          frameId: frames[0].id,
          useAsRule: false,
        },
      ],
      links: [],
    } as AnalysisDto,
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    if (path.endsWith("/generation/providers"))
      return json({
        items: [
          { id: "anthropic", model: "synthetic", configured: true },
          { id: "openai", model: "synthetic", configured: true },
        ],
      });
    if (path.endsWith("/analysis")) {
      if (method === "PUT") {
        state.analysis = {
          ...request.postDataJSON(),
          revision: state.analysis.revision + 1,
        };
      }
      return json(state.analysis);
    }
    if (path.includes("/files/"))
      return route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="800"><rect width="400" height="800" fill="#fff"/><g font-family="sans-serif" fill="#1d2433"><text x="24" y="45" font-size="24">주문서</text><text x="24" y="150" font-size="20">상품 금액 30,000원</text><text x="24" y="220" font-size="20">쿠폰 할인 3,000원</text><text x="24" y="300" font-size="24">결제 금액 27,000원</text></g></svg>',
      });
    if (path.endsWith(`/uploads/${uploadId}`))
      return json({
        id: uploadId,
        projectId,
        name: "주문 화면",
        createdAt: "2026-10-16T00:00:00Z",
        frames,
      });
    if (path.endsWith("/uploads"))
      return json({
        items: [{ id: uploadId, name: "주문 화면", frameCount: 2 }],
        nextCursor: null,
      });
    if (path.endsWith("/ia-items")) return json({ items: [] });
    if (path.endsWith("/generations") && method === "POST") {
      state.starts.push(request.postDataJSON());
      const job: GenerationDto = {
        id: crypto.randomUUID(),
        testScenarioId,
        mode: request.postDataJSON().mode,
        provider: "anthropic",
        model: "synthetic",
        status: "succeeded",
        error: null,
        revision: 1,
        caseCount: 1,
        createdAt: new Date().toISOString(),
        results: [
          {
            id: "50000000-0000-4000-8000-000000000001",
            kind: "case",
            status: "added",
            reason: "",
            requirementIds: [requirementId],
            content: {
              ...structuredClone(state.snapshot.cases[0]),
              id: "50000000-0000-4000-8000-000000000001",
              caseCode: "",
              customValues: {
                ...state.snapshot.cases[0].customValues,
                "30000000-0000-4000-8000-000000000005": "쿠폰 금액이 차감된다.",
              },
            },
          },
        ],
      };
      const clear = job.results[0];
      state.snapshot.cases.push({
        ...structuredClone(clear.content),
        caseCode: "TC-002",
      });
      state.snapshot.contentRevision++;
      state.analysis.links.push({
        requirementId,
        testScenarioId,
        caseId: clear.id,
      });
      job.results.push({
        ...clear,
        id: questionId,
        kind: "candidate",
        status: "pending",
        reason: "결제 실패 시 쿠폰 처리 정책을 확인한다.",
        content: {
          ...structuredClone(clear.content),
          id: questionId,
          caseCode: "",
          title: "결제 실패 후 쿠폰 처리",
        },
      });
      state.jobs.unshift(job);
      return json(job, 202);
    }
    if (path.endsWith("/generations")) return json({ items: state.jobs });
    if (path.endsWith("/add")) {
      const body = request.postDataJSON();
      const job = state.jobs[0];
      for (const c of job.results.filter((c) =>
        body.resultIds.includes(c.id),
      )) {
        state.snapshot.cases.push({ ...c.content, caseCode: "TC-002" });
        c.status = "added";
        state.analysis.links.push({
          requirementId,
          testScenarioId,
          caseId: c.id,
        });
      }
      state.snapshot.contentRevision++;
      job.revision++;
      return json(job, 201);
    }
    if (path.includes("/results/")) {
      const body = request.postDataJSON() as ReviewGenerationResultDto;
      state.reviews.push(body);
      const job = state.jobs.find((item) => path.includes(item.id));
      const candidate = job?.results.find((item) => path.endsWith(item.id));
      if (!job || !candidate) return json({}, 404);
      if (
        body.expectedRevision !== job.revision ||
        (body.question &&
          body.question.expectedRevision !== state.analysis.revision)
      )
        return json(
          {
            error: {
              message: "확인 항목이 변경되었습니다. 최신 내용을 확인해주세요.",
            },
          },
          409,
        );
      if (body.content) candidate.content = body.content;
      if (body.action === "add") {
        state.snapshot.cases.push({
          ...candidate.content,
          caseCode: `TC-00${state.snapshot.cases.length + 1}`,
        });
        state.snapshot.contentRevision++;
        candidate.status = "added";
        if (body.question) {
          const question = state.analysis.items.find(
            (item) => item.id === candidate.id,
          );
          if (question)
            Object.assign(question, {
              answer: body.question.answer,
              useAsRule: body.question.useAsRule,
            });
          state.analysis.revision++;
        }
        state.analysis.links.push({
          requirementId,
          testScenarioId,
          caseId: candidate.id,
        });
      } else if (body.action === "exclude") candidate.status = "excluded";
      else if (body.action === "restore") candidate.status = "pending";
      job.revision++;
      return json(job);
    }
    if (path.endsWith("/content")) {
      const body = request.postDataJSON();
      state.snapshot = {
        ...state.snapshot,
        ...body,
        contentRevision: state.snapshot.contentRevision + 1,
      };
      return json(state.snapshot);
    }
    if (path.endsWith(`/test-scenarios/${testScenarioId}`))
      return json(state.snapshot);
    if (path.endsWith("/test-scenarios"))
      return json({ items: [state.snapshot], nextCursor: null });
    if (path.endsWith(`/projects/${projectId}`))
      return json({ id: projectId, name: "쇼핑몰" });
    if (path.endsWith("/projects"))
      return json({
        items: [{ id: projectId, name: "쇼핑몰" }],
        nextCursor: null,
      });
    return json({ items: [], nextCursor: null });
  });
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("heading", { name: "주문 테스트", exact: true }),
  ).toBeVisible();
  return state;
}
async function generate(page: Page) {
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .first()
    .click();
  await page
    .getByRole("checkbox", { name: "결제 완료 생성 선택", exact: true })
    .uncheck();
  await page.getByLabel("테스트 내용", { exact: true }).fill("쿠폰 적용");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /^확인 항목/ }).first(),
  ).toBeVisible();
}
async function confirmations(page: Page) {
  await page
    .getByRole("button", { name: /^확인 항목/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "확인 항목", exact: true }),
  ).toBeVisible();
}
async function confirmationFrame(page: Page) {
  const dialog = page.getByRole("dialog", { name: "확인 항목", exact: true });
  await expect(
    dialog.getByRole("heading", { name: "확인 항목", exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "닫기", exact: true }),
  ).toBeInViewport();
  await expect(
    dialog.getByRole("button", { name: "시나리오에 추가", exact: true }),
  ).toBeInViewport();
}
test("명확한 케이스는 자동 추가하고 확인 항목은 답변과 수정 후 한 번에 추가한다", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await generate(page);
  expect(state.starts[0].mode).toBe("append");
  expect(state.starts[0].frameIds).toEqual([frames[0].id]);
  expect(state.snapshot.cases).toHaveLength(2);
  expect(
    state.snapshot.cases[0].customValues[
      "30000000-0000-4000-8000-000000000005"
    ],
  ).toBe("기존 예상 결과");
  await confirmations(page);
  await page.getByText("근거 자료", { exact: true }).click();
  await expect(
    page.getByText("쿠폰은 상품 금액에서 차감한다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "주문서", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "쿠폰 적용 추가 대기" }),
  ).toHaveCount(0);
  await page
    .getByLabel("확인 답변", { exact: true })
    .fill("결제 실패 시 쿠폰을 복원한다.");
  await page
    .getByRole("checkbox", { name: "프로젝트 규칙으로 저장", exact: true })
    .check();
  await page
    .getByLabel("예상 결과", { exact: true })
    .fill("쿠폰을 다시 사용할 수 있다.");
  await confirmationFrame(page);
  await page.screenshot({
    path: testInfo.outputPath("confirmation-edit.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "시나리오에 추가", exact: true })
    .click();
  await expect.poll(() => state.snapshot.cases.length).toBe(3);
  expect(state.reviews).toHaveLength(1);
  expect(state.reviews[0].action).toBe("add");
  expect(
    state.snapshot.cases[2].customValues[
      "30000000-0000-4000-8000-000000000005"
    ],
  ).toBe("쿠폰을 다시 사용할 수 있다.");
  expect(state.analysis.items[1].answer).toBe("결제 실패 시 쿠폰을 복원한다.");
  expect(state.analysis.items[1].useAsRule).toBe(true);
  await expect(
    page.getByText("확인 항목이 없습니다.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("confirmation-complete.png"),
    fullPage: true,
  });
});
test("확인 항목 초안은 닫기와 새로고침 후 복원하고 다른 수정과 충돌하면 비교 후 반영한다", async ({
  page,
}) => {
  const state = await setup(page);
  await generate(page);
  const legacyId = "50000000-0000-4000-8000-000000000009";
  const legacy = structuredClone(state.jobs[0]);
  legacy.id = "50000000-0000-4000-8000-000000000008";
  legacy.mode = "review";
  legacy.results = [
    {
      ...legacy.results[0],
      id: legacyId,
      status: "pending",
      content: {
        ...legacy.results[0].content,
        id: legacyId,
        title: "이전 결과",
      },
    },
  ];
  state.jobs.push(legacy);
  await page.reload();
  await confirmations(page);
  await page.getByLabel("예상 결과", { exact: true }).fill("초안 예상 결과");
  await page.getByLabel("확인 답변", { exact: true }).fill("초안 답변");
  await page
    .getByRole("button", { name: "이전 결과 추가 대기", exact: true })
    .click();
  await expect(page.getByLabel("테스트 항목", { exact: true })).toHaveValue(
    "이전 결과",
  );
  await page
    .getByRole("button", {
      name: "결제 실패 후 쿠폰 처리 확인 대기",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("예상 결과", { exact: true })).toHaveValue(
    "초안 예상 결과",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  state.jobs[0].revision++;
  state.jobs[0].results[1].content.customValues[
    "30000000-0000-4000-8000-000000000005"
  ] = "다른 곳 수정";
  await page.reload();
  await confirmations(page);
  await expect(page.getByLabel("예상 결과", { exact: true })).toHaveValue(
    "초안 예상 결과",
  );
  await expect(page.getByLabel("확인 답변", { exact: true })).toHaveValue(
    "초안 답변",
  );
  await expect(
    page.getByRole("button", { name: "시나리오에 추가", exact: true }),
  ).toBeDisabled();
  await page.getByText("최신 내용 비교", { exact: true }).click();
  await expect(page.getByText("다른 곳 수정", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "최신 내용 확인 후 초안 유지", exact: true })
    .click();
  await page
    .getByRole("button", { name: "시나리오에 추가", exact: true })
    .click();
  await expect.poll(() => state.snapshot.cases.length).toBe(3);
  expect(
    state.snapshot.cases[2].customValues[
      "30000000-0000-4000-8000-000000000005"
    ],
  ).toBe("초안 예상 결과");
  expect(state.reviews[0].expectedRevision).toBe(state.jobs[0].revision - 1);
});
test("초안 보관 실패 시 항목을 전환해도 오류와 재시도를 유지하고 보관 후 닫는다", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await generate(page);
  const extra = structuredClone(state.jobs[0].results[0]);
  extra.id = "50000000-0000-4000-8000-000000000009";
  extra.status = "pending";
  extra.kind = "candidate";
  extra.reason = "추가 확인";
  extra.content = { ...extra.content, id: extra.id, title: "이전 확인 항목" };
  state.jobs[0].results.push(extra);
  await confirmations(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("cheddar-confirmation-drafts-v2:"))
        throw new DOMException("Full", "QuotaExceededError");
      return original.call(this, key, value);
    };
    Object.assign(window, {
      restoreDraftStorage: () => {
        Storage.prototype.setItem = original;
      },
    });
  });
  await page
    .getByLabel("예상 결과", { exact: true })
    .fill("보관 실패 후 입력 유지");
  await confirmationFrame(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "초안을 보관하지 못했습니다" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "초안 보관 다시 시도", exact: true }),
  ).toBeInViewport();
  await page
    .getByRole("button", { name: "이전 확인 항목 확인 대기", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "초안을 보관하지 못했습니다" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "초안 보관 다시 시도", exact: true }),
  ).toBeInViewport();
  await confirmationFrame(page);
  await page.screenshot({
    path: testInfo.outputPath("draft-storage-error-after-switch.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", {
      name: "결제 실패 후 쿠폰 처리 확인 대기",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "초안을 보관하지 못했습니다" }),
  ).toBeInViewport();
  await confirmationFrame(page);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "확인 항목", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("예상 결과", { exact: true })).toHaveValue(
    "보관 실패 후 입력 유지",
  );
  await page.evaluate(() =>
    (
      window as unknown as { restoreDraftStorage: () => void }
    ).restoreDraftStorage(),
  );
  await page
    .getByRole("button", { name: "초안 보관 다시 시도", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
});
async function modalReady(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await dialog.evaluate(async (element) => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .filter((animation) =>
          Number.isFinite(
            Number(animation.effect?.getComputedTiming().activeDuration),
          ),
        )
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}
async function analysisFrame(dialog: Locator) {
  await expect(
    dialog.getByRole("heading", { name: "화면 분석", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole("button", { name: "닫기", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    dialog.getByRole("button", { name: "저장", exact: true }),
  ).toBeInViewport({ ratio: 1 });
}
test("분석 결과 편집에서 정책 답변과 테스트 케이스 연결을 저장하고 같은 화면에서 보완한다", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  const url = page.url();
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await page.getByRole("button", { name: "화면 분석", exact: true }).click();
  const analysis = page.getByRole("dialog", { name: "화면 분석", exact: true });
  await modalReady(analysis);
  await analysisFrame(analysis);
  await analysis
    .getByRole("button", { name: "확인 질문", exact: true })
    .click();
  await analysis
    .getByLabel("답변", { exact: true })
    .fill("결제 실패 시 쿠폰을 다시 사용할 수 있다.");
  await analysisFrame(analysis);
  await analysis.getByRole("button", { name: "저장", exact: true }).click();
  await expect
    .poll(() => state.analysis.items[1].answer)
    .toContain("다시 사용할");
  expect(state.analysis.items[1].useAsRule).toBe(false);
  await analysis
    .getByRole("button", { name: "요구사항 연결", exact: true })
    .click();
  await analysis
    .getByRole("button", { name: "쿠폰 할인", exact: true })
    .click();
  await analysis
    .getByRole("checkbox", { name: "쿠폰 적용", exact: true })
    .check();
  await analysisFrame(analysis);
  await analysis.getByRole("button", { name: "저장", exact: true }).click();
  await expect.poll(() => state.analysis.links.length).toBe(1);
  await modalReady(analysis);
  await analysisFrame(analysis);
  await page.screenshot({
    path: testInfo.outputPath("requirement-links.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await analysis
    .getByRole("button", { name: "확인 질문", exact: true })
    .click();
  await analysis
    .getByLabel("답변", { exact: true })
    .fill(
      "결제 실패 시 쿠폰을 다시 사용할 수 있다.\n쿠폰 유효기간은 유지한다.",
    );
  await analysisFrame(analysis);
  await analysis.getByRole("button", { name: "저장", exact: true }).click();
  await expect
    .poll(() => state.analysis.items[1].answer)
    .toContain("쿠폰 유효기간은 유지한다.");
  await modalReady(analysis);
  await analysisFrame(analysis);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("analysis-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await analysis
    .getByRole("button", { name: "답변으로 생성", exact: true })
    .click();
  await expect(analysis).toHaveCount(0);
  const generation = page.getByRole("dialog", {
    name: "테스트 케이스 생성",
    exact: true,
  });
  await modalReady(generation);
  await expect(
    generation.getByLabel("테스트 내용", { exact: true }),
  ).toHaveValue(/쿠폰을 다시 사용할/);
  await expect(
    generation.getByRole("heading", {
      name: "테스트 케이스 생성",
      exact: true,
    }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    generation.getByRole("button", { name: "닫기", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect(page.url()).toBe(url);
  await page.screenshot({
    path: testInfo.outputPath("policy-refinement.png"),
    fullPage: true,
    animations: "disabled",
  });
});
