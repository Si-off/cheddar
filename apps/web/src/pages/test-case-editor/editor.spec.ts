import { expect, type Page, test } from "@playwright/test";
import type {
  SheetContentDto,
  SheetSnapshotDto,
  SheetViewDto,
} from "@/shared/api/generated";

const projectId = "10000000-0000-4000-8000-000000000001";
const sheetId = "20000000-0000-4000-8000-000000000001";
function fixture(): SheetSnapshotDto {
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
    kind: "system" as const,
    field,
    name: names[index],
  }));
  return {
    id: sheetId,
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
        preconditions: "",
        steps: "",
        expectedResult: "",
        priority: null,
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
    requests: [] as SheetContentDto[],
    viewRequests: [] as SheetViewDto[],
    reject: false,
    rejectGet: false,
    loseResponse: false,
    hold: undefined as (() => void) | undefined,
    holdNext: false,
    holdViewNext: false,
    exports: [] as string[],
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
    if (path.endsWith("/sheets") && request.method() === "GET")
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
    if (path.endsWith(`/sheets/${sheetId}`))
      return control.rejectGet
        ? json(
            {
              error: {
                message: "일시적으로 시트를 불러오지 못했습니다.",
                requestId: "test",
                code: "DEPENDENCY_UNAVAILABLE",
              },
            },
            503,
          )
        : json(control.saved);
    if (path.endsWith("/content")) {
      const body = request.postDataJSON() as SheetContentDto;
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
      const body = request.postDataJSON() as SheetViewDto;
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
  await page.goto("/");
  await page.getByLabel("프로젝트", { exact: true }).selectOption(projectId);
  await page
    .getByRole("button", { name: "시트 하나 · 단위", exact: true })
    .click();
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
}
async function editTitle(page: Page, title: string) {
  await page
    .getByRole("gridcell", { name: "1행 제목", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill(title);
}
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
  expect(control.saved.cases[1].preconditions).toBe("다른 준비");
  await page.getByLabel("케이스 검색").fill("두 번째");
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toHaveText("두 번째");
  await paste(page, "1행 제목", "찾은 행만");
  await expect.poll(() => control.saved.cases[1].title).toBe("찾은 행만");
  expect(control.saved.cases[0].title).toBe("여러\n줄");
  await page.getByLabel("케이스 검색").fill("");
  const before = structuredClone(control.saved.cases);
  await paste(page, "1행 케이스 번호", "중복\n중복");
  await expect(page.getByRole("alert")).toContainText("중복된 케이스 번호");
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
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await page.getByLabel("너비", { exact: true }).first().fill("240");
  await expect(
    page.getByRole("status").filter({ hasText: "저장됨" }),
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
    page.getByRole("status").filter({ hasText: "저장됨" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await expect(page.getByLabel("열 이름", { exact: true }).first()).toHaveValue(
    "IA 화면",
  );
  await expect(page.getByLabel("너비", { exact: true }).first()).toHaveValue(
    "260",
  );
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
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await page.getByLabel("너비", { exact: true }).first().fill("240");
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
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await page.getByLabel("너비", { exact: true }).first().fill("240");
  control.hold?.();
  await expect(
    page.getByRole("status").filter({ hasText: "변경 충돌" }),
  ).toBeVisible();
  await expect(page.getByLabel("너비", { exact: true }).first()).toHaveValue(
    "240",
  );
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
    .getByRole("dialog", { name: "케이스 삭제", exact: true })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page.getByRole("button", { name: "행 추가", exact: true }).click();
  await page
    .getByRole("gridcell", { name: "2행 제목", exact: true })
    .dblclick();
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("전송 이후 추가행");
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await page.getByRole("button", { name: "열 삭제", exact: true }).click();
  await page
    .getByRole("dialog", { name: "사용자 열 삭제", exact: true })
    .getByRole("button", { name: "확인", exact: true })
    .click();
  await page
    .getByRole("button", { name: "텍스트 열 추가", exact: true })
    .click();
  await page
    .getByLabel("열 이름", { exact: true })
    .last()
    .fill("나중에 추가한 열");
  await page
    .getByRole("button", {
      name: "나중에 추가한 열 열 앞으로 이동",
      exact: true,
    })
    .click();
  control.hold?.();
  await expect(
    page.getByRole("status").filter({ hasText: "저장됨" }),
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
    page.getByRole("status").filter({ hasText: "저장됨" }),
  ).toBeVisible();
  const requests = control.requests.length;
  control.loseResponse = true;
  await page
    .getByRole("textbox", { name: "제목 편집", exact: true })
    .fill("응답 유실 입력");
  await expect.poll(() => control.requests.length).toBe(requests + 1);
  await expect(
    page.getByRole("status").filter({ hasText: "저장됨" }),
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
    page.getByRole("button", { name: "전체 시트 XLSX 내보내기" }),
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
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open("cheddar-sheet-drafts", 1);
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
  // Root-only integrations may need project/sheet selection after reload.
  if (await page.getByLabel("프로젝트", { exact: true }).isVisible()) {
    await page.getByLabel("프로젝트", { exact: true }).selectOption(projectId);
    await page
      .getByRole("button", { name: "시트 하나 · 단위", exact: true })
      .click();
  }
  await expect(page.getByRole("button", { name: "초안 복원" })).toBeVisible();
  expect(control.requests.length).toBe(requestCount);
  control.reject = false;
  await page.getByRole("button", { name: "초안 복원" }).click();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("새로고침 복구할 입력");
});

test("column edits persist, deletion confirms value loss, search still exports the saved whole sheet", async ({
  page,
}) => {
  const control = await mockApi(page);
  await open(page);
  await page.getByRole("button", { name: "열 설정", exact: true }).click();
  await page.getByRole("button", { name: "텍스트 열 추가" }).click();
  const names = page.getByLabel("열 이름", { exact: true });
  await names.last().fill("사용자 메모");
  await expect
    .poll(() => control.saved.columns.some((c) => c.name === "사용자 메모"))
    .toBe(true);
  await paste(page, "1행 사용자 메모", "지우기 전 메모");
  await expect
    .poll(() => Object.values(control.saved.cases[0].customValues))
    .toContain("지우기 전 메모");
  await page.getByRole("button", { name: "열 삭제", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "케이스 1개에 입력된 값",
  );
  await page.getByRole("button", { name: "확인", exact: true }).click();
  await expect
    .poll(() => control.saved.columns.some((c) => c.name === "사용자 메모"))
    .toBe(false);
  await expect(
    page.getByRole("status").filter({ hasText: "저장됨" }),
  ).toBeVisible();
  await page.getByLabel("케이스 검색").fill("검색 결과 없음");
  await expect(
    page.getByText("검색 결과가 없습니다", { exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 시트 XLSX 내보내기" }).click();
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
  const panel = page.getByRole("complementary", { name: "케이스 상세 편집" });
  await panel
    .getByLabel("수행 단계", { exact: true })
    .fill("상세 패널의 긴 내용\n두 번째 단계");
  await panel.getByLabel("업로드 묶음").selectOption(uploadId);
  await panel.getByRole("checkbox", { name: /주문 프레임/ }).click();
  await panel.getByRole("checkbox", { name: /ORDER-1 주문/ }).click();
  await page.clock.runFor(600);
  await expect
    .poll(() => control.saved.cases[0].steps)
    .toBe("상세 패널의 긴 내용\n두 번째 단계");
  expect(control.saved.cases[0].relatedFrameIds).toEqual([frameId]);
  expect(control.saved.cases[0].screenIds).toEqual([iaId]);
  if (process.env.EDITOR_CAPTURE_PATH) {
    await panel.evaluate((element) => {
      element.scrollTop = 0;
    });
    await page.screenshot({
      path: process.env.EDITOR_CAPTURE_PATH,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "상세 닫기" }).click();
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
  await page.getByLabel("케이스 검색").fill("500행 편집 유지");
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
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  control.reject = false;
  await page.getByRole("button", { name: "저장 다시 시도" }).click();
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
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "제목 편집", exact: true }),
  ).toHaveValue("다음 보관 성공");
});

test("internal header navigation and browser back preserve failed drafts and require explicit confirmation", async ({
  page,
}) => {
  const control = await mockApi(page);
  await page.goto(`/projects/${projectId}/sheets`);
  await page
    .getByRole("button", { name: "시트 하나 · 단위", exact: true })
    .click();
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  control.reject = true;
  await editTitle(page, "내부 이동에서 유지할 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog", {
    name: "저장되지 않은 입력이 있습니다",
  });
  await page.getByRole("button", { name: "시트 목록", exact: true }).click();
  await expect(dialog).toContainText("입력을 이 브라우저에 보관했습니다");
  await dialog.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sheets/${sheetId}$`));
  await page.getByRole("link", { name: "Cheddar", exact: true }).click();
  await expect(dialog).toContainText("입력을 이 브라우저에 보관했습니다");
  await dialog.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/sheets/${sheetId}$`));
  await expect(
    page.getByRole("gridcell", { name: "1행 제목", exact: true }),
  ).toContainText("내부 이동에서 유지할 입력");
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "초안 보관 후 이동", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/sheets$`));
  await page.goto(`/projects/${projectId}/sheets/${sheetId}`);
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
  await page.goto(`/projects/${projectId}/sheets/${sheetId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "어디에도 저장되지 않은 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Cheddar", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "저장되지 않은 입력이 있습니다",
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
  await page.goto(`/projects/${projectId}/sheets/${sheetId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "메모리에만 남은 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
  ).toBeVisible();
  control.rejectGet = true;
  const response = page.waitForResponse(
    (r) => r.url().endsWith(`/sheets/${sheetId}`) && r.status() === 503,
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
    .filter({ hasText: "시트의 최신 저장 내용을 확인하지 못했습니다" });
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
  await page
    .getByRole("button", { name: "저장 다시 시도", exact: true })
    .click();
  await expect
    .poll(() => control.saved.cases[0].title)
    .toBe("메모리에만 남은 입력");
});

test("restoring an old draft during an in-flight save cannot clear its conflict or submit it automatically", async ({
  page,
}) => {
  const control = await mockApi(page);
  control.reject = true;
  await page.goto(`/projects/${projectId}/sheets/${sheetId}`);
  await expect(
    page.getByRole("grid", { name: "테스트 케이스 편집" }),
  ).toBeVisible();
  await editTitle(page, "복원할 옛 입력");
  await expect(
    page.getByRole("status").filter({ hasText: "저장하지 못함" }),
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
