import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const apiPort = Number(process.env.SETTINGS_TEST_API_PORT ?? 3104);
const apiBase = `http://127.0.0.1:${apiPort}`;
type TestLease = {
  config: {
    databaseUrl: string;
    storageRoot: string;
    port: number;
    corsOrigins: string[];
  };
  folder: string;
  projects: string[];
  close: () => Promise<void>;
};
let lease: TestLease;
let output: string;
let stopApi: () => Promise<void> = async () => {};

test.beforeAll(async () => {
  test.setTimeout(60000);
  const apiRoot = fileURLToPath(new URL("../../../../api/", import.meta.url));
  output = await mkdtemp(
    join(await realpath(tmpdir()), "cheddar-settings-browser-"),
  );
  try {
    const result = spawnSync(
      process.execPath,
      [
        join(apiRoot, "node_modules/typescript/bin/tsc"),
        "-p",
        join(apiRoot, "tsconfig.test.json"),
        "--outDir",
        output,
      ],
      { encoding: "utf8" },
    );
    if (result.status !== 0)
      throw new Error(
        `API test compilation failed: ${result.stdout}${result.stderr}`,
      );
    await writeFile(join(output, "package.json"), '{"type":"commonjs"}\n');
    await symlink(
      join(apiRoot, "node_modules"),
      join(output, "node_modules"),
      "dir",
    );
    const load = createRequire(join(output, "package.json"));
    load("reflect-metadata");
    process.env.API_SOURCE_ROOT = apiRoot;
    const helper = load(join(output, "test/database.js")) as {
      openTestDatabase: () => Promise<TestLease>;
    };
    lease = await helper.openTestDatabase();
    const { Test } = load("@nestjs/testing");
    const { appModule } = load(join(output, "src/app.module.js"));
    const { configureApp } = load(join(output, "src/common/application.js"));
    const config = {
      ...lease.config,
      port: apiPort,
      corsOrigins: [process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5177"],
    };
    const module = await Test.createTestingModule({
      imports: [appModule(config, lease.folder)],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    stopApi = () => app.close();
    configureApp(app, config);
    await app.listen(apiPort, "127.0.0.1");
  } catch (error) {
    await stopApi();
    await lease?.close();
    await rm(output, { recursive: true, force: true });
    throw error;
  }
});
test.afterAll(async () => {
  await stopApi();
  await lease?.close();
  if (output) await rm(output, { recursive: true, force: true });
});

test.beforeEach(async ({ page, request }) => {
  const response = await request.post(`${apiBase}/api/v1/projects`, {
    data: { name: "프로젝트 설정 검증" },
  });
  expect(response.status()).toBe(201);
  const project = await response.json();
  lease.projects.push(project.id);
  await page.goto(`/projects/${project.id}/settings`);
  await expect(
    page.getByRole("heading", { name: "프로젝트 설정", exact: true }),
  ).toBeVisible();
});

test("프로젝트 편집은 저장·재조회하고 미저장 이동에서 입력을 보존한다", async ({
  page,
}) => {
  const name = page.getByLabel("프로젝트 이름");
  await name.fill("주문 QA 한글 입력");
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "계속 편집", exact: true }).click();
  await expect(name).toHaveValue("주문 QA 한글 입력");
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await page
    .getByRole("button", { name: "저장하고 이동", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "IA 추가", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "기본 정보", exact: true }).click();
  await expect(name).toHaveValue("주문 QA 한글 입력");
  await page.getByRole("link", { name: "업로드", exact: true }).click();
  await expect(page).toHaveURL(/\/uploads$/);
  await page.getByRole("link", { name: "프로젝트 설정", exact: true }).click();
  await expect(name).toHaveValue("주문 QA 한글 입력");
  await name.fill("버릴 내용");
  await page.getByRole("link", { name: "Cheddar", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "버리고 이동", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("IA 등록·중복 오류·계층 변경과 참조 중 삭제 제한을 실제 API로 확인한다", async ({
  page,
}, testInfo) => {
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  await page.getByLabel("화면 ID", { exact: true }).fill("ORDER-01");
  await page.getByLabel("화면 이름", { exact: true }).fill("주문");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.getByRole("button", { name: "IA 추가", exact: true }).click();
  await page.getByLabel("화면 ID", { exact: true }).fill("ORDER-01");
  await page.getByLabel("화면 이름", { exact: true }).fill("결제");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("이미 사용 중인 화면 ID");
  await expect(page.getByLabel("화면 이름", { exact: true })).toHaveValue(
    "결제",
  );
  await page.getByLabel("화면 ID", { exact: true }).fill("PAY-01");
  await page.getByLabel("상위 항목", { exact: true }).click();
  await page
    .getByRole("option", { name: "ORDER-01 · 주문", exact: true })
    .click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.screenshot({
    path: testInfo.outputPath("settings-ia.png"),
    fullPage: true,
  });
  await page
    .getByRole("list", { name: "IA 목록", exact: true })
    .getByRole("button")
    .filter({ hasText: "ORDER-01" })
    .filter({ hasNotText: "PAY-01" })
    .click();
  await page.getByRole("button", { name: "IA 삭제", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("하위 IA 항목");
  await expect(page.getByLabel("화면 ID", { exact: true })).toHaveValue(
    "ORDER-01",
  );
  await page.getByLabel("상위 항목", { exact: true }).click();
  await expect(
    page.getByRole("option", { name: "PAY-01 · 결제", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
});

test("기본 양식의 이름·너비·순서·텍스트 열은 저장 후 유지된다", async ({
  page,
  request,
}, testInfo) => {
  const projectId = new URL(page.url()).pathname.split("/")[2];
  const beforeResponse = await request.post(
    `${apiBase}/api/v1/projects/${projectId}/sheets`,
    { data: { name: "양식 변경 전", kind: "unit" } },
  );
  expect(beforeResponse.status()).toBe(201);
  const before = await beforeResponse.json();
  await page.getByRole("tab", { name: "기본 양식", exact: true }).click();
  await expect(
    page.getByText("변경한 양식은 새 시트에만 적용됩니다."),
  ).toBeVisible();
  await page.getByRole("button", { name: "열 추가", exact: true }).click();
  await page.getByLabel("열 이름", { exact: true }).last().fill("품질 메모");
  await page.getByLabel("너비", { exact: true }).last().fill("260");
  await page
    .getByRole("button", { name: "품질 메모 위로", exact: true })
    .click();
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  const response = await request.get(
    `${apiBase}/api/v1/projects/${projectId}/template`,
  );
  const stored = await response.json();
  const custom = stored.columns.find(
    (column: { name: string }) => column.name === "품질 메모",
  );
  expect(custom.valueType).toBe("text");
  expect(stored.view[7]).toEqual({ columnId: custom.id, width: 260 });
  const existing = await (
    await request.get(
      `${apiBase}/api/v1/projects/${projectId}/sheets/${before.id}`,
    )
  ).json();
  expect(existing).toEqual(before);
  const afterResponse = await request.post(
    `${apiBase}/api/v1/projects/${projectId}/sheets`,
    { data: { name: "양식 변경 후", kind: "unit" } },
  );
  expect(afterResponse.status()).toBe(201);
  const after = await afterResponse.json();
  expect(after.sourceTemplateRevision).toBe(stored.revision);
  expect(
    after.columns.some(
      (column: { name: string }) => column.name === "품질 메모",
    ),
  ).toBe(true);
  expect(
    after.columns.every(
      (column: { id: string }) =>
        !stored.columns.some(
          (original: { id: string }) => original.id === column.id,
        ),
    ),
  ).toBe(true);

  await page.reload();
  await page.getByRole("tab", { name: "기본 양식", exact: true }).click();
  await expect(page.getByLabel("열 이름", { exact: true }).nth(7)).toHaveValue(
    "품질 메모",
  );
  await expect(page.getByLabel("너비", { exact: true }).nth(7)).toHaveValue(
    "260",
  );
  await page.screenshot({
    path: testInfo.outputPath("settings-template.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "품질 메모 열 삭제", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await expect(page.getByLabel("열 이름", { exact: true })).toHaveCount(8);
});

test("동시 수정 충돌에서 초안과 최신 저장 내용을 각각 확인한다", async ({
  page,
  request,
}) => {
  await page.getByLabel("프로젝트 이름").fill("내 편집 내용");
  const projectId = new URL(page.url()).pathname.split("/")[2];
  const response = await request.get(`${apiBase}/api/v1/projects/${projectId}`);
  const current = await response.json();
  expect(
    (
      await request.patch(`${apiBase}/api/v1/projects/${projectId}`, {
        data: { expectedRevision: current.revision, name: "다른 창의 수정" },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("다른 변경 사항");
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("내 편집 내용");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "최신 저장 내용 확인", exact: true })
    .click();
  await expect(
    page.getByRole("definition").filter({ hasText: "다른 창의 수정" }),
  ).toBeVisible();
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("내 편집 내용");
  await page
    .getByRole("button", { name: "입력 버리고 불러오기", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "버리고 불러오기", exact: true })
    .click();
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("다른 창의 수정");
});

test("저장 응답 유실과 네트워크 실패에서 확인 전 재전송하지 않는다", async ({
  page,
}) => {
  const endpoint = "**/api/v1/projects/*";
  await page.getByLabel("프로젝트 이름").fill("응답 유실 확인");
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fetch();
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장 요청 결과");
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("응답 유실 확인");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeDisabled();
  await page.unroute(endpoint);
  await page
    .getByRole("button", { name: "저장 결과 확인", exact: true })
    .click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.getByLabel("프로젝트 이름").fill("아직 전송 안 됨");
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "PATCH") await route.abort("failed");
    else await route.continue();
  });
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("저장 요청 결과");
  await page.unroute(endpoint);
  await page
    .getByRole("button", { name: "저장 결과 확인", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("저장되지 않았습니다");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("아직 전송 안 됨");
});

test("좁은 화면에서 필수 입력 오류와 키보드 탭 이동을 확인한다", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("프로젝트 이름").fill("");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(
    page.getByText("이름을 입력해주세요.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("프로젝트 이름")).toBeFocused();
  await page.getByLabel("프로젝트 이름").fill("모바일 키보드 한글");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  await page.getByRole("tab", { name: "기본 정보", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "IA 추가", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("settings-mobile.png"),
    fullPage: true,
  });
});

test("조회 갱신 실패와 복구 중에도 현재 입력을 유지한다", async ({ page }) => {
  await page.getByLabel("프로젝트 이름").fill("유지할 초안");
  const endpoint = "**/api/v1/projects/*";
  await page.route(endpoint, async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "DEPENDENCY_UNAVAILABLE" } }),
      });
    else await route.continue();
  });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByRole("alert")).toContainText("이전에 불러온 내용", {
    timeout: 15000,
  });
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("유지할 초안");
  await page.unroute(endpoint);
  await page
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("유지할 초안");
});

test("서버 재조회는 깨끗한 편집값만 갱신하고 미저장 초안은 충돌로 보호한다", async ({
  page,
  request,
}) => {
  const projectId = new URL(page.url()).pathname.split("/")[2];
  const endpoint = `${apiBase}/api/v1/projects/${projectId}`;
  let current = await (await request.get(endpoint)).json();
  expect(
    (
      await request.patch(endpoint, {
        data: { expectedRevision: current.revision, name: "최신 기본 정보" },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("최신 기본 정보");
  await page.getByLabel("프로젝트 이름").fill("유지할 내 초안");
  current = await (await request.get(endpoint)).json();
  expect(
    (
      await request.patch(endpoint, {
        data: { expectedRevision: current.revision, name: "서버의 다음 수정" },
      })
    ).status(),
  ).toBe(200);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(page.getByRole("alert")).toContainText("다른 변경 사항");
  await expect(page.getByLabel("프로젝트 이름")).toHaveValue("유지할 내 초안");
  await expect(
    page.getByRole("button", { name: "저장", exact: true }),
  ).toBeDisabled();
});

for (const kind of ["project", "template"] as const) {
  for (const dirtyAfterSave of [false, true]) {
    test(`${kind}: 저장 전 지연 조회는 저장 후 ${dirtyAfterSave ? "미저장 입력" : "화면과 탭 재진입"}을 되돌리지 않는다`, async ({
      page,
    }) => {
      const projectId = new URL(page.url()).pathname.split("/")[2];
      const endpoint = `${apiBase}/api/v1/projects/${projectId}${kind === "template" ? "/template" : ""}`;
      if (kind === "template")
        await page.getByRole("tab", { name: "기본 양식", exact: true }).click();
      const input =
        kind === "project"
          ? page.getByLabel("프로젝트 이름")
          : page.getByLabel("너비", { exact: true }).first();
      const savedValue = kind === "project" ? "저장한 새 이름" : "240";
      const draftValue = kind === "project" ? "다음 미저장 이름" : "280";
      await input.fill(savedValue);
      let release = () => {};
      let captured = () => {};
      let completed = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        captured = resolve;
      });
      const finished = new Promise<void>((resolve) => {
        completed = resolve;
      });
      let held = false;
      await page.route(endpoint, async (route) => {
        if (route.request().method() !== "GET" || held) {
          await route.continue();
          return;
        }
        held = true;
        const response = await route.fetch();
        captured();
        await gate;
        try {
          await route.fulfill({ response });
        } catch {
          // A successful save may cancel the original browser request.
        } finally {
          completed();
        }
      });
      try {
        await page.evaluate(() =>
          window.dispatchEvent(new Event("visibilitychange")),
        );
        await ready;
        await page.getByRole("button", { name: "저장", exact: true }).click();
        await expect(page.getByRole("status")).toHaveText("저장됨");
        if (dirtyAfterSave) await input.fill(draftValue);
        release();
        await finished;
        await page.evaluate(
          () =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              );
            }),
        );
        await expect(input).toHaveValue(
          dirtyAfterSave ? draftValue : savedValue,
        );
        await expect(page.getByRole("alert")).toHaveCount(0);
        if (dirtyAfterSave) {
          await page.getByRole("button", { name: "저장", exact: true }).click();
          await expect(page.getByRole("status")).toHaveText("저장됨");
        } else {
          await page.getByRole("tab", { name: "IA", exact: true }).click();
          await page
            .getByRole("tab", {
              name: kind === "project" ? "기본 정보" : "기본 양식",
              exact: true,
            })
            .click();
          await expect(input).toHaveValue(savedValue);
        }
      } finally {
        release();
      }
    });
  }
}

test("기본 양식 너비 상한을 넘는 입력은 저장하지 않고 수정할 수 있다", async ({
  page,
  request,
}) => {
  const projectId = new URL(page.url()).pathname.split("/")[2];
  const endpoint = `${apiBase}/api/v1/projects/${projectId}/template`;
  const before = await (await request.get(endpoint)).json();
  await page.getByRole("tab", { name: "기본 양식", exact: true }).click();
  const width = page.getByLabel("너비", { exact: true }).first();
  await width.fill("2147483648");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(width).toHaveAttribute("aria-invalid", "true");
  expect(await (await request.get(endpoint)).json()).toEqual(before);
  await width.fill("240");
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("저장됨");
  const created = await request.post(
    `${apiBase}/api/v1/projects/${projectId}/sheets`,
    { data: { name: "너비 검증", kind: "unit" } },
  );
  expect(created.status()).toBe(201);
  expect((await created.json()).view[0].width).toBe(240);
});
