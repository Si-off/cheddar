import { expect, type Locator, type Page, test } from "@playwright/test";
import type {
  GenerationDto,
  StartGenerationDto,
  TestScenarioContentDto,
  TestScenarioSnapshotDto,
  TestScenarioViewDto,
} from "@/shared/api/generated";

test.afterEach(async ({ page }, testInfo) => {
  if (!page.isClosed())
    await page.screenshot({
      path: testInfo.outputPath("final-state.png"),
      fullPage: true,
      animations: "disabled",
    });
});

const projectId = "10000000-0000-4000-8000-000000000001";
const testScenarioId = "20000000-0000-4000-8000-000000000001";
function fixture(): TestScenarioSnapshotDto {
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
  const names = [
    "케이스 번호",
    "제목",
    "사전조건",
    "수행 단계",
    "기대 결과",
    "우선순위",
    "관련 프레임",
    "IA 화면",
  ];
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
    name: names[index],
  }));
  return {
    id: testScenarioId,
    projectId,
    name: "시트 하나",
    kind: "unit",
    uploadId: null,
    contentRevision: 1,
    viewRevision: 1,
    sourceTemplateRevision: 1,
    createdAt: "2026-10-15T00:00:00.000Z",
    updatedAt: "2026-10-15T00:00:00.000Z",
    columns,
    view: columns.map((c) => ({ columnId: c.id, width: 180 })),
    cases: [
      {
        id: "40000000-0000-4000-8000-000000000001",
        caseCode: "TC-001",
        title: "기존 제목",

        relatedFrameIds: [],
        screenIds: [],
        customValues: {},
      },
    ],
    references: { frames: [], iaItems: [] },
  };
}
async function mockApi(page: Page) {
  const control = {
    saved: fixture(),
    iaOptions: [] as { id: string; screenId: string; name: string }[],
    uploads: [] as { id: string; name: string }[],
    frames: [] as {
      id: string;
      uploadId: string;
      figmaFileKey: string;
      figmaNodeId: string;
      name: string;
      imageFileId: string;
      dataFileId: string;
    }[],
    requests: [] as TestScenarioContentDto[],
    viewRequests: [] as TestScenarioViewDto[],
    reject: false,
    rejectGet: false,
    loseResponse: false,
    hold: undefined as (() => void) | undefined,
    holdNext: false,
    holdViewNext: false,
    exports: [] as string[],
    holdGenerations: false,
    releaseGenerations: undefined as (() => void) | undefined,
    generation: undefined as GenerationDto | undefined,
    generationRequests: [] as StartGenerationDto[],
  };
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/v1/generation/providers")
      return json({
        items: [
          { id: "anthropic", model: "synthetic-model", configured: true },
        ],
      });
    if (path.endsWith("/generations")) {
      if (request.method() === "POST") {
        control.generationRequests.push(request.postDataJSON());
        control.generation = {
          mode: request.postDataJSON().mode,
          id: "50000000-0000-4000-8000-000000000001",
          testScenarioId,
          provider: "anthropic",
          model: "synthetic-model",
          status: "running",
          error: null,
          revision: 1,
          caseCount: 0,
          results: [],
          createdAt: new Date().toISOString(),
        };
        return json(control.generation, 202);
      }
      if (control.holdGenerations)
        await new Promise<void>((resolve) => {
          control.releaseGenerations = resolve;
        });
      return json({ items: control.generation ? [control.generation] : [] });
    }
    if (path.endsWith("/add") && control.generation) {
      const body = request.postDataJSON();
      for (const candidate of control.generation.results.filter((c) =>
        body.resultIds.includes(c.id),
      )) {
        candidate.status = "added";
        control.saved.cases.push({
          ...candidate.content,
          caseCode: `TC-${control.saved.cases.length + 1}`,
        });
      }
      control.generation.revision++;
      control.saved.contentRevision++;
      return json(control.generation, 201);
    }
    if (path.endsWith("/analysis"))
      return json({ revision: 0, items: [], links: [] });
    if (path.includes("/results/") && control.generation) {
      const candidate = control.generation.results.find((item) =>
        path.endsWith(item.id),
      );
      if (!candidate) return json({}, 404);
      const body = request.postDataJSON();
      if (body.content) candidate.content = body.content;
      candidate.status = "added";
      control.generation.revision++;
      control.saved.cases.push({ ...candidate.content, caseCode: "TC-003" });
      control.saved.contentRevision++;
      return json(control.generation);
    }
    if (path === `/api/v1/projects/${projectId}`)
      return json({ id: projectId, name: "테스트 프로젝트", revision: 1 });

    if (path === "/api/v1/projects")
      return json({
        items: [
          {
            id: projectId,
            name: "테스트 프로젝트",
            description: null,
            revision: 1,
            createdAt: control.saved.createdAt,
            updatedAt: control.saved.updatedAt,
          },
        ],
        nextCursor: null,
      });
    if (path.endsWith("/ia")) return json({ items: control.iaOptions });
    if (path.endsWith("/uploads"))
      return json({ items: control.uploads, nextCursor: null });
    if (path.includes("/uploads/"))
      return json({ id: control.uploads[0]?.id, frames: control.frames });
    if (path.endsWith("/test-scenarios") && request.method() === "GET")
      return json({ items: [control.saved], nextCursor: null });
    if (path.endsWith("/export.xlsx")) {
      control.exports.push(url.search);
      return route.fulfill({
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": "attachment; filename=test.xlsx",
        },
        body: Buffer.from([80, 75, 3, 4]),
      });
    }
    if (path.endsWith(`/test-scenarios/${testScenarioId}`))
      return control.rejectGet
        ? json(
            {
              error: {
                message: "일시적으로 시나리오를 불러오지 못했습니다.",
                requestId: "test",
                code: "DEPENDENCY_UNAVAILABLE",
              },
            },
            503,
          )
        : json(control.saved);
    if (path.endsWith("/content")) {
      const body = request.postDataJSON() as TestScenarioContentDto;
      control.requests.push(body);
      if (body.expectedRevision !== control.saved.contentRevision)
        return json(
          {
            error: {
              code: "REVISION_CONFLICT",
              message:
                "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
              requestId: "test",
              details: {
                resource: "content",
                currentRevision: control.saved.contentRevision,
              },
            },
          },
          409,
        );
      if (control.reject)
        return json(
          {
            error: {
              code: "VALIDATION_ERROR",
              message: "입력 내용을 확인해주세요.",
              requestId: "test",
            },
          },
          400,
        );
      const known = new Set(control.saved.cases.map((c) => c.id));
      const columnsChanged =
        body.columns
          .map((c) => c.id)
          .sort()
          .join() !==
        control.saved.columns
          .map((c) => c.id)
          .sort()
          .join();
      control.saved = {
        ...control.saved,
        columns: body.columns,
        cases: body.cases.map((c, i) => ({
          ...c,
          caseCode:
            !known.has(c.id) && !c.caseCode
              ? `TC-${String(i + 1).padStart(3, "0")}`
              : c.caseCode,
        })),
        contentRevision: control.saved.contentRevision + 1,
        viewRevision: control.saved.viewRevision + (columnsChanged ? 1 : 0),
      };
      control.saved.view = [
        ...control.saved.view.filter((v) =>
          body.columns.some((c) => c.id === v.columnId),
        ),
        ...body.columns
          .filter((c) => !control.saved.view.some((v) => v.columnId === c.id))
          .map((c) => ({ columnId: c.id, width: 180 })),
      ];
      const reply = structuredClone(control.saved);
      if (control.holdNext) {
        control.holdNext = false;
        await new Promise<void>((resolve) => {
          control.hold = resolve;
        });
      }
      if (control.loseResponse) {
        control.loseResponse = false;
        return route.abort("failed");
      }
      return json(reply);
    }
    if (path.endsWith("/view")) {
      const body = request.postDataJSON() as TestScenarioViewDto;
      control.viewRequests.push(body);
      if (body.expectedRevision !== control.saved.viewRevision)
        return json(
          {
            error: {
              code: "REVISION_CONFLICT",
              message: "다른 변경 사항이 저장되어 있습니다.",
              requestId: "test",
            },
          },
          409,
        );
      control.saved = {
        ...control.saved,
        view: body.columns,
        viewRevision: control.saved.viewRevision + 1,
      };
      const reply = structuredClone(control.saved);
      if (control.holdViewNext) {
        control.holdViewNext = false;
        await new Promise<void>((resolve) => {
          control.hold = resolve;
        });
      }
      return json(reply);
    }
    return json(
      {
        error: {
          code: "NOT_FOUND",
          message: "요청한 항목을 찾을 수 없습니다.",
          requestId: "test",
        },
      },
      404,
    );
  });
  return control;
}
async function open(page: Page) {
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
}
async function search(page: Page, value: string) {
  await page
    .getByRole("textbox", { name: "테스트 케이스 검색", exact: true })
    .fill(value);
}
async function columns(page: Page) {
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
}
async function choose(page: Page, control: Locator, label: string) {
  await control.click();
  await page.getByRole("option", { name: label, exact: true }).click();
}
async function firstWidth(page: Page) {
  return page
    .getByRole("button", { name: /너비 조절$/ })
    .first()
    .evaluate((el) =>
      parseFloat((el.closest("th") as HTMLElement).style.width),
    );
}
async function resizeFirst(page: Page, width: number) {
  const handle = page.getByRole("button", { name: /너비 조절$/ }).first();
  let current = await firstWidth(page);
  while (current !== width) {
    const delta = width - current;
    await handle.press(
      Math.abs(delta) >= 10
        ? delta > 0
          ? "Shift+ArrowRight"
          : "Shift+ArrowLeft"
        : delta > 0
          ? "ArrowRight"
          : "ArrowLeft",
    );
    current += Math.sign(delta) * (Math.abs(delta) >= 10 ? 10 : 1);
  }
}
async function editTitle(page: Page, title: string) {
  await page
    .getByRole("gridcell", { name: "1행 제목", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill(title);
}

test("initial generation lookup explains the temporary editing lock", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.holdGenerations = true;
  await open(page);
  await expect(
    page.getByRole("status").filter({ hasText: "생성 상태 확인 중" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => !!control.releaseGenerations).toBe(true);
  control.holdGenerations = false;
  control.releaseGenerations?.();
  await expect(
    page.getByText("생성 상태 확인 중", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toBeEnabled();
});

test("long cell text remains readable and editing retains its expanded row", async ({
  page,
}) => {
  const control = await mockApi(page);
  const text =
    "여러 줄의 테스트 수행 내용을 읽고 편집할 수 있어야 합니다. ".repeat(12);
  control.saved.cases[0].customValues["30000000-0000-4000-8000-000000000004"] =
    text;
  await open(page);
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toBeEnabled();
  const cell = page.getByRole("gridcell", {
    name: "1행 수행 단계",
    exact: true,
  });
  await expect(cell).toContainText(text.trim());
  const before = await cell.boundingBox();
  expect(before?.height).toBeGreaterThan(100);
  await cell.dblclick();
  const editor = page.getByRole("textbox", {
    name: "수행 단계 편집",
    exact: true,
  });
  await expect(editor).toHaveValue(text);
  const during = await cell.boundingBox();
  expect(during?.height).toBeGreaterThanOrEqual((before?.height ?? 0) - 1);
  const expanded = `${text}\n새로운 수행 단계`;
  await editor.fill(expanded);
  await editor.press("Control+Enter");
  await expect
    .poll(
      () =>
        control.saved.cases[0].customValues[
          "30000000-0000-4000-8000-000000000004"
        ],
    )
    .toBe(expanded);
  await expect(cell).toContainText("새로운 수행 단계");
  const heightHandle = page.getByRole("button", {
    name: "1행 높이 조절",
    exact: true,
  });
  const expandedHeight = (await cell.boundingBox())?.height ?? 0;
  await heightHandle.press("ArrowUp");
  await heightHandle.press("ArrowUp");
  expect((await cell.boundingBox())?.height).toBeLessThan(expandedHeight);
  await heightHandle.dblclick();
  expect((await cell.boundingBox())?.height).toBeGreaterThanOrEqual(
    expandedHeight - 1,
  );
  await page.setViewportSize({ width: 480, height: 800 });
  const horizontal = await cell.evaluate((element) => {
    const container = element.closest("table")?.parentElement;
    return !!container && container.scrollWidth > container.clientWidth;
  });
  expect(horizontal).toBe(true);
});

test("generation locks editing, appends clear cases and confirms uncertain results in the sheet", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await page.getByLabel("테스트 내용", { exact: true }).fill("로그인 흐름");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "테스트 케이스 생성 중" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toBeDisabled();
  expect(control.generationRequests).toHaveLength(1);
  expect(control.generationRequests[0]).toMatchObject({
    description: "로그인 흐름",
    expectedRevision: 1,
    mode: "append",
  });
  const generated = {
    ...control.saved.cases[0],
    id: "40000000-0000-4000-8000-000000000002",
    caseCode: "TC-002",
    title: "생성 로그인 케이스",
  };
  const candidate = {
    ...generated,
    id: "40000000-0000-4000-8000-000000000003",
    caseCode: "",
    title: "로그인 예외 후보",
  };
  control.saved.cases.push(generated);
  control.saved.contentRevision++;
  Object.assign(control.generation ?? {}, {
    status: "succeeded",
    revision: 2,
    caseCount: 1,
    results: [
      {
        id: generated.id,
        kind: "case",
        status: "added",
        reason: "",
        content: generated,
      },
      {
        id: candidate.id,
        kind: "candidate",
        status: "pending",
        reason: "동작 확인 필요",
        content: candidate,
      },
    ],
  });
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("기존 제목");
  await expect(
    page.getByRole("gridcell", { name: "2행 제목", exact: true }),
  ).toContainText(generated.title);
  await page.getByRole("button", { name: /^확인 항목/ }).click();
  await expect(
    page.getByRole("heading", { name: "확인 항목", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `${generated.title} 추가 대기`,
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "시나리오에 추가", exact: true })
    .click();
  await expect.poll(() => control.saved.cases.length).toBe(3);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("기존 제목");
  await expect(
    page.getByRole("gridcell", { name: "3행 제목", exact: true }),
  ).toContainText(candidate.title);
  expect(control.generationRequests).toHaveLength(1);
});
async function paste(page: Page, target: string, text: string) {
  const cell = page.getByRole("gridcell", { name: target, exact: true });
  await cell.click();
  await cell.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(
      new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      }),
    );
  }, text);
}

test("multi-cell paste, search, keyboard navigation and atomic rejection preserve user data", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  await paste(page, "1행 제목", '"여러\n줄"\t준비\n두 번째\t다른 준비');
  await expect.poll(() => control.saved.cases.length).toBe(2);
  expect(control.saved.cases[0].title).toBe("여러\n줄");
  expect(
    control.saved.cases[1].customValues["30000000-0000-4000-8000-000000000003"],
  ).toBe("다른 준비");
  await search(page, "두 번째");
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toHaveText("두 번째");
  await paste(page, "1행 제목", "찾은 행만");
  await expect.poll(() => control.saved.cases[1].title).toBe("찾은 행만");
  expect(control.saved.cases[0].title).toBe("여러\n줄");
  await search(page, "");
  const before = structuredClone(control.saved.cases);
  await paste(page, "1행 케이스 번호", "중복\n중복");
  await expect(page.getByRole("alert")).toContainText(
    "테스트 케이스 번호가 중복됩니다.",
  );
  expect(control.saved.cases).toEqual(before);
  const cell = page.getByRole("gridcell", { name: "1행 제목", exact: true });
  await cell.click();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("gridcell", { name: "1행 사전조건", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+ArrowDown");
  const last = page.getByRole("gridcell", { name: "2행 IA 화면", exact: true });
  await last.click();
  await page.keyboard.press("Tab");
  expect(
    await page
      .getByRole("grid")
      .evaluate((grid) => grid.contains(document.activeElement)),
  ).toBe(false);
});

test("saving a local width adopts remote case additions, deletions, order and column names without writing content", async ({
  page,
}) => {
  const control = await mockApi(page);
  const original = control.saved.cases[0];
  const second = {
    ...structuredClone(original),
    id: "40000000-0000-4000-8000-000000000002",
    caseCode: "TC-002",
    title: "원격 둘",
  };
  const third = {
    ...structuredClone(original),
    id: "40000000-0000-4000-8000-000000000003",
    caseCode: "TC-003",
    title: "원격 셋",
  };
  control.saved.cases.push(second, third);
  await open(page);
  const fourth = {
    ...structuredClone(original),
    id: "40000000-0000-4000-8000-000000000004",
    caseCode: "TC-004",
    title: "원격 넷",
  };
  control.saved.cases = [third, second, fourth];
  control.saved.columns[1].name = "원격 제목";
  control.saved.contentRevision++;
  await resizeFirst(page, 240);
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: "1행 원격 제목", exact: true }),
  ).toContainText("원격 셋");
  await expect(
    page.getByRole("gridcell", { name: "3행 원격 제목", exact: true }),
  ).toContainText("원격 넷");
  expect(control.requests).toHaveLength(0);
  expect(control.saved.cases.map((c) => c.id)).toEqual([
    third.id,
    second.id,
    fourth.id,
  ]);
});

test("saving local content adopts a remote view order and width without writing the view", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  const view = [...control.saved.view]
    .reverse()
    .map((v) => ({ ...v, width: 260 }));
  control.saved.view = view;
  control.saved.viewRevision++;
  await editTitle(page, "내 제목 변경");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader").nth(1)).toContainText("IA 화면");
  expect(await firstWidth(page)).toBe(260);
  expect(control.saved.view).toEqual(view);
  expect(control.viewRequests).toHaveLength(0);
});

test("local content typed during a view save conflicts with independently changed content instead of overwriting it", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  control.saved.cases[0].title = "원격 내용 보존";
  control.saved.contentRevision++;
  control.holdViewNext = true;
  await resizeFirst(page, 240);
  await expect.poll(() => !!control.hold).toBe(true);
  await editTitle(page, "전송 이후 로컬 내용");
  control.hold?.();
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("전송 이후 로컬 내용");
  expect(control.requests).toHaveLength(0);
  expect(control.saved.cases[0].title).toBe("원격 내용 보존");
  await page
    .getByRole("button", { name: "내 입력과 최신 내용 확인", exact: true })
    .click();
  await expect(page.getByLabel("최신 내용", { exact: true })).toContainText(
    "원격 내용 보존",
  );
});

test("local view edits during a content save conflict with an independently changed view instead of overwriting it", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  const remoteView = [...control.saved.view].reverse();
  control.saved.view = remoteView;
  control.saved.viewRevision++;
  control.holdNext = true;
  await editTitle(page, "현재 내용 저장");
  await expect.poll(() => !!control.hold).toBe(true);
  await resizeFirst(page, 240);
  control.hold?.();
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  expect(await firstWidth(page)).toBe(240);
  expect(control.saved.view).toEqual(remoteView);
  expect(control.viewRequests).toHaveLength(0);
});

test("a delayed content acknowledgement preserves later row and column additions, deletions and view order", async ({
  page,
}) => {
  const control = await mockApi(page);
  const oldColumn = {
    id: "30000000-0000-4000-8000-000000000009",
    kind: "custom" as const,
    valueType: "text" as const,
    name: "기존 메모",
  };
  control.saved.columns.push(oldColumn);
  control.saved.view.push({ columnId: oldColumn.id, width: 180 });
  control.saved.cases.push({
    ...structuredClone(control.saved.cases[0]),
    id: "40000000-0000-4000-8000-000000000002",
    caseCode: "TC-002",
    title: "삭제할 행",
  });
  await open(page);
  control.holdNext = true;
  await editTitle(page, "먼저 보낸 입력");
  await expect.poll(() => !!control.hold).toBe(true);
  await page.getByRole("checkbox", { name: "2행 선택", exact: true }).check();
  await page.getByRole("button", { name: "선택 행 삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "테스트 케이스 삭제", exact: true })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "테스트 케이스 추가", exact: true })
    .click();
  await page
    .getByRole("gridcell", { name: "2행 제목", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("전송 이후 추가행");
  await columns(page);
  await page
    .getByRole("button", { name: "기존 메모 설정", exact: true })
    .click();
  await page.getByRole("button", { name: "열 삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "사용자 열 삭제", exact: true })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await columns(page);
  await page.getByRole("button", { name: "열 추가", exact: true }).click();
  await page.getByRole("button", { name: "새 열 설정", exact: true }).click();
  await page.getByLabel("열 이름", { exact: true }).fill("나중에 추가한 열");
  await choose(page, page.getByLabel("순서", { exact: true }), "8번째");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  control.hold?.();
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  expect(control.saved.cases.map((c) => c.title)).toEqual([
    "먼저 보낸 입력",
    "전송 이후 추가행",
  ]);
  expect(control.saved.cases.some((c) => c.id.endsWith("000000000002"))).toBe(
    false,
  );
  expect(control.saved.columns.some((c) => c.id === oldColumn.id)).toBe(false);
  const added = control.saved.columns.find(
    (c) => c.name === "나중에 추가한 열",
  );
  expect(added).toBeTruthy();
  expect(control.saved.view.at(-2)?.columnId).toBe(added?.id);
  expect(control.saved.cases[1].caseCode).toBe("TC-002");
});

test("a delayed save response cannot overwrite newer typing and an acknowledged lost response is not resent", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  control.holdNext = true;
  await editTitle(page, "먼저 입력");
  await expect.poll(() => !!control.hold).toBe(true);
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("요청 중 새 입력");
  control.hold?.();
  await expect.poll(() => control.saved.cases[0].title).toBe("요청 중 새 입력");
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("요청 중 새 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  const requests = control.requests.length;
  control.loseResponse = true;
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("응답 유실 입력");
  await expect.poll(() => control.requests.length).toBe(requests + 1);
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  expect(control.requests.length).toBe(requests + 1);
});

test("a conflict preserves local input, shows latest text and requires explicit restart", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  control.saved.contentRevision++;
  control.saved.cases[0].title = "다른 창에서 저장";
  await editTitle(page, "내 미저장 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("내 미저장 입력");
  await expect(
    page.getByRole("button", { name: "XLSX 내보내기", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "내 입력과 최신 내용 확인" }).click();
  await expect(page.getByLabel("내 입력", { exact: true })).toContainText(
    "내 미저장 입력",
  );
  await expect(page.getByLabel("최신 내용", { exact: true })).toContainText(
    "다른 창에서 저장",
  );
  await page.getByRole("button", { name: "최신 내용으로 편집" }).click();
  await page.getByText("이전 입력", { exact: true }).click();
  await expect(page.getByLabel("이전 입력 내용")).toContainText(
    "내 미저장 입력",
  );
  expect(control.saved.cases[0].title).toBe("다른 창에서 저장");
});

test("reload offers unsaved draft recovery without silently sending it", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  control.reject = true;
  await editTitle(page, "새로고침 복구할 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("cheddar-test-scenario-drafts-v2", 1);
        open.onsuccess = () => {
          const tx = open.result.transaction("drafts");
          const request = tx.objectStore("drafts").count();
          request.onsuccess = () => resolve(request.result > 0);
        };
      }),
  );
  const requestCount = control.requests.length;
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  // Root-only integrations may need project/testScenario selection after reload.
  if (
    await page
      .getByRole("button", { name: "테스트 프로젝트", exact: true })
      .isVisible()
  ) {
    await page
      .getByRole("button", { name: "테스트 프로젝트", exact: true })
      .click();
    await page.getByRole("button", { name: /시트 하나/, exact: false }).click();
  }
  await expect(page.getByRole("button", { name: "초안 복원" })).toBeVisible();
  expect(control.requests.length).toBe(requestCount);
  control.reject = false;
  await page.getByRole("button", { name: "초안 복원" }).click();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("새로고침 복구할 입력");
});

test("column edits persist, deletion confirms value loss, search still exports the saved whole testScenario", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  await columns(page);
  await page.getByRole("button", { name: "열 추가", exact: true }).click();
  await page.getByRole("button", { name: "새 열 설정", exact: true }).click();
  await page.getByLabel("열 이름", { exact: true }).fill("사용자 메모");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect
    .poll(() => control.saved.columns.some((c) => c.name === "사용자 메모"))
    .toBe(true);
  await paste(page, "1행 사용자 메모", "지우기 전 메모");
  await expect
    .poll(() => Object.values(control.saved.cases[0].customValues))
    .toContain("지우기 전 메모");
  await columns(page);
  await page
    .getByRole("button", { name: "사용자 메모 설정", exact: true })
    .click();
  await page.getByRole("button", { name: "열 삭제", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "사용자 열 삭제", exact: true }),
  ).toContainText("테스트 케이스 1개의 값");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect
    .poll(() => control.saved.columns.some((c) => c.name === "사용자 메모"))
    .toBe(false);
  await expect(
    page.getByRole("status").filter({ hasText: "저장 완료" }),
  ).toBeVisible();
  await search(page, "검색 결과 없음");
  await expect(
    page.getByText("검색 결과가 없습니다", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "XLSX 내보내기", exact: true })
    .click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  expect(control.exports).toHaveLength(1);
  expect(control.exports[0]).toContain(
    `contentRevision=${control.saved.contentRevision}`,
  );
  expect(control.exports[0]).not.toContain("search");
});

test("detail fields share the grid draft, explicit reference selection uses UUIDs, and composition defers autosave", async ({
  page,
}) => {
  const control = await mockApi(page);
  const frameId = "50000000-0000-4000-8000-000000000001",
    iaId = "60000000-0000-4000-8000-000000000001",
    uploadId = "70000000-0000-4000-8000-000000000001";
  control.iaOptions = [{ id: iaId, screenId: "ORDER-1", name: "주문" }];
  control.uploads = [{ id: uploadId, name: "주문 화면 묶음" }];
  control.frames = [
    {
      id: frameId,
      uploadId,
      name: "주문 프레임",
      figmaFileKey: "file",
      figmaNodeId: "1:2",
      imageFileId: "80000000-0000-4000-8000-000000000001",
      dataFileId: "80000000-0000-4000-8000-000000000002",
    },
  ];
  await open(page);
  await page.clock.install();
  await page
    .getByRole("gridcell", { name: "1행 제목", exact: true })
    .dblclick();
  const editor = page.getByRole("textbox", { name: "제목 편집", exact: true });
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    ),
  );
  await editor.fill("한글 조합 입력");
  await page.clock.runFor(1000);
  expect(control.requests).toHaveLength(0);
  await editor.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true }),
    ),
  );
  await page.clock.runFor(600);
  await expect.poll(() => control.saved.cases[0].title).toBe("한글 조합 입력");
  await page.getByRole("checkbox", { name: "1행 선택", exact: true }).click();
  await page.getByRole("button", { name: "상세 편집", exact: true }).click();
  const panel = page.getByRole("complementary", {
    name: "테스트 케이스 편집",
  });
  await panel
    .getByLabel("수행 단계", { exact: true })
    .fill("상세 패널의 긴 내용\n두 번째 단계");
  await choose(
    page,
    panel.getByLabel("Figma 자료", { exact: true }),
    "주문 화면 묶음",
  );
  await choose(page, panel.getByLabel("우선순위", { exact: true }), "높음");
  await panel.getByRole("checkbox", { name: /주문 프레임/ }).click();
  await panel.getByRole("checkbox", { name: /ORDER-1 주문/ }).click();
  await page.clock.runFor(600);
  await expect
    .poll(
      () =>
        control.saved.cases[0].customValues[
          "30000000-0000-4000-8000-000000000004"
        ],
    )
    .toBe("상세 패널의 긴 내용\n두 번째 단계");
  expect(control.saved.cases[0].relatedFrameIds).toEqual([frameId]);
  expect(control.saved.cases[0].screenIds).toEqual([iaId]);
  expect(
    control.saved.cases[0].customValues["30000000-0000-4000-8000-000000000006"],
  ).toBe("00000000-0000-4000-8000-000000000001");
  if (process.env.EDITOR_CAPTURE_PATH) {
    await panel.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: process.env.EDITOR_CAPTURE_PATH,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await expect(
    page.getByRole("button", { name: "상세 편집", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("gridcell", { name: "1행 수행 단계", exact: true }),
  ).toContainText("상세 패널의 긴 내용");
});

test("500-case browser fixture supports editing and search without rendering every cell as an input", async ({
  page,
}) => {
  const control = await mockApi(page);
  const custom = Array.from({ length: 5 }, (_, index) => ({
    id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    kind: "custom" as const,
    valueType: "text" as const,
    name: `사용자 ${index + 1}`,
  }));
  control.saved.columns.push(...custom);
  control.saved.view.push(
    ...custom.map((c) => ({ columnId: c.id, width: 180 })),
  );
  const original = control.saved.cases[0];
  control.saved.cases = Array.from({ length: 500 }, (_, i) => ({
    ...structuredClone(original),
    id: crypto.randomUUID(),
    caseCode: `TC-${String(i + 1).padStart(3, "0")}`,
    title: `500행 검증 ${i}`,
    customValues: Object.fromEntries(custom.map((c) => [c.id, `값 ${i}`])),
  }));
  const started = Date.now();
  await open(page);
  const loaded = Date.now();
  await editTitle(page, "500행 편집 유지");
  const typed = Date.now();
  await expect.poll(() => control.saved.cases[0].title).toBe("500행 편집 유지");
  const saved = Date.now();
  await search(page, "500행 편집 유지");
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: "2행 제목", exact: true }),
  ).toHaveCount(0);
  console.log(
    `500-case browser: load=${loaded - started}ms edit=${typed - loaded}ms save+debounce=${saved - typed}ms search=${Date.now() - saved}ms`,
  );
});

test("browser storage failure keeps the editable input and reports the narrower recovery guarantee", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await open(page);
  await editTitle(page, "저장소 오류 중 유지할 입력");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "브라우저에 초안을 보관하지 못했습니다" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("저장소 오류 중 유지할 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  control.reject = false;
  await page.getByRole("button", { name: "저장 재시도" }).click();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("저장소 오류 중 유지할 입력");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "브라우저에 초안을 보관하지 못했습니다" }),
  ).toHaveCount(0);
});

test("a recovered browser draft write clears an obsolete storage failure while server save still fails", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    let fail = true;
    IDBObjectStore.prototype.put = function (...args) {
      if (fail) {
        fail = false;
        throw new DOMException("Quota", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  await open(page);
  await editTitle(page, "첫 보관 실패");
  const warning = page
    .getByRole("alert")
    .filter({ hasText: "브라우저에 초안을 보관하지 못했습니다" });
  await expect(warning).toBeVisible();
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("다음 보관 성공");
  await expect(warning).toHaveCount(0);
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("다음 보관 성공");
});

test("internal header navigation and browser back preserve failed drafts and require explicit confirmation", async ({
  page,
}, testInfo) => {
  const control = await mockApi(page);
  await page.goto(`/projects/${projectId}/test-scenarios`);
  const projectNavigation = page.getByRole("navigation", {
    name: "프로젝트 탐색",
    exact: true,
  });
  for (const name of ["테스트 시나리오", "Figma 자료", "프로젝트 설정"]) {
    await expect(
      projectNavigation.getByRole("link", { name, exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: testInfo.outputPath("scenario-list-project-navigation.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /시트 하나/, exact: false }).click();
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  control.reject = true;
  await editTitle(page, "내부 이동에서 유지할 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", {
    name: "미저장 입력",
  });
  await page
    .getByRole("button", { name: "시나리오 목록", exact: true })
    .click();
  await expect(dialog).toContainText("입력을 이 브라우저에 보관했습니다");
  await dialog.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/test-scenarios/${testScenarioId}$`),
  );
  await page.getByRole("link", { name: "프로젝트 목록", exact: true }).click();
  await expect(dialog).toContainText("입력을 이 브라우저에 보관했습니다");
  await dialog.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(page).toHaveURL(
    new RegExp(`/test-scenarios/${testScenarioId}$`),
  );
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("내부 이동에서 유지할 입력");
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "초안 보관 후 이동", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/projects/${projectId}/test-scenarios$`),
  );
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("button", { name: "초안 복원", exact: true }),
  ).toBeVisible();
});

test("internal navigation stays blocked when both the server save and browser draft storage fail", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "어디에도 저장되지 않은 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "프로젝트 목록", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "미저장 입력",
  });
  await expect(dialog).toContainText(
    "입력을 이 브라우저에 보관하지 못했습니다",
  );
  await expect(
    dialog.getByRole("button", { name: "초안 보관 후 이동", exact: true }),
  ).toBeDisabled();
  control.reject = false;
  await dialog
    .getByRole("button", { name: "저장 후 이동", exact: true })
    .click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  expect(control.saved.cases[0].title).toBe("어디에도 저장되지 않은 입력");
});

test("a background snapshot failure keeps the editor and unsaved input even when IndexedDB is unavailable", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.addInitScript(() =>
    Object.defineProperty(window, "indexedDB", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    }),
  );
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "메모리에만 남은 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  control.rejectGet = true;
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/test-scenarios/${testScenarioId}`) &&
      r.status() === 503,
  );
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await response;
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("메모리에만 남은 입력");
  const refreshWarning = page
    .getByRole("alert")
    .filter({ hasText: "시나리오의 최신 저장 내용을 확인하지 못했습니다" });
  await expect(refreshWarning).toBeVisible();
  control.rejectGet = false;
  await refreshWarning
    .getByRole("button", { name: "다시 확인", exact: true })
    .click();
  await expect(refreshWarning).toHaveCount(0);
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("메모리에만 남은 입력");
  control.reject = false;
  await page.getByRole("button", { name: "저장 재시도", exact: true }).click();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("메모리에만 남은 입력");
});

test("restoring an old draft during an in-flight save cannot clear its conflict or submit it automatically", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.goto(`/projects/${projectId}/test-scenarios/${testScenarioId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "복원할 옛 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장 실패" }),
  ).toBeVisible();
  control.saved.contentRevision++;
  control.saved.cases[0].title = "서버 최신 입력";
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("button", { name: "초안 복원", exact: true }),
  ).toBeVisible();
  control.reject = false;
  control.holdNext = true;
  await editTitle(page, "늦게 응답할 현재 입력");
  await expect.poll(() => !!control.hold).toBe(true);
  const count = control.requests.length;
  await page.getByRole("button", { name: "초안 복원", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  control.hold?.();
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("복원할 옛 입력");
  // Give the released response and the autosave debounce time to expose a stale follow-up write.
  await page.waitForTimeout(800);
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  expect(control.requests).toHaveLength(count);
  expect(control.saved.cases[0].title).toBe("늦게 응답할 현재 입력");
  await page
    .getByRole("button", { name: "내 입력과 최신 내용 확인", exact: true })
    .click();
  await expect(page.getByLabel("최신 내용", { exact: true })).toContainText(
    "늦게 응답할 현재 입력",
  );
});

test("표와 상세 보기 전환, 시나리오 미리보기와 모바일 스크롤을 제공한다", async ({
  page,
}, testInfo) => {
  const control = await mockApi(page);
  const source = control.saved.cases[0];
  const names: Record<string, string> = {
    caseCode: "테스트 ID",
    title: "테스트 항목",

    screens: "화면 ID",
  };
  control.saved.columns.forEach((column) => {
    if (column.field && names[column.field]) column.name = names[column.field];
    const labels: Record<string, string> = {
      "3": "사전 조건",
      "4": "수행 절차",
      "5": "예상 결과",
      "8": "화면 ID",
    };
    const label = labels[String(Number(column.id.slice(-12)))];
    if (label) column.name = label;
  });
  for (const [offset, name] of [
    [9, "기능 구분"],
    [10, "테스트 데이터"],
  ] as const) {
    const id = `30000000-0000-4000-8000-${String(offset).padStart(12, "0")}`;
    control.saved.columns.push({ id, kind: "custom", valueType: "text", name });
    control.saved.view.push({ columnId: id, width: 180 });
  }
  const order = [
    "테스트 ID",
    "기능 구분",
    "테스트 항목",
    "화면 ID",
    "사전 조건",
    "테스트 데이터",
    "수행 절차",
    "예상 결과",
    "우선순위",
    "관련 프레임",
  ];
  control.saved.view.sort(
    (a, b) =>
      order.indexOf(
        control.saved.columns.find((c) => c.id === a.columnId)?.name ?? "",
      ) -
      order.indexOf(
        control.saved.columns.find((c) => c.id === b.columnId)?.name ?? "",
      ),
  );
  control.saved.cases = Array.from({ length: 12 }, (_, i) => ({
    ...structuredClone(source),
    id: `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    caseCode: `TC-${String(i + 1).padStart(3, "0")}`,
    title: [
      "상품 옵션을 선택하고 장바구니에 담기",
      "장바구니 수량 변경",
      "배송지 입력",
      "결제 수단 선택",
    ][i % 4],

    customValues: Object.fromEntries(
      control.saved.columns
        .filter((c) => c.kind === "custom")
        .map((c) => [
          c.id,
          c.valueType === "select"
            ? null
            : c.name === "기능 구분"
              ? "주문·결제"
              : c.name === "사전 조건"
                ? "구매 가능한 상품이 있다."
                : c.name === "수행 절차"
                  ? "1. 상품을 선택한다.\n2. 주문 화면으로 이동한다."
                  : c.name === "예상 결과"
                    ? "선택한 상품으로 주문을 진행할 수 있다."
                    : "상품 1개, 수량 2",
        ]),
    ),
  }));
  await open(page);
  await expect(page.getByRole("grid").getByRole("row")).toHaveCount(13);
  await expect(page.getByRole("grid").getByRole("columnheader")).toHaveCount(
    11,
  );
  await page.screenshot({
    path: testInfo.outputPath("redesign-table.png"),
    fullPage: true,
    animations: "disabled",
  });
  const row = page
    .getByRole("checkbox", { name: "1행 선택", exact: true })
    .locator("xpath=ancestor::tr");
  const height = (await row.boundingBox())?.height ?? 0;
  const border = page.getByRole("button", {
    name: "1행 높이 조절",
    exact: true,
  });
  await border.press("ArrowDown");
  expect((await row.boundingBox())?.height).toBeGreaterThan(height);

  await page.screenshot({
    path: testInfo.outputPath("redesign-layout.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "상세 보기", exact: true }).click();
  await expect(page.locator("summary")).toHaveCount(12);
  await page.locator("summary").nth(0).click();
  await page.locator("summary").nth(1).click();
  await expect(
    page
      .getByText("선택한 상품으로 주문을 진행할 수 있다.", { exact: true })
      .filter({ visible: true }),
  ).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath("redesign-qa.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await page
    .getByRole("button", { name: "시나리오 미리보기", exact: true })
    .click();
  const shared = page.getByRole("region", {
    name: "시나리오 미리보기",
    exact: true,
  });
  await expect(shared.getByRole("table").getByRole("row")).toHaveCount(13);
  await expect(shared.getByRole("textbox")).toHaveCount(0);
  await expect(shared.getByRole("img")).toHaveCount(0);
  await expect(shared.getByText("읽기 전용", { exact: true })).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath("redesign-shared-testScenario.png"),
    animations: "disabled",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();

  await page.getByRole("button", { name: "표", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("redesign-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
});

test("desktop uses one inspector for case edits and sources and restores focus on Escape", async ({
  page,
}, testInfo) => {
  const control = await mockApi(page);
  await open(page);
  const trigger = page.getByRole("button", {
    name: "1행 상세 편집",
    exact: true,
  });
  await trigger.click();
  const editorRegion = page.getByRole("region", {
    name: "시나리오 편집",
    exact: true,
  });
  await expect(editorRegion.getByRole("complementary")).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  let inspector = page.getByRole("complementary", {
    name: "테스트 케이스 편집",
    exact: true,
  });
  await inspector.getByLabel("제목", { exact: true }).fill("자료와 함께 편집");
  await page.screenshot({
    path: testInfo.outputPath("desktop-case-inspector.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "관련 자료 보기", exact: true })
    .click();
  await expect(editorRegion.getByRole("complementary")).toHaveCount(1);
  inspector = page.getByRole("complementary", {
    name: "관련 자료",
    exact: true,
  });
  await expect(inspector).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop-source-inspector.png"),
    fullPage: true,
    animations: "disabled",
  });
  await inspector
    .getByRole("button", { name: "케이스 편집", exact: true })
    .click();
  inspector = page.getByRole("complementary", {
    name: "테스트 케이스 편집",
    exact: true,
  });
  await expect(inspector.getByLabel("제목", { exact: true })).toHaveValue(
    "자료와 함께 편집",
  );
  await inspector.getByLabel("제목", { exact: true }).press("Escape");
  await expect(editorRegion.getByRole("complementary")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "관련 자료 보기", exact: true }),
  ).toBeFocused();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("자료와 함께 편집");
});

test("mobile inspector supports reduced motion, traps focus and returns to its trigger on Escape", async ({
  page,
}, testInfo) => {
  const control = await mockApi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page);
  const trigger = page.getByRole("button", {
    name: "1행 상세 편집",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "테스트 케이스 편집",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "시나리오 편집", exact: true })
      .getByRole("complementary"),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      document
        .getAnimations()
        .filter((animation) => animation.playState === "running")
        .every(
          (animation) =>
            Number(animation.effect?.getComputedTiming().activeDuration ?? 0) <=
            1,
        ),
    ),
  ).toBe(true);
  const title = dialog.getByLabel("제목", { exact: true });
  await title.fill("모바일 패널 입력");
  await page.screenshot({
    path: testInfo.outputPath("mobile-case-dialog.png"),
    fullPage: true,
    animations: "disabled",
  });
  const close = dialog.getByRole("button", { name: "닫기", exact: true });
  await close.focus();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("모바일 패널 입력");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("미체크 값도 형식 변경 전에 명시적으로 비우고 삭제 개수에 포함한다", async ({
  page,
}) => {
  const control = await mockApi(page);
  const id = "30000000-0000-4000-8000-000000000003";
  const column = control.saved.columns.find((column) => column.id === id);
  if (!column) throw new Error("검증할 열이 없습니다.");
  column.name = "검토 완료";
  column.valueType = "checkbox";
  control.saved.cases[0].customValues[id] = false;
  await open(page);
  await columns(page);
  await page
    .getByRole("button", { name: "검토 완료 설정", exact: true })
    .click();
  await expect(page.getByLabel("형식", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "열 삭제", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "사용자 열 삭제", exact: true }),
  ).toContainText("테스트 케이스 1개의 값");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await columns(page);
  await page
    .getByRole("button", { name: "검토 완료 설정", exact: true })
    .click();
  await page.getByRole("button", { name: "값 비우기", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "열 값 비우기", exact: true }),
  ).toContainText("테스트 케이스 1개 값");
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect
    .poll(() => Object.hasOwn(control.saved.cases[0].customValues, id))
    .toBe(false);
  await columns(page);
  await page
    .getByRole("button", { name: "검토 완료 설정", exact: true })
    .click();
  await expect(page.getByLabel("형식", { exact: true })).toBeEnabled();
  await page.getByLabel("형식", { exact: true }).click();
  await page.getByRole("option", { name: "텍스트", exact: true }).click();
  await expect
    .poll(
      () => control.saved.columns.find((column) => column.id === id)?.valueType,
    )
    .toBe("text");
});
