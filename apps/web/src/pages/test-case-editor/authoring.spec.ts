import { expect, type Page, test } from "@playwright/test";
import type {
  AnalysisDto,
  GenerationDto,
  StartGenerationDto,
  TestScenarioSnapshotDto,
} from "@/shared/api/generated";

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
    kind: "system" as const,
    field,
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
        preconditions: "",
        steps: "쿠폰을 선택한다.",
        expectedResult: "기존 예상 결과",
        priority: null,
        relatedFrameIds: [frames[0].id],
        screenIds: [],
        customValues: {},
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
        mode: "review",
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
            status: "pending",
            reason: "",
            requirementIds: [requirementId],
            content: {
              ...state.snapshot.cases[0],
              id: "50000000-0000-4000-8000-000000000001",
              caseCode: "",
              expectedResult: "쿠폰 금액이 차감된다.",
            },
          },
        ],
      };
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
      const body = request.postDataJSON(),
        job = state.jobs[0],
        candidate = job.results.find((c) => path.endsWith(c.id));
      if (candidate && body.action === "edit") candidate.content = body.content;
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
test("화면 선택 생성 결과를 비교하고 선택 추가하며 기존 테스트 케이스와 근거를 보존한다", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "결제 완료 생성 선택", exact: true })
    .uncheck();
  await page.getByLabel("테스트 내용", { exact: true }).fill("쿠폰 적용");
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "결과 검토", exact: true }),
  ).toBeVisible();
  expect(state.starts[0].frameIds).toEqual([frames[0].id]);
  expect(state.snapshot.cases).toHaveLength(1);
  await page.getByRole("button", { name: "결과 검토", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "생성 결과 검토", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("유사 테스트 케이스 비교", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", { name: "쿠폰 적용 선택", exact: true })
    .check();
  await page
    .getByLabel("예상 결과", { exact: true })
    .fill("사용자가 수정한 예상 결과");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await page
    .getByRole("button", { name: "1개 시나리오에 추가", exact: true })
    .click();
  await expect.poll(() => state.snapshot.cases.length).toBe(2);
  expect(state.snapshot.cases[0].expectedResult).toBe("기존 예상 결과");
  expect(state.snapshot.cases[1].expectedResult).toBe(
    "사용자가 수정한 예상 결과",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("checkbox", { name: "2행 선택", exact: true }).check();
  await page
    .getByRole("button", { name: "관련 자료 보기", exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "관련 자료 보기" })
      .getByText("쿠폰은 상품 금액에서 차감한다.", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("source-review.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "원본 닫기", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "관련 자료 보기", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("source-review-mobile.png"),
  });
});
test("분석 결과 편집에서 정책 답변과 테스트 케이스 연결을 저장하고 같은 화면에서 보완한다", async ({
  page,
}, testInfo) => {
  const state = await setup(page);
  const url = page.url();
  await page
    .getByRole("button", { name: "분석 결과 편집", exact: true })
    .click();
  await page.getByRole("button", { name: "정책 확인", exact: true }).click();
  await page
    .getByLabel("정책 답변", { exact: true })
    .fill("결제 실패 시 쿠폰을 다시 사용할 수 있다.");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect(state.analysis.items[1].answer).toContain("다시 사용할");
  expect(state.analysis.items[1].useAsRule).toBe(false);
  await page
    .getByRole("button", { name: "요구사항 검토", exact: true })
    .click();
  await page.getByRole("button", { name: "쿠폰 할인", exact: true }).click();
  await page.getByRole("checkbox", { name: "쿠폰 적용", exact: true }).check();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  expect(state.analysis.links).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("requirement-links.png") });
  await page.getByRole("button", { name: "정책 확인", exact: true }).click();
  await page
    .getByRole("button", { name: "검토 후보 보완", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "테스트 케이스 생성", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("테스트 내용", { exact: true })).toHaveValue(
    /쿠폰을 다시 사용할/,
  );
  expect(page.url()).toBe(url);
  await page.screenshot({ path: testInfo.outputPath("policy-refinement.png") });
});
