import { expect, test } from "@playwright/test";

const projectId = "00000000-0000-4000-8000-000000000001";
const uploadId = "00000000-0000-4000-8000-000000000002";
const frame = {
  id: "00000000-0000-4000-8000-000000000003",
  name: "주문 화면",
  figmaFileKey: "figma-file",
  figmaNodeId: "1:1",
  width: 390,
  height: 844,
  imageFileId: "image-one",
  dataFileId: "data-one",
};
const upload = {
  id: uploadId,
  projectId,
  name: "주문 자료",
  createdAt: "2026-10-16T00:00:00Z",
  frames: [frame],
};

test("자료 이미지는 같은 화면에서 확대하고 접는다", async ({
  page,
  context,
}, testInfo) => {
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/files/image-one/content")) {
      await route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5xQAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    } else if (path.endsWith(`/uploads/${uploadId}`)) {
      await route.fulfill({ json: upload });
    } else if (path.endsWith(`/projects/${projectId}`)) {
      await route.fulfill({
        json: { id: projectId, name: "자료 검증", revision: 1 },
      });
    } else await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto(`/projects/${projectId}/uploads/${uploadId}`);
  const image = page.getByRole("button", {
    name: "주문 화면 이미지 확대",
    exact: true,
  });
  await expect(image).toBeVisible();
  await image.click();
  await expect(
    page.getByRole("button", { name: "주문 화면 이미지 축소", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "원본 크기", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "너비 맞춤", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(context.pages()).toHaveLength(1);
  await page.getByRole("button", { name: "이미지 접기", exact: true }).click();
  await expect(image).toHaveAttribute("aria-expanded", "false");
  await page.setViewportSize({ width: 390, height: 844 });
  await image.click();
  await expect(
    page.getByRole("button", { name: "이미지 접기", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("upload-image-mobile.png"),
    fullPage: true,
  });
});

test("자료 목록 오류는 빈 목록과 구분하고 다시 불러온다", async ({ page }) => {
  let failed = true;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/uploads") && failed) {
      await route.fulfill({
        status: 503,
        json: { error: { code: "DEPENDENCY_UNAVAILABLE" } },
      });
    } else if (path.endsWith(`/projects/${projectId}`)) {
      await route.fulfill({
        json: { id: projectId, name: "자료 검증", revision: 1 },
      });
    } else await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto(`/projects/${projectId}/uploads`);
  await expect(page.getByRole("alert")).toContainText(
    "Figma 자료를 불러오지 못했습니다",
    { timeout: 15000 },
  );
  await expect(
    page.getByText("Figma 자료가 없습니다.", { exact: false }),
  ).toHaveCount(0);
  failed = false;
  await page
    .getByRole("button", { name: "다시 불러오기", exact: true })
    .click();
  await expect(
    page.getByText("Figma 자료가 없습니다.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});
