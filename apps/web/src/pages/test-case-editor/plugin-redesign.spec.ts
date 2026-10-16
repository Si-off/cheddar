import { expect, type Page, test } from "@playwright/test";

const projectId = "10000000-0000-4000-8000-000000000001";
const uploadId = "20000000-0000-4000-8000-000000000002";
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
async function harness(
  page: Page,
  { failThumbnail = false, many = false, deferPreview = false } = {},
) {
  await page.setViewportSize({ width: 400, height: 640 });
  await page.route("**/redesign-plugin-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe title="Figma plugin" src="http://127.0.0.1:5174/" style="border:0;width:400px;height:640px"></iframe><script>
    const frames=Array.from({length:${many ? 20 : 2}},(_,i)=>({nodeId:'1:'+i,name:i===0?'상품 상세':i===1?'주문·결제':'화면 '+i,width:390,height:844}));
    window.pluginRequests=[];window.version=1;
    addEventListener('message',event=>{const message=event.data.pluginMessage;if(!message)return;window.pluginRequests.push(message);const reply=pluginMessage=>event.source.postMessage({pluginMessage},'*'); const image=Uint8Array.from(atob('${png}'),x=>x.charCodeAt(0));
      if(message.type==='ui-ready')reply({type:'selection-changed',selection:{version:window.version,fileKey:'synthetic-file',frames,unsupportedCount:0,sectionCount:0,emptySectionCount:0}});
      if(message.type==='thumbnail-frame')${deferPreview ? "if(message.size==='preview'){window.delayedPreview=()=>reply({type:'frame-thumbnail',requestId:message.requestId,selectionVersion:message.selectionVersion,nodeId:message.nodeId,image});}else" : ""}reply(${failThumbnail ? "{type:'export-error',requestId:message.requestId,code:'EXPORT_FAILED'}" : "{type:'frame-thumbnail',requestId:message.requestId,selectionVersion:message.selectionVersion,nodeId:message.nodeId,image}"});
      if(message.type==='prepare-upload')reply({type:'upload-prepared',requestId:message.requestId,sessionId:'session-1',fileKey:'synthetic-file',frames});
      if(message.type==='export-frame')reply({type:'frame-exported',requestId:message.requestId,sessionId:'session-1',frame:frames.find(frame=>frame.nodeId===message.nodeId),image,data:'{}'});
      if(message.type==='validate-upload')reply({type:'upload-validated',requestId:message.requestId,sessionId:message.sessionId});
      if(message.type==='open-upload-web')reply({type:'upload-web-opened',requestId:message.requestId});
    });</script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/redesign-plugin-harness");
  return page.frameLocator("iframe");
}

test("플러그인은 보이는 프레임의 경량 이미지를 조회하고 미리보기를 재사용한다", async ({
  page,
}, testInfo) => {
  await page.route("**/api/v1/projects?**", (route) =>
    route.fulfill({
      json: { items: [{ id: projectId, name: "커머스 QA" }], nextCursor: null },
    }),
  );
  const plugin = await harness(page, { many: true });
  await expect(plugin.getByText("Cheddar", { exact: true })).toBeVisible();
  await expect(
    plugin.getByRole("heading", { name: "화면 선택", exact: true }),
  ).toBeVisible();
  await expect(plugin.getByRole("button", { name: /미리보기$/ })).toHaveCount(
    20,
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { pluginRequests: { type: string }[] }
          ).pluginRequests.filter(
            (message) => message.type === "thumbnail-frame",
          ).length,
      ),
    )
    .toBeGreaterThan(0);
  const firstRequests = await page.evaluate(
    () =>
      (window as unknown as { pluginRequests: { type: string }[] })
        .pluginRequests,
  );
  expect(
    firstRequests.filter((message) => message.type === "thumbnail-frame")
      .length,
  ).toBeLessThan(20);
  expect(
    firstRequests.some(
      (message) =>
        message.type === "prepare-upload" || message.type === "export-frame",
    ),
  ).toBe(false);
  for (let index = 0; index < 2; index += 1) {
    await plugin
      .getByRole("button", { name: "주문·결제 미리보기", exact: true })
      .click();
    await expect(
      plugin.getByRole("img", { name: "주문·결제", exact: true }),
    ).toBeVisible();
    await plugin.getByRole("button", { name: "닫기", exact: true }).click();
    await expect(plugin.getByRole("dialog")).toBeHidden();
  }
  const previewRequests = await page.evaluate(() =>
    (
      window as unknown as { pluginRequests: { type: string; size?: string }[] }
    ).pluginRequests.filter(
      (message) =>
        message.type === "thumbnail-frame" && message.size === "preview",
    ),
  );
  expect(previewRequests).toHaveLength(1);
  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-selection.png"),
  });
});

test("프로젝트 검색은 다음 페이지를 조회하고 키보드 선택을 지원한다", async ({
  page,
}, testInfo) => {
  const cursors: (string | null)[] = [];
  await page.route("**/api/v1/projects?**", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    cursors.push(cursor);
    await route.fulfill({
      json: cursor
        ? { items: [{ id: projectId, name: "커머스 QA" }], nextCursor: null }
        : {
            items: [
              {
                id: "30000000-0000-4000-8000-000000000003",
                name: "다른 프로젝트",
              },
            ],
            nextCursor: "next",
          },
    });
  });
  const plugin = await harness(page);
  await plugin.getByRole("button", { name: "계속", exact: true }).click();
  await expect(
    plugin.getByRole("heading", { name: "업로드 설정", exact: true }),
  ).toBeVisible();
  await plugin
    .getByRole("combobox", { name: "프로젝트", exact: true })
    .fill("커머스");
  await expect(
    plugin.getByRole("option", { name: "커머스 QA", exact: true }),
  ).toBeVisible();
  await plugin
    .getByRole("combobox", { name: "프로젝트", exact: true })
    .press("ArrowDown");
  await plugin
    .getByRole("combobox", { name: "프로젝트", exact: true })
    .press("Enter");
  await expect(plugin.getByLabel("업로드 이름", { exact: true })).toHaveValue(
    "상품 상세",
  );
  await expect(
    plugin.getByRole("button", { name: "업로드", exact: true }),
  ).toBeEnabled();
  expect(cursors).toContain("next");
  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-destination.png"),
  });
});

test("이미지 조회 실패 후 업로드를 계속하고 전송 재시도와 완료 웹 열기를 제공한다", async ({
  page,
}, testInfo) => {
  let fileCount = 0;
  let failOnce = true;
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET")
      return route.fulfill({
        json: {
          items: [{ id: projectId, name: "커머스 QA" }],
          nextCursor: null,
        },
      });
    if (path.endsWith("/files")) {
      fileCount += 1;
      if (fileCount === 2 && failOnce) {
        failOnce = false;
        return route.fulfill({
          status: 503,
          json: { error: { code: "SERVER_ERROR" } },
        });
      }
      return route.fulfill({
        json: {
          id: `40000000-0000-4000-8000-${String(fileCount).padStart(12, "0")}`,
        },
      });
    }
    return route.fulfill({
      json: { id: uploadId, projectId, name: "상품 상세" },
    });
  });
  const plugin = await harness(page, { failThumbnail: true });
  await expect(plugin.getByText("미리보기 없음")).toHaveCount(2);
  await plugin.getByRole("button", { name: "계속", exact: true }).click();
  await plugin
    .getByRole("combobox", { name: "프로젝트", exact: true })
    .fill("커머스");
  await plugin.getByRole("option", { name: "커머스 QA", exact: true }).click();
  await plugin.getByRole("button", { name: "업로드", exact: true }).click();
  await expect(plugin.getByRole("alert")).toContainText("파일 전송 결과");
  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-upload-failure.png"),
  });
  await plugin.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(plugin.getByRole("status")).toContainText(
    "업로드를 완료했습니다",
  );
  expect(fileCount).toBe(5);

  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-completion.png"),
  });
  await plugin
    .getByRole("button", { name: "웹에서 열기", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { pluginRequests: { type: string }[] }
        ).pluginRequests.some((message) => message.type === "open-upload-web"),
      ),
    )
    .toBe(true);
  const open = await page.evaluate(() =>
    (
      window as unknown as {
        pluginRequests: {
          type: string;
          projectId?: string;
          uploadId?: string;
        }[];
      }
    ).pluginRequests.find((message) => message.type === "open-upload-web"),
  );
  expect(open).toMatchObject({ projectId, uploadId });
});

test("선택 변경은 이전 이미지 응답을 버리고 동작 줄이기에서도 업로드를 계속한다", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/v1/projects?**", (route) =>
    route.fulfill({ json: { items: [], nextCursor: null } }),
  );
  const plugin = await harness(page, { deferPreview: true });
  await plugin
    .getByRole("button", { name: "상품 상세 미리보기", exact: true })
    .click();
  await expect(plugin.getByRole("dialog")).toBeVisible();
  await page.evaluate(() => {
    const host = window as unknown as { delayedPreview?: () => void };
    window.frames[0].postMessage(
      {
        pluginMessage: {
          type: "selection-changed",
          selection: {
            version: 2,
            fileKey: "synthetic-file",
            frames: [
              { nodeId: "2:1", name: "새 화면", width: 390, height: 844 },
            ],
            unsupportedCount: 0,
            sectionCount: 0,
            emptySectionCount: 0,
          },
        },
      },
      "*",
    );
    host.delayedPreview?.();
  });
  await expect(plugin.getByRole("dialog")).toBeHidden();
  await expect(
    plugin.getByRole("button", { name: "새 화면 미리보기", exact: true }),
  ).toBeVisible();
  await expect(
    plugin.getByRole("button", { name: "상품 상세 미리보기", exact: true }),
  ).toHaveCount(0);
  const next = plugin.getByRole("button", { name: "계속", exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(
    plugin.getByRole("heading", { name: "업로드 설정", exact: true }),
  ).toBeVisible();
});
