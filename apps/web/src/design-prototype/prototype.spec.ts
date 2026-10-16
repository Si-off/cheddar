import { expect, type Page, test } from "@playwright/test";

const entry = "/design-prototype.html";
async function order(page: Page, query = "") {
  await page.goto(entry + query);
  await page.getByRole("button", { name: /커머스 웹/ }).click();
  await page.getByRole("button", { name: /주문·결제 테스트/ }).click();
  await expect(page.getByRole("table")).toBeVisible();
}
async function layout(page: Page, name: "표" | "QA 진행") {
  await page.getByRole("button", { name: "보기 설정", exact: true }).click();
  await page.getByRole("button", { name: /레이아웃/ }).click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function menu(page: Page, name: string) {
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await page.getByRole("button", { name, exact: true }).click();
}
async function capture(page: Page, name: string) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    animations: "disabled",
    path: test.info().outputPath(name),
  });
}

test("기본 표는 모든 테스트와 설정한 항목을 보여주며 QA 보기도 목록을 유지한다", async ({
  page,
}) => {
  await order(page);
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(13);
  for (const name of [
    "테스트 ID",
    "기능 구분",
    "테스트 항목",
    "화면 ID",
    "사전 조건",
    "테스트 데이터",
    "수행 절차",
    "예상 결과",
  ])
    await expect(
      page.getByRole("columnheader", { name: new RegExp(name) }),
    ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "QA 진행", exact: true }),
  ).toHaveCount(0);
  await capture(page, "table-desktop.png");
  await page.getByRole("button", { name: "보기 설정", exact: true }).click();
  await page.getByRole("button", { name: /레이아웃/ }).click();
  await expect(page.getByRole("dialog", { name: "레이아웃" })).toBeVisible();
  await capture(page, "layout-dropdown.png");
  await page.getByRole("button", { name: "이전 설정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "보기 설정" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "보기 설정", exact: true }),
  ).toBeFocused();
  await layout(page, "QA 진행");
  await expect(
    page.getByRole("combobox", { name: /^테스트 결과 \d+$/ }),
  ).toHaveCount(12);
  await page.getByRole("button", { name: /TC-001 상품 옵션/ }).click();
  await page.getByRole("button", { name: /TC-002 장바구니/ }).click();
  await expect(
    page.getByText("구매 가능한 상품이 있다.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("장바구니에 상품이 1개 있다.", { exact: true }),
  ).toBeVisible();
  await capture(page, "qa-list.png");
});

test("QA 결과·메모와 표 편집이 연결되고 새로고침은 메모리 상태를 초기화한다", async ({
  page,
}) => {
  await order(page);
  await layout(page, "QA 진행");
  await page
    .getByRole("combobox", { name: "테스트 결과 1", exact: true })
    .selectOption("통과");
  await page.getByRole("button", { name: /TC-001 상품 옵션/ }).click();
  await page.getByRole("button", { name: "메모 TC-1", exact: true }).click();
  await page
    .getByRole("textbox", { name: "QA 메모", exact: true })
    .fill("실기기 확인 완료");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await layout(page, "표");
  await page
    .getByRole("textbox", { name: "테스트 항목 1", exact: true })
    .fill("옵션 선택 검증 수정");
  await layout(page, "QA 진행");
  await expect(
    page.getByRole("combobox", { name: "테스트 결과 1", exact: true }),
  ).toHaveValue("미진행");
  const expanded = page.getByRole("button", {
    name: /TC-001 옵션 선택 검증 수정/,
  });
  if ((await expanded.getAttribute("aria-expanded")) !== "true")
    await expanded.click();
  await page.getByRole("button", { name: "메모 TC-1", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "QA 메모" })).toHaveValue(
    "실기기 확인 완료",
  );
  expect(
    await page.evaluate(() => [localStorage.length, sessionStorage.length]),
  ).toEqual([0, 0]);
  await page.reload();
  await page.getByRole("button", { name: /커머스 웹/ }).click();
  await page.getByRole("button", { name: /주문·결제 테스트/ }).click();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("상품 옵션을 선택하고 장바구니에 담기");
});

test("여러 셀 붙여넣기, 삭제 복원, 사용자 정의 열", async ({ page }) => {
  await order(page);
  await page
    .getByRole("textbox", { name: "기능 구분 1", exact: true })
    .evaluate((el) => {
      const event = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(event, "clipboardData", {
        value: { getData: () => "장바구니 검증\t붙여넣은 테스트" },
      });
      el.dispatchEvent(event);
    });
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("붙여넣은 테스트");
  await page.getByRole("checkbox", { name: "TC-1 선택", exact: true }).check();
  await page.getByRole("button", { name: "선택한 테스트 케이스 삭제" }).click();
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("붙여넣은 테스트");
  await page.getByRole("button", { name: "보기 설정", exact: true }).click();
  await page.getByRole("button", { name: "열", exact: true }).click();
  await expect(page.getByRole("slider")).toHaveCount(0);
  await page.getByRole("button", { name: "열 추가", exact: true }).click();
  await page
    .getByRole("textbox", { name: "열 이름", exact: true })
    .fill("담당자");
  await page
    .getByRole("dialog", { name: "열 설정", exact: true })
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("textbox", { name: "담당자 1", exact: true })
    .fill("QA 담당");
  await expect(
    page.getByRole("textbox", { name: "담당자 1", exact: true }),
  ).toHaveValue("QA 담당");
});

test("테이블 경계선 드래그로 열 너비와 행 높이를 조절한다", async ({
  page,
}) => {
  await order(page);
  const handle = page.getByRole("button", {
    name: "테스트 항목 열 너비 조절",
    exact: true,
  });
  const beforeWidth = await page
    .getByRole("textbox", { name: "테스트 항목 1", exact: true })
    .boundingBox();
  const edge = await handle.boundingBox();
  if (!edge || !beforeWidth) throw new Error("열 경계선이 없습니다.");
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + 80, edge.y + edge.height / 2, { steps: 6 });
  await page.mouse.up();
  const afterWidth = await page
    .getByRole("textbox", { name: "테스트 항목 1", exact: true })
    .boundingBox();
  expect(afterWidth?.width).toBeGreaterThan(beforeWidth.width + 50);
  const row = page
    .getByRole("checkbox", { name: "TC-1 선택", exact: true })
    .locator("..")
    .locator("..");
  const beforeHeight = await row.boundingBox();
  const border = await page
    .getByRole("button", { name: "TC-1 행 높이 조절", exact: true })
    .boundingBox();
  if (!border || !beforeHeight) throw new Error("행 경계선이 없습니다.");
  await page.mouse.move(border.x + 100, border.y + border.height / 2);
  await page.mouse.down();
  await page.mouse.move(border.x + 100, border.y + 65, { steps: 6 });
  await page.mouse.up();
  expect((await row.boundingBox())?.height).toBeGreaterThan(
    beforeHeight.height + 40,
  );
});

test("후보 수정·추가·제외·복원과 추가된 행으로 이동", async ({ page }) => {
  await order(page);
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await page.getByRole("button", { name: /검토 후보/ }).click();
  await page.locator("summary").first().click();
  await page
    .getByRole("button", { name: "검토 후보 편집", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "테스트 항목", exact: true })
    .fill("네트워크 복구 후 주문 확인");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "시나리오에 추가", exact: true })
    .click();
  await page.locator("summary").first().click();
  await page.getByRole("button", { name: "제외", exact: true }).click();
  await page.getByLabel("검토 후보 상태").selectOption("excluded");
  await page.locator("summary").first().click();
  await page.getByRole("button", { name: "다시 검토", exact: true }).click();
  await page.getByLabel("검토 후보 상태").selectOption("added");
  await page.locator("summary").first().click();
  await expect(
    page.getByRole("button", { name: "시나리오에 추가", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "추가된 테스트 케이스 보기", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 13", exact: true }),
  ).toHaveValue("네트워크 복구 후 주문 확인");
});

test("생성 실패와 취소는 기존 데이터를 보존하며 재시도할 수 있다", async ({
  page,
}) => {
  await order(page, "?scenario=generation-error");
  await page
    .getByRole("textbox", { name: "테스트 항목 1", exact: true })
    .fill("보존할 수정 내용");
  await menu(page, "테스트 케이스 생성");
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await page.getByRole("button", { name: "다시 생성", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "테스트 케이스를 생성하지 못했습니다",
  );
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("보존할 수정 내용");
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await page
    .getByRole("button", { name: "시나리오 메뉴", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /검토 후보/ })).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page.waitForTimeout(3800);
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("보존할 수정 내용");
  await menu(page, "테스트 케이스 생성");
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await page.getByRole("button", { name: "다시 생성", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("상품 옵션을 선택하고 장바구니에 담기");
});

test("공용 양식 변경은 새 시나리오에 반영되고 기존 시나리오를 보존한다", async ({
  page,
}) => {
  await order(page);
  await page
    .getByRole("button", { name: "프로젝트 목록", exact: true })
    .click();
  await page.getByRole("button", { name: "공용 양식", exact: true }).click();
  await page.getByRole("button", { name: /기본 테스트 양식/ }).click();
  await page
    .getByRole("button", { name: "기능 구분 설정", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "열 이름", exact: true })
    .fill("업무 구분");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "변경 적용", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "변경 적용", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: /기본 테스트 양식/ }),
  ).toContainText("업무 구분");
  await page
    .getByRole("button", { name: "프로젝트 목록", exact: true })
    .click();
  await page.getByRole("button", { name: /커머스 웹/ }).click();
  await page.getByRole("button", { name: /주문·결제 테스트/ }).click();
  await expect(
    page.getByRole("columnheader", { name: /기능 구분/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "이전 화면", exact: true }).click();
  await page
    .getByRole("button", { name: "시나리오 추가", exact: true })
    .click();
  await page
    .getByRole("button", { name: "빈 시나리오 만들기", exact: true })
    .click();
  await expect(page.getByRole("dialog", { name: "새 시나리오" })).toContainText(
    "업무 구분",
  );
  await page
    .getByRole("button", { name: "시나리오 만들기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "테스트 케이스 추가", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("textbox", { name: "업무 구분", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "테스트 항목", exact: true })
    .fill("새 양식 검증");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(
    page.getByRole("columnheader", { name: /업무 구분/ }),
  ).toBeVisible();
});

test("빈 프로젝트에서 설명만으로 생성하며 외부 API를 호출하지 않는다", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => {
    if (["fetch", "xhr"].includes(r.resourceType())) requests.push(r.url());
  });
  await page.goto(`${entry}?scenario=empty`);
  await page
    .getByRole("button", { name: "프로젝트 만들기", exact: true })
    .last()
    .click();
  await page
    .getByRole("textbox", { name: "프로젝트 이름" })
    .fill("신규 프로젝트");
  await page.getByRole("button", { name: "만들기", exact: true }).click();
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await page
    .getByRole("button", { name: "시나리오 만들기", exact: true })
    .click();
  await page.getByRole("button", { name: "설명만으로 시작" }).click();
  await page
    .getByRole("textbox", { name: "확인할 내용" })
    .fill("주문 결제를 확인합니다.");
  await page
    .getByRole("button", { name: "테스트 케이스 생성", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "테스트 케이스 생성 중" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "테스트 항목 1", exact: true }),
  ).toHaveValue("상품 옵션을 선택하고 장바구니에 담기");
  expect(requests).toEqual([]);
});

test("IA 파일은 조건을 안내하고 중복 ID를 수정한 뒤 반영한다", async ({
  page,
}) => {
  await order(page);
  await page.getByRole("button", { name: "이전 화면", exact: true }).click();
  await page.getByRole("button", { name: "프로젝트 메뉴" }).click();
  await page
    .getByRole("button", { name: "화면 목록 (IA)", exact: true })
    .click();
  await page
    .getByRole("button", { name: "IA 파일 가져오기", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "첫 행은 제목으로 제외합니다",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "screens.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      '화면 ID,화면 이름\nSHOP-01,검색 결과\nSEARCH-02,"검색, 상세"',
    ),
  });
  await expect(
    page.getByRole("button", { name: "2개 화면 추가" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "화면 ID 1", exact: true })
    .fill("SEARCH-01");
  await page.getByRole("button", { name: "2개 화면 추가" }).click();
  await expect(
    page.getByRole("button", { name: /SEARCH-01 검색 결과/ }),
  ).toBeVisible();
});

test("흐름 초안 검토·노드 편집·실행 취소", async ({ page }) => {
  await order(page);
  await menu(page, "사용자 흐름");
  await page
    .getByRole("button", { name: "자료에서 가져오기", exact: true })
    .click();
  await page.getByRole("button", { name: "Figma 화면 분석" }).click();
  await expect(page.getByRole("status")).toContainText("흐름 분석 중");
  await page.getByRole("button", { name: "흐름 적용" }).click();
  await page.getByRole("button", { name: "시작 시작", exact: true }).click();
  await page
    .getByRole("textbox", { name: "내용", exact: true })
    .fill("테스트 시작");
  await page.getByRole("button", { name: "적용", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "시작 테스트 시작", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "실행 취소", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "시작 시작", exact: true }),
  ).toBeVisible();
  await capture(page, "flow.png");
});

test("전체 시나리오 XLSX는 양식 이름과 데이터를 보존하며 공유는 읽기 전용이다", async ({
  page,
}) => {
  await order(page);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await page.getByRole("textbox", { name: "검색어" }).fill("옵션");
  await menu(page, "XLSX 내보내기");
  await expect(page.getByRole("dialog")).toContainText(
    "전체 테스트 케이스 12개",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX 다운로드" }).click();
  const path = test.info().outputPath("cases.xlsx");
  await (await download).saveAs(path);
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  expect(workbook.worksheets[0].rowCount).toBe(13);
  expect(workbook.worksheets[0].getCell("B1").text).toBe("기능 구분");
  expect(workbook.worksheets[0].getCell("C2").text).toContain("상품 옵션");
  expect(workbook.worksheets[0].getCell("F1").text).toBe("테스트 데이터");
  await menu(page, "공유");
  await page.getByRole("button", { name: "공유 시나리오 미리보기" }).click();
  await expect(page.getByText("읽기 전용", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(13);
  await page
    .getByRole("button", { name: "상세 보기 TC-1", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("테스트 데이터");
  await expect(page.getByRole("dialog").locator("img, canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /관련 화면/ })).toHaveCount(0);
  await capture(page, "shared-test-scenario-detail.png");
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await layout(page, "QA 진행");
  await page.getByRole("button", { name: /TC-001 상품 옵션/ }).click();
  await expect(page.getByRole("button", { name: /관련 화면/ })).toHaveCount(0);
  await layout(page, "표");
  await expect(page.getByRole("table").getByRole("textbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "테스트 케이스 추가", exact: true }),
  ).toHaveCount(0);
});

test("좁은 화면에서 표 내부만 가로 스크롤하고 드롭다운의 포커스를 복원한다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await order(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await capture(page, "table-mobile.png");
  await page.getByRole("button", { name: "보기 설정", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "보기 설정", exact: true }),
  ).toBeFocused();
  await layout(page, "QA 진행");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("일부 가져오기 실패에서 성공한 화면으로 계속하거나 재시도한다", async ({
  page,
}) => {
  await page.goto(`${entry}?from=figma&scenario=partial-import`);
  await expect(
    page.getByRole("button", { name: "주문 완료 미리보기", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "다시 가져오기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "주문 완료 미리보기", exact: true }),
  ).toBeVisible();
});

test("플러그인에서 선택한 화면과 웹의 양식 선택이 연결된다", async ({
  page,
}) => {
  await page.goto("http://127.0.0.1:5174/design-prototype.html");
  await page.getByRole("checkbox", { name: "장바구니 포함" }).uncheck();
  await capture(page, "plugin-gallery.png");
  await page.getByRole("button", { name: "상품 상세 미리보기" }).click();
  await page.getByRole("button", { name: "이전 화면", exact: true }).click();
  await page.getByRole("button", { name: "웹에서 계속", exact: true }).click();
  await expect(page).toHaveURL(/from=figma/);
  await expect(
    page.getByRole("heading", { name: "가져온 화면" }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox").nth(2)).not.toBeChecked();
  await page.getByRole("button", { name: "테스트 준비", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "새 시나리오" })).toBeVisible();
  await page
    .getByRole("button", { name: "시나리오 만들기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "테스트 범위", exact: true }),
  ).toBeVisible();
});
