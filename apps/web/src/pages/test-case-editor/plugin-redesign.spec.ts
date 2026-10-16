import { expect, test } from "@playwright/test";

test("플러그인은 실제 UI에서 화면 확인 후 프로젝트를 선택하고 미리보기를 연다", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 400, height: 700 });
  const requests: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    requests.push(
      `${route.request().method()} ${new URL(route.request().url()).pathname}`,
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          { id: "10000000-0000-4000-8000-000000000001", name: "커머스 QA" },
        ],
        nextCursor: null,
      }),
    });
  });
  await page.route("**/redesign-plugin-harness", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><iframe title="Figma plugin" src="http://127.0.0.1:5174/" style="border:0;width:400px;height:700px"></iframe><script>
    const frames=[{nodeId:'1:1',name:'상품 상세',width:390,height:844},{nodeId:'1:2',name:'주문·결제',width:390,height:844}];
    addEventListener('message',event=>{const message=event.data.pluginMessage;if(!message)return;const reply=pluginMessage=>event.source.postMessage({pluginMessage},'*');
      if(message.type==='ui-ready')reply({type:'selection-changed',selection:{version:1,fileKey:'synthetic-file',frames,unsupportedCount:0,sectionCount:0,emptySectionCount:0}});
      if(message.type==='prepare-upload')reply({type:'upload-prepared',requestId:message.requestId,sessionId:'session-1',fileKey:'synthetic-file',frames});
      if(message.type==='export-frame'){const image=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),x=>x.charCodeAt(0));reply({type:'frame-exported',requestId:message.requestId,sessionId:'session-1',frame:frames.find(frame=>frame.nodeId===message.nodeId),image,data:'{}'});}
    });</script></body></html>`,
    }),
  );
  await page.goto("http://127.0.0.1:5174/redesign-plugin-harness");
  const plugin = page.frameLocator("iframe");
  await expect(
    plugin.getByRole("heading", { name: "화면 선택", exact: true }),
  ).toBeVisible();
  await expect(plugin.getByRole("button", { name: /미리보기$/ })).toHaveCount(
    2,
  );
  await expect(plugin.getByLabel("프로젝트", { exact: true })).toBeHidden();
  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-selection.png"),
  });
  await plugin
    .getByRole("button", { name: "주문·결제 미리보기", exact: true })
    .click();
  await expect(
    plugin.getByRole("img", { name: "주문·결제", exact: true }),
  ).toBeVisible();
  await plugin.getByRole("button", { name: "닫기", exact: true }).click();
  await plugin.getByRole("button", { name: "계속", exact: true }).click();
  await expect(
    plugin.getByRole("heading", { name: "업로드할 프로젝트", exact: true }),
  ).toBeVisible();
  await plugin.getByLabel("프로젝트", { exact: true }).click();
  await plugin.getByRole("option", { name: "커머스 QA", exact: true }).click();
  await expect(plugin.getByLabel("업로드 이름", { exact: true })).toHaveValue(
    "상품 상세",
  );
  await expect(
    plugin.getByRole("button", { name: "업로드", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath("redesign-plugin-destination.png"),
  });
  expect(requests.every((request) => request.startsWith("GET "))).toBe(true);
});
