import { expect, type Page, test } from "@playwright/test";
import { me, mockApi } from "../../shared/testing/mock-api";
import {
  cases,
  columns,
  defaultViewResponse,
  testSet,
  testSetResponses,
} from "../../shared/testing/test-set-fixtures";

type Op = { type: string; [key: string]: unknown };

const opsHandler = () => {
  let version = 1;
  return () => ({ version: ++version, cases: [], deletedCaseIds: [] });
};
const opsBodies = (calls: { key: string; body: unknown }[]) =>
  calls
    .filter((c) => c.key === "POST /api/v1/test-sets/t1/ops")
    .map((c) => (c.body as { ops: Op[] }).ops);

const resultColumn = {
  id: "c-qa",
  presetKey: "qa_result",
  systemKey: null,
  name: "QA 결과",
  type: "select",
  description: "",
  options: ["Pass", "Fail", "Deferred", "N/A", "-", "추가 요청"],
};

const openCanvas = async (
  page: Page,
  overrides: Record<string, unknown> = {},
) => {
  const calls = await mockApi(page, {
    "GET /api/v1/auth/me": me(),
    ...testSetResponses({
      "GET /api/v1/test-sets/t1/view": {
        ...defaultViewResponse,
        view: "canvas",
      },
      "POST /api/v1/test-sets/t1/ops": opsHandler(),
      ...overrides,
    }),
  });
  await page.goto("/test-sets/t1");
  await expect(page.getByRole("region", { name: "캔버스" })).toBeVisible();
  return calls;
};
const lane = (page: Page, name: string) =>
  page.getByRole("listitem", { name, exact: true });

test("QA 결과 열이 없으면 결과 요약을 두지 않는다", async ({ page }) => {
  await openCanvas(page);
  await expect(lane(page, "이메일 가입")).toContainText("TC-001");
  await expect(page.getByRole("group", { name: "결과" })).toHaveCount(0);
});

test("QA 결과 열이 있으면 결과 요약을 보여주고, 누른 결과의 카드만 또렷하게 한다", async ({
  page,
}) => {
  await openCanvas(page, {
    "GET /api/v1/test-sets/t1": {
      ...testSet,
      columns: [...columns, resultColumn],
      cases: [
        { ...cases[0], values: { ...cases[0]?.values, "c-qa": "Fail" } },
        cases[1],
      ],
    },
  });
  const summary = page.getByRole("group", { name: "결과" });
  await expect(summary.getByRole("button")).toHaveText(["Fail 1", "미진행 1"]);
  await expect(lane(page, "이메일 가입")).toContainText("결과 입력 1/1");
  await summary.getByRole("button", { name: "Fail 1" }).click();
  await expect(summary.getByRole("button", { name: "Fail 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("상세로 바꾸면 카드 안에서 모든 열을 고친다", async ({ page }) => {
  const calls = await openCanvas(page);
  await page
    .getByRole("toolbar", { name: "테스트 세트 도구" })
    .getByRole("button", { name: "표시" })
    .click();
  await page.getByRole("menuitemcheckbox", { name: "상세" }).click();
  const card = page.getByRole("article", { name: /TC-001/ });
  const expected = card.getByRole("textbox", { name: "예상 결과" });
  await expected.fill("오류 문구와 입력 칸 강조");
  await expected.press("Enter");
  await expect
    .poll(() => opsBodies(calls)[0])
    .toEqual([
      {
        type: "set_cell",
        caseId: "k1",
        columnId: "c-exp",
        value: "오류 문구와 입력 칸 강조",
      },
    ]);
  await expect
    .poll(
      () =>
        calls.filter((c) => c.key === "PUT /api/v1/test-sets/t1/view").at(-1)
          ?.body,
    )
    .toMatchObject({ canvasDensity: "detail" });
});

test("열의 +로 그 그룹에 케이스를 더한다", async ({ page }) => {
  const calls = await openCanvas(page);
  await lane(page, "약관 동의")
    .getByRole("button", { name: "약관 동의 케이스 추가" })
    .click();
  await expect
    .poll(() => opsBodies(calls)[0]?.[0])
    .toMatchObject({
      type: "add_case",
      afterCaseId: "k2",
      featureGroupId: "g2",
    });
});

test("확대와 축소 버튼으로 크기만 바꾸고, 비율을 누르면 100%로 돌아온다", async ({
  page,
}) => {
  await openCanvas(page);
  const zoom = page.getByRole("group", { name: "확대와 축소" });
  await zoom.getByRole("button", { name: "확대", exact: true }).click();
  await expect(zoom).toContainText("125%");
  await zoom.getByRole("button", { name: /확대 비율/ }).click();
  await expect(zoom).toContainText("100%");
  await expect(lane(page, "이메일 가입")).toContainText("TC-001");
});
