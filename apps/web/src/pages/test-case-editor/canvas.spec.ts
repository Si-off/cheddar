import { writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import type {
  CanvasSnapshotDto,
  FlowGenerationDto,
  TestScenarioSnapshotDto,
} from "@/shared/api/generated";

const uuid = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const projectId = uuid(1),
  scenarioId = uuid(2),
  tagA = uuid(30),
  tagB = uuid(31);
function fixture(count = 2): TestScenarioSnapshotDto {
  const columns: TestScenarioSnapshotDto["columns"] = [
    { id: uuid(10), kind: "system", field: "caseCode", name: "테스트 ID" },
    { id: uuid(11), kind: "system", field: "title", name: "테스트 항목" },
    { id: uuid(12), kind: "custom", name: "수행 절차", valueType: "text" },
    {
      id: uuid(13),
      kind: "custom",
      name: "분류",
      valueType: "tags",
      options: [
        { id: tagA, name: "로그인" },
        { id: tagB, name: "계정" },
      ],
    },
    { id: uuid(14), kind: "custom", name: "확인 여부", valueType: "checkbox" },
    {
      id: uuid(15),
      kind: "custom",
      name: "환경",
      valueType: "select",
      options: [{ id: uuid(32), name: "모바일" }],
    },
  ];
  return {
    id: scenarioId,
    projectId,
    name: "로그인 시나리오",
    kind: "integration",
    uploadId: null,
    contentRevision: 1,
    viewRevision: 1,
    sourceTemplateRevision: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    columns,
    view: columns.map((c) => ({ columnId: c.id, width: 200 })),
    cases: Array.from({ length: count }, (_, i) => ({
      id: uuid(100 + i),
      caseCode: `TC-${i + 1}`,
      title: i ? `비밀번호 오류 ${i}` : "정상 로그인",
      relatedFrameIds: [],
      screenIds: [],
      customValues: {
        [uuid(12)]:
          "1. 로그인 화면으로 이동한다.\n2. 계정과 비밀번호를 입력한다.\n3. 로그인 버튼을 누른다.\n홈 화면에서 사용자 이름이 표시되고 새로고침 후에도 로그인 상태가 유지된다.",
        [uuid(13)]: i ? [tagB] : [tagA, tagB],
        [uuid(14)]: i === 0,
        [uuid(15)]: uuid(32),
      },
    })),
    references: { frames: [], iaItems: [] },
  };
}
async function setup(page: Page, count = 2) {
  const control = {
    snapshot: fixture(count),
    canvas: {
      flowRevision: 1,
      layoutRevision: 1,
      flow: { steps: [], edges: [] },
      layout: { groupBy: null, positions: [], collapsed: [] },
      previous: null,
    } as CanvasSnapshotDto,
    reject: false,
    calls: [] as string[],
    jobs: [] as FlowGenerationDto[],
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    const conflict = () =>
      json(
        {
          error: {
            code: "REVISION_CONFLICT",
            message:
              "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
            requestId: "test",
          },
        },
        409,
      );
    if (path.endsWith("/generation/providers"))
      return json({
        items: [{ id: "anthropic", model: "test", configured: true }],
      });
    if (path.endsWith("/generations")) return json({ items: [] });
    if (path.endsWith("/flow-generations")) {
      if (request.method() === "POST") {
        const job: FlowGenerationDto = {
          id: uuid(80),
          status: "succeeded",
          provider: "anthropic",
          contentRevision: control.snapshot.contentRevision,
          flowRevision: control.canvas.flowRevision,
          layoutRevision: control.canvas.layoutRevision,
          result: {
            steps: [
              {
                id: uuid(70),
                title: "로그인",
                kind: "action",
                description: "",
                caseIds: [uuid(100)],
              },
            ],
            edges: [
              {
                id: uuid(71),
                from: uuid(70),
                to: uuid(70),
                condition: "재시도",
              },
            ],
          },
          error: null,
        };
        control.jobs = [job];
        return json(job, 201);
      }
      return json({ items: control.jobs });
    }
    if (path.endsWith("/canvas")) return json(control.canvas);
    if (path.endsWith("/flow/replace")) {
      const b = request.postDataJSON();
      if (
        b.contentRevision !== control.snapshot.contentRevision ||
        b.flowRevision !== control.canvas.flowRevision ||
        b.layoutRevision !== control.canvas.layoutRevision
      )
        return conflict();
      control.canvas = {
        ...control.canvas,
        flow: b.flow,
        layout: b.layout,
        flowRevision: control.canvas.flowRevision + 1,
        layoutRevision: control.canvas.layoutRevision + 1,
        previous: {
          id: uuid(81),
          flow: control.canvas.flow,
          layout: control.canvas.layout,
          caseLabels: Object.fromEntries(
            control.snapshot.cases.map((c) => [c.id, c.title]),
          ),
        },
      };
      return json(control.canvas, 201);
    }
    if (path.endsWith("/flow/restore")) {
      const p = control.canvas.previous;
      if (p)
        control.canvas = {
          ...control.canvas,
          flow: p.flow,
          layout: p.layout,
          previous: null,
          flowRevision: control.canvas.flowRevision + 1,
          layoutRevision: control.canvas.layoutRevision + 1,
        };
      return json(control.canvas, 201);
    }
    if (path.endsWith("/flow") || path.endsWith("/canvas-layout")) {
      control.calls.push(path);
      const b = request.postDataJSON();
      if (control.reject)
        return json(
          {
            error: {
              message: "흐름을 저장하지 못했습니다.",
              code: "DEPENDENCY_UNAVAILABLE",
            },
          },
          503,
        );
      if (path.endsWith("/flow")) {
        if (
          b.expectedRevision !== control.canvas.flowRevision ||
          b.contentRevision !== control.snapshot.contentRevision
        )
          return conflict();
        control.canvas.flow = b.flow;
        control.canvas.flowRevision++;
      } else {
        if (b.expectedRevision !== control.canvas.layoutRevision)
          return conflict();
        control.canvas.layout = b.layout;
        control.canvas.layoutRevision++;
      }
      return json(control.canvas);
    }
    if (path.endsWith("/content")) {
      const b = request.postDataJSON();
      if (b.expectedRevision !== control.snapshot.contentRevision)
        return conflict();
      control.snapshot = {
        ...control.snapshot,
        cases: b.cases,
        columns: b.columns,
        contentRevision: control.snapshot.contentRevision + 1,
      };
      const ids = new Set(control.snapshot.cases.map((c) => c.id));
      if (
        control.canvas.flow.steps.some((s) =>
          s.caseIds.some((id) => !ids.has(id)),
        )
      ) {
        control.canvas.flow.steps = control.canvas.flow.steps.map((s) => ({
          ...s,
          caseIds: s.caseIds.filter((id) => ids.has(id)),
        }));
        control.canvas.flowRevision++;
      }
      return json(control.snapshot);
    }
    if (path.endsWith("/view")) {
      control.snapshot.view = request.postDataJSON().columns;
      control.snapshot.viewRevision++;
      return json(control.snapshot);
    }
    if (path.endsWith("/test-scenarios"))
      return json({ items: [control.snapshot], nextCursor: null });
    if (path.endsWith(`/test-scenarios/${scenarioId}`))
      return json(control.snapshot);
    if (path.endsWith("/analysis"))
      return json({ revision: 0, items: [], links: [] });
    if (path.endsWith("/ia") || path.endsWith("/uploads"))
      return json({ items: [], nextCursor: null });
    if (path.endsWith(`/projects/${projectId}`))
      return json({ id: projectId, name: "캔버스 검증", revision: 1 });
    if (path.endsWith("/projects"))
      return json({
        items: [{ id: projectId, name: "캔버스 검증", revision: 1 }],
        nextCursor: null,
      });
    return json({}, 404);
  });
  return control;
}
async function open(page: Page) {
  await page.goto(`/projects/${projectId}/test-scenarios/${scenarioId}`);
  await page.getByRole("button", { name: "캔버스", exact: true }).click();
  await expect(page.getByLabel("묶음 기준")).toBeVisible();
}
test.afterEach(async ({ page }, info) => {
  await page.screenshot({
    path: info.outputPath("canvas.png"),
    fullPage: true,
  });
});

test("full cards preserve every custom field through zoom, tag grouping and case editing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const c = await setup(page);
  await open(page);
  await page.screenshot({ path: "/private/tmp/cheddar-canvas-full-cards.png" });
  const card = page.getByRole("article", {
    name: "TC-1 정상 로그인",
    exact: true,
  });
  await expect(card).toContainText("새로고침 후에도 로그인 상태가 유지된다.");
  await expect(card).toContainText("모바일");
  await expect(card).toContainText("체크");
  const original = await card.textContent();
  await page.getByRole("button", { name: "축소", exact: true }).click();
  await expect(card).toHaveText(original ?? "");
  await page.getByLabel("묶음 기준").selectOption(uuid(13));
  await expect(
    page.getByRole("article", { name: "TC-1 정상 로그인", exact: true }),
  ).toHaveCount(2);
  await expect.poll(() => c.canvas.layout.groupBy).toBe(uuid(13));
  expect(c.snapshot.cases).toHaveLength(2);
  await page.getByLabel("묶음 기준").selectOption("");
  await page.getByRole("button", { name: "TC-1 편집", exact: true }).click();
  await page.getByLabel("테스트 항목", { exact: true }).fill("수정한 로그인");
  await expect.poll(() => c.snapshot.cases[0].title).toBe("수정한 로그인");
  await expect(
    page.getByRole("article", { name: "TC-1 수정한 로그인", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect.poll(() => c.snapshot.cases[0].title).toBe("정상 로그인");
  await page.getByRole("button", { name: "표", exact: true }).click();
  await expect(page.getByRole("grid")).toContainText("정상 로그인");
});
test("manual steps, branching, retry, undo and save failure stay separate from case data", async ({
  page,
}) => {
  const c = await setup(page);
  const before = structuredClone(c.snapshot.cases);
  await open(page);
  await page.getByRole("button", { name: "흐름 보기", exact: true }).click();
  await page
    .getByRole("button", { name: "단계 추가", exact: true })
    .first()
    .click();
  await page.getByLabel("단계 이름", { exact: true }).fill("인증");
  await page.getByRole("checkbox", { name: "TC-1 정상 로그인" }).check();
  await expect.poll(() => c.canvas.flow.steps[0]?.caseIds).toEqual([uuid(100)]);
  await page.getByRole("button", { name: "연결 추가", exact: true }).click();
  await page.getByLabel("조건", { exact: true }).fill("재시도");
  await expect.poll(() => c.canvas.flow.edges[0]?.condition).toBe("재시도");
  expect(c.canvas.flow.edges[0].from).toBe(c.canvas.flow.edges[0].to);
  c.reject = true;
  await page.getByLabel("조건", { exact: true }).fill("실패 시 재시도");
  await expect(page.getByRole("alert")).toContainText(
    "흐름을 저장하지 못했습니다.",
  );
  expect(c.snapshot.cases).toEqual(before);
  c.reject = false;
  await page.getByRole("button", { name: "다시 저장", exact: true }).click();
  await expect
    .poll(() => c.canvas.flow.edges[0].condition)
    .toBe("실패 시 재시도");
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect.poll(() => c.canvas.flow.edges[0].condition).toBe("재시도");
  await page.getByRole("button", { name: "자동 정렬", exact: true }).click();
  await expect.poll(() => c.canvas.layout.positions.length).toBeGreaterThan(0);
  expect(c.snapshot.cases).toEqual(before);
});
test("AI drafts are manually reviewed before replacement and can be restored", async ({
  page,
}) => {
  const c = await setup(page);
  await open(page);
  await page.getByRole("button", { name: "흐름 보기", exact: true }).click();
  await page.getByRole("button", { name: "흐름 생성", exact: true }).click();
  const panel = page.getByRole("complementary", { name: "흐름 생성" });
  await expect(
    panel.getByRole("button", { name: "흐름 생성", exact: true }),
  ).toBeEnabled();
  await panel.getByRole("button", { name: "흐름 생성", exact: true }).click();
  await panel.getByRole("button", { name: "초안 검토" }).click();
  expect(c.canvas.flow.steps).toHaveLength(0);
  await page.getByRole("button", { name: "단계 편집", exact: true }).click();
  await page.getByLabel("단계 이름", { exact: true }).fill("직접 수정한 흐름");
  await page.getByRole("button", { name: "흐름 추가", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await expect
    .poll(() => c.canvas.flow.steps[0]?.title)
    .toBe("직접 수정한 흐름");
  await page
    .getByRole("button", { name: "이전 흐름 복원", exact: true })
    .click();
  await page.getByRole("button", { name: "복원", exact: true }).click();
  await expect.poll(() => c.canvas.flow.steps.length).toBe(0);
  expect(c.snapshot.cases).toHaveLength(2);
});
test("500 complete cards remain navigable and layout preserves all cases", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const c = await setup(page, 500);
  const start = Date.now();
  await open(page);
  await expect(page.locator(".canvas-case")).toHaveCount(500);
  const displayed = Date.now();
  await page.getByRole("button", { name: "자동 정렬", exact: true }).click();
  await expect.poll(() => c.canvas.layout.positions.length).toBe(501);
  const arranged = Date.now();
  const before = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await expect(page.locator(".react-flow__viewport")).not.toHaveAttribute(
    "style",
    before ?? "",
  );
  const zoomed = Date.now();
  expect(c.snapshot.cases).toHaveLength(500);
  await writeFile(
    info.outputPath("performance.json"),
    JSON.stringify({
      caseCount: 500,
      displayMs: displayed - start,
      layoutIncludingSaveMs: arranged - displayed,
      zoomMs: zoomed - arranged,
    }),
  );
  await info.attach("performance", {
    body: JSON.stringify({
      caseCount: 500,
      displayMs: displayed - start,
      layoutIncludingSaveMs: arranged - displayed,
      zoomMs: zoomed - arranged,
    }),
    contentType: "application/json",
  });
});

test("minimal form supports header dragging and wheel zoom without changing table data", async ({
  page,
}) => {
  const c = await setup(page);
  c.snapshot.columns = c.snapshot.columns.slice(0, 2);
  c.snapshot.view = c.snapshot.view.slice(0, 2);
  c.snapshot.cases = c.snapshot.cases.map((item) => ({
    ...item,
    customValues: {},
  }));
  const before = structuredClone(c.snapshot.cases);
  await open(page);
  await expect(page.locator(".canvas-case dt")).toHaveCount(0);
  const handle = page.locator(".canvas-case .canvas-drag").first();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 20, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(() => c.canvas.layout.positions.some((p) => p.id.includes(":case:")))
    .toBe(true);
  const prior = await page
    .locator(".react-flow__viewport")
    .getAttribute("style");
  await page.mouse.move(box.x + 30, box.y + 50);
  await page.mouse.wheel(0, -100);
  await expect(page.locator(".react-flow__viewport")).not.toHaveAttribute(
    "style",
    prior ?? "",
  );
  expect(c.snapshot.cases).toEqual(before);
  const preference = () =>
    page.evaluate(() => {
      const key = Object.keys(localStorage).find((key) =>
        key.startsWith("cheddar:canvas-view:"),
      );
      return key
        ? JSON.parse(localStorage.getItem(key) ?? "{}").viewport
        : undefined;
    });
  await expect.poll(async () => (await preference())?.zoom).toBeGreaterThan(0);
  const savedViewport = await preference();
  await page.reload();
  await page.getByRole("button", { name: "캔버스", exact: true }).click();
  await expect
    .poll(async () =>
      page
        .locator(".react-flow__viewport")
        .evaluate(
          (element) => new DOMMatrix(getComputedStyle(element).transform).a,
        ),
    )
    .toBeCloseTo(savedViewport.zoom, 5);
});

test("failed layout draft survives reload and conflicts preserve the server winner", async ({
  page,
}) => {
  const c = await setup(page);
  await open(page);
  c.reject = true;
  await page.getByLabel("묶음 기준").selectOption(uuid(13));
  await expect(page.getByRole("alert")).toBeVisible();
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "캔버스", exact: true }).click();
  await page.getByRole("button", { name: "초안 열기", exact: true }).click();
  await expect(page.getByLabel("묶음 기준")).toHaveValue(uuid(13));
  c.reject = false;
  c.canvas.layoutRevision++;
  c.canvas.layout.groupBy = uuid(15);
  await page.getByRole("button", { name: "다시 저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "최신 내용을 확인해주세요.",
  );
  expect(c.canvas.layout.groupBy).toBe(uuid(15));
  await page
    .getByRole("button", { name: "최신 내용 불러오기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "불러오기", exact: true })
    .click();
  await expect(page.getByLabel("묶음 기준")).toHaveValue(uuid(15));
});

test("flow layout preserves branches, merges and retries; deleting a stage keeps cases and is undoable", async ({
  page,
}) => {
  const c = await setup(page);
  c.canvas.flow = {
    steps: [70, 71, 72].map((n, i) => ({
      id: uuid(n),
      title: ["시작", "인증", "결과"][i],
      kind: i === 2 ? "condition" : "action",
      description: "",
      caseIds: i ? [uuid(100)] : [],
    })),
    edges: [
      [70, 71],
      [70, 72],
      [71, 72],
      [72, 71],
    ].map(([from, to], i) => ({
      id: uuid(80 + i),
      from: uuid(from),
      to: uuid(to),
      condition: ["성공", "오류", "합류", "재시도"][i],
    })),
  };
  const before = structuredClone(c.canvas.flow),
    cases = structuredClone(c.snapshot.cases);
  await open(page);
  await page.getByRole("button", { name: "흐름 보기", exact: true }).click();
  await expect(
    page.getByRole("article", { name: "TC-1 정상 로그인", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "자동 정렬", exact: true }).click();
  await expect
    .poll(
      () =>
        c.canvas.layout.positions.filter((p) => p.id.startsWith("f:")).length,
    )
    .toBe(5);
  expect(c.canvas.flow).toEqual(before);
  await page
    .getByRole("button", { name: "단계 편집", exact: true })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "단계 삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "테스트 케이스는 유지됩니다.",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect.poll(() => c.canvas.flow.steps.length).toBe(2);
  expect(c.snapshot.cases).toEqual(cases);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect.poll(() => c.canvas.flow).toEqual(before);
});

test("case deletion reads current stored flow references even after the canvas was opened", async ({
  page,
}) => {
  const c = await setup(page);
  await open(page);
  // Another editor adds a reference after this canvas loaded its own snapshot.
  c.canvas.flowRevision++;
  c.canvas.flow.steps = [
    {
      id: uuid(70),
      title: "새로 연결한 단계",
      kind: "action",
      description: "",
      caseIds: [uuid(100)],
    },
  ];
  await page.getByRole("button", { name: "표", exact: true }).click();
  await page.getByRole("checkbox", { name: "1행 선택", exact: true }).check();
  await page.getByRole("button", { name: "선택 행 삭제", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "테스트 케이스 삭제",
    exact: true,
  });
  await expect(dialog).toContainText(
    "저장된 흐름의 단계 1곳에서 연결이 해제됩니다.",
  );
  await expect(dialog).not.toContainText("미저장 흐름");
  await dialog.getByRole("button", { name: "취소", exact: true }).click();
  expect(c.snapshot.cases).toHaveLength(2);
});
