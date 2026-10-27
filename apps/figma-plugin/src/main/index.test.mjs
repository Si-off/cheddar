import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(path) {
  return ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    },
  ).outputText;
}
const protocolCode = compile("../protocol/messages.ts");
const mainCode = compile("./index.ts");
// 살아 있는 노드의 findAll. 자기 자신은 빼고 하위 노드만 찾는다
function findAll(predicate) {
  const found = [];
  const walk = (node) => {
    for (const child of node.children ?? []) {
      if (predicate(child)) found.push(child);
      walk(child);
    }
  };
  walk(this);
  return found;
}
function setup({
  fileKey = "file-key",
  nodes,
  failPng = false,
  webBaseUrl = "http://127.0.0.1:5176",
  pluginUiUrl = "",
  children = [],
  rest,
  others = [],
} = {}) {
  const deliveries = [];
  const messages = [];
  const exported = [];
  const opened = [];
  const events = new Map();
  const storage = new Map();
  const pageEvents = new Set();
  const frame = {
    id: "1:2",
    type: "FRAME",
    name: "주문",
    width: 390,
    height: 844,
    removed: false,
    children,
    findAll,
    exportAsync: async (options) => {
      exported.push(options);
      const { format } = options;
      if (format === "JSON_REST_V1")
        return {
          document: rest ?? { id: "1:2", type: "FRAME", name: "주문" },
          components: {},
        };
      if (format === "PNG" && failPng) throw new Error("private detail");
      return new Uint8Array([137, 80, 78, 71]);
    },
  };
  const page = {
    id: "page",
    parent: null,
    selection: nodes ?? [frame],
    removed: false,
    on: (_type, callback) => pageEvents.add(callback),
    off: (_type, callback) => pageEvents.delete(callback),
  };
  const lookup = new Map([[frame.id, frame], ...others.map((n) => [n.id, n])]);
  const register = (node, parent) => {
    node.parent = parent;
    lookup.set(node.id, node);
    for (const child of node.children ?? []) register(child, node);
  };
  for (const node of page.selection) register(node, node.parent ?? page);
  const figma = {
    fileKey,
    currentPage: page,
    showUI() {},
    openExternal: (url) => opened.push(url),
    ui: {
      postMessage: (message, options) => {
        messages.push(message);
        deliveries.push(options);
      },
    },
    on: (event, callback) => events.set(event, callback),
    getNodeByIdAsync: async (id) => lookup.get(id) ?? null,
    clientStorage: {
      getAsync: async (key) => storage.get(key),
      setAsync: async (key, value) => {
        storage.set(key, value);
      },
      deleteAsync: async (key) => {
        storage.delete(key);
      },
    },
  };
  const protocol = { exports: {} };
  vm.runInNewContext(protocolCode, {
    exports: protocol.exports,
    Uint8Array,
    Set,
  });
  vm.runInNewContext(mainCode, {
    figma,
    __html__: "",
    __WEB_BASE_URL__: webBaseUrl,
    __PLUGIN_UI_ORIGIN__: pluginUiUrl ? new URL(pluginUiUrl).origin : "",
    console,
    exports: {},
    require: () => protocol.exports,
    Map,
    Uint8Array,
    Error,
    Date,
    encodeURIComponent,
  });
  return {
    messages,
    deliveries,
    exported,
    opened,
    frame,
    page,
    events,
    pageEvents,
    protocol: protocol.exports,
    send: async (message) => {
      figma.ui.onmessage(message);
      await new Promise((resolve) => setImmediate(resolve));
      return messages.at(-1);
    },
  };
}
async function prepare(subject) {
  const ready = await subject.send({ type: "ui-ready" });
  return subject.send({
    type: "prepare-upload",
    requestId: "session",
    selectionVersion: ready.selection.version,
  });
}
test("only a selection without any frame stops the upload; a stale version or missing file key does not", async () => {
  const mixed = setup({ nodes: [{ id: "a", type: "INSTANCE" }] });
  const selected = await mixed.send({ type: "ui-ready" });
  assert.equal(selected.selection.frames.length, 0);
  assert.equal(selected.selection.unsupportedCount, 1);
  assert.equal((await prepare(mixed)).code, "INVALID_SELECTION");
  // 누른 사이 선택이 바뀌어도 누른 순간의 선택으로 시작한다
  const subject = setup();
  const ready = await subject.send({ type: "ui-ready" });
  subject.events.get("selectionchange")();
  const stale = await subject.send({
    type: "prepare-upload",
    requestId: "stale",
    selectionVersion: ready.selection.version,
  });
  assert.equal(stale.type, "upload-prepared");
  assert.equal(stale.frames.length, 1);
  // 파일 키는 업로드에 쓰지 않으므로 없어도 시작한다
  const missing = await prepare(setup({ fileKey: null }));
  assert.equal(missing.type, "upload-prepared");
  assert.equal(missing.fileKey, null);
});

function branch(type, id, children = []) {
  const node = { type, id, children };
  for (const child of children) child.parent = node;
  return node;
}
function screen(id, children = []) {
  const node = {
    ...branch("FRAME", id, children),
    name: `화면 ${id}`,
    width: 390,
    height: 844,
    removed: false,
    findAll,
    exportAsync: async ({ format }) =>
      format === "PNG"
        ? new Uint8Array([137, 80, 78, 71])
        : { document: { id, type: "FRAME", name: `화면 ${id}` } },
  };
  for (const child of children) child.parent = node;
  return node;
}
const selectedIds = (message) =>
  Array.from(message.selection.frames, (frame) => frame.nodeId);

test("Sections collect top-level Frames through nested Sections and Groups in layer order", async () => {
  const nestedLayout = screen("layout");
  const first = screen("first", [nestedLayout]);
  const second = screen("second");
  const third = screen("third");
  const section = branch("SECTION", "section", [
    { id: "text", type: "TEXT" },
    first,
    branch("GROUP", "group", [
      { id: "vector", type: "VECTOR" },
      branch("SECTION", "nested-section", [second]),
      third,
    ]),
  ]);
  const outside = screen("outside");
  branch("PAGE", "page-tree", [section, outside]);
  const subject = setup({ nodes: [section] });
  const selected = await subject.send({ type: "ui-ready" });
  assert.deepEqual(selectedIds(selected), ["first", "second", "third"]);
  assert.equal(selected.selection.sectionCount, 1);
  assert.equal(selected.selection.emptySectionCount, 0);
  assert.equal(selected.selection.unsupportedCount, 0);
  const prepared = await prepare(subject);
  assert.deepEqual(
    Array.from(prepared.frames, (frame) => frame.nodeId),
    ["first", "second", "third"],
  );
  assert.equal(
    (
      await subject.send({
        type: "export-frame",
        requestId: "outside",
        sessionId: "session",
        nodeId: outside.id,
      })
    ).code,
    "INVALID_SELECTION",
  );
  const exported = await subject.send({
    type: "export-frame",
    requestId: "first",
    sessionId: "session",
    nodeId: first.id,
  });
  assert.equal(exported.type, "frame-exported");
  assert.equal(exported.frame.nodeId, first.id);
});

test("mixed Section and descendant selections deduplicate frames regardless of ancestor order", async () => {
  const layout = screen("layout");
  const first = screen("first", [layout]);
  const second = screen("second");
  const inner = branch("SECTION", "inner", [second]);
  const section = branch("SECTION", "section", [first, inner]);
  for (const nodes of [
    [section, inner, first, layout],
    [layout, first, inner, section],
    [first, layout],
  ]) {
    const subject = setup({ nodes });
    const selected = await subject.send({ type: "ui-ready" });
    assert.deepEqual(
      selectedIds(selected),
      nodes.length === 2 ? ["first"] : ["first", "second"],
    );
    assert.equal(selected.selection.unsupportedCount, 0);
  }
});

test("empty Sections, invalid frames, and other layers are left out instead of blocking", async () => {
  const empty = branch("SECTION", "empty", [
    branch("GROUP", "group", [{ id: "text", type: "TEXT" }]),
    branch("SECTION", "empty-inner"),
  ]);
  const onlyEmpty = setup({ nodes: [empty] });
  assert.equal((await prepare(onlyEmpty)).code, "INVALID_SELECTION");
  const withFrame = setup({ nodes: [screen("direct"), empty] });
  const selected = await withFrame.send({ type: "ui-ready" });
  assert.equal(selected.selection.emptySectionCount, 1);
  assert.deepEqual(
    Array.from((await prepare(withFrame)).frames, (f) => f.nodeId),
    ["direct"],
  );
  const invalid = { ...screen("invalid"), width: 0 };
  const section = branch("SECTION", "section", [screen("valid"), invalid]);
  const subject = setup({
    nodes: [section, { id: "direct-text", type: "TEXT" }],
  });
  const mixed = await subject.send({ type: "ui-ready" });
  assert.deepEqual(selectedIds(mixed), ["valid"]);
  assert.equal(mixed.selection.unsupportedCount, 2);
  assert.deepEqual(
    Array.from((await prepare(subject)).frames, (f) => f.nodeId),
    ["valid"],
  );
  assert.equal(
    subject.protocol.isMainToUiMessage({
      ...mixed,
      selection: { ...mixed.selection, emptySectionCount: 2 },
    }),
    false,
  );
});

test("a prepared upload survives selection changes and edits elsewhere in the document", async () => {
  const first = screen("first");
  const section = branch("SECTION", "section", [first]);
  const subject = setup({ nodes: [section] });
  const prepared = await prepare(subject);
  subject.page.selection = [screen("another")];
  subject.events.get("selectionchange")();
  section.children.push(screen("added"));
  for (const callback of subject.pageEvents) callback();
  subject.events.get("stylechange")();
  assert.deepEqual(
    Array.from(prepared.frames, (frame) => frame.nodeId),
    ["first"],
  );
  const exported = await subject.send({
    type: "export-frame",
    requestId: "after-edits",
    sessionId: "session",
    nodeId: first.id,
  });
  assert.equal(exported.type, "frame-exported");
  assert.equal(
    (
      await subject.send({
        type: "validate-upload",
        requestId: "valid",
        sessionId: "session",
      })
    ).type,
    "upload-validated",
  );
});
test("exports the REST source, annotations and outside link names without filtering", async () => {
  const hidden = { id: "1:4", type: "TEXT", visible: false, annotations: [] };
  const buy = {
    id: "1:3",
    type: "TEXT",
    annotations: [
      { label: "명세 참고", labelMarkdown: "[명세](https://x.test)" },
    ],
  };
  const rest = {
    id: "1:2",
    type: "FRAME",
    name: "주문",
    interactions: [
      { trigger: null, actions: [{ type: "NODE", destinationId: "9:1" }] },
    ],
    children: [
      {
        id: "1:3",
        type: "TEXT",
        name: "결제",
        characters: "결제하기",
        interactions: [
          {
            trigger: { type: "ON_CLICK" },
            actions: [
              { type: "NODE", destinationId: "1:4" },
              { type: "NODE", destinationId: "9:404" },
              { type: "BACK" },
            ],
          },
        ],
      },
      {
        id: "1:4",
        type: "TEXT",
        name: "숨김",
        visible: false,
        characters: "x",
      },
    ],
  };
  const subject = setup({
    children: [buy, hidden],
    rest,
    others: [{ id: "9:1", type: "FRAME", name: "주문서" }],
  });
  const prepared = await prepare(subject);
  assert.equal(prepared.frames.length, 1);
  const result = await subject.send({
    type: "export-frame",
    requestId: "export",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(result.type, "frame-exported");
  assert.ok(subject.protocol.isMainToUiMessage(result));
  // 숨김 노드도 거르지 않고 원본 그대로 넘긴다
  assert.deepEqual(JSON.parse(result.source.document), rest);
  assert.deepEqual(JSON.parse(JSON.stringify(result.source.externalNames)), {
    "9:1": "주문서",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(result.source.annotations)), {
    "1:3": buy.annotations,
  });
  assert.equal(
    (
      await subject.send({
        type: "export-frame",
        requestId: "other",
        sessionId: "session",
        nodeId: "3:4",
      })
    ).code,
    "INVALID_SELECTION",
  );
  subject.page.selection = [];
  subject.events.get("selectionchange")();
  assert.equal(
    (
      await subject.send({
        type: "validate-upload",
        requestId: "valid",
        sessionId: "session",
      })
    ).type,
    "upload-validated",
  );
});
test("a removed frame is reported on its own and a released session expires", async () => {
  const subject = setup();
  await prepare(subject);
  // 업로드는 페이지를 지켜보지 않는다
  assert.equal(subject.pageEvents.size, 1);
  for (const callback of subject.pageEvents) callback();
  const renamed = { ...subject.frame };
  subject.frame.name = "주문 수정";
  const exported = await subject.send({
    type: "export-frame",
    requestId: "renamed",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(exported.type, "frame-exported");
  // 이름이 바뀌었으면 지금 이름으로 올린다
  assert.equal(exported.frame.name, "주문 수정");
  assert.notEqual(renamed.name, exported.frame.name);
  // 메시지 계약을 넘는 이름은 잘라서 보낸다
  subject.frame.name = "가".repeat(300);
  const long = await subject.send({
    type: "export-frame",
    requestId: "long-name",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(long.frame.name.length, 255);
  assert.equal(subject.protocol.isMainToUiMessage(long), true);
  subject.frame.removed = true;
  assert.equal(
    (
      await subject.send({
        type: "export-frame",
        requestId: "removed",
        sessionId: "session",
        nodeId: "1:2",
      })
    ).code,
    "FRAME_REMOVED",
  );
  await subject.send({ type: "release-upload", sessionId: "session" });
  assert.equal(
    (
      await subject.send({
        type: "validate-upload",
        requestId: "released",
        sessionId: "session",
      })
    ).code,
    "SESSION_EXPIRED",
  );
});
test("큰 REST 원본도 끝까지 보존하고 내보내기 실패의 내부 정보는 노출하지 않는다", async () => {
  const oversized = setup({
    rest: {
      id: "1:2",
      type: "FRAME",
      name: "주문",
      absoluteBoundingBox: { x: 0, y: 0, width: 390, height: 844 },
      children: [
        {
          id: "1:3",
          type: "TEXT",
          name: "t",
          characters: `${"a".repeat(64 * 1024 * 1024)}마지막 규칙`,
        },
      ],
    },
  });
  await prepare(oversized);
  const large = await oversized.send({
    type: "export-frame",
    requestId: "large",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(large.type, "frame-exported");
  assert.ok(oversized.protocol.isMainToUiMessage(large));
  const document = JSON.parse(large.source.document);
  assert.equal(
    document.children[0].characters.length,
    64 * 1024 * 1024 + "마지막 규칙".length,
  );
  assert.ok(document.children[0].characters.endsWith("마지막 규칙"));
  const failed = setup({ failPng: true });
  await prepare(failed);
  const result = await failed.send({
    type: "export-frame",
    requestId: "failed",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(result.code, "EXPORT_FAILED");
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(
    failed.protocol.isUiToMainMessage({
      type: "export-frame",
      requestId: "x",
      sessionId: "session",
    }),
    false,
  );
});

test("a too-large image is drawn again at a smaller scale", async () => {
  const subject = setup();
  subject.frame.exportAsync = async (options) => {
    if (options.format === "JSON_REST_V1")
      return { document: { id: "1:2", type: "FRAME", name: "주문" } };
    subject.exported.push(options);
    return options.constraint.value === 1
      ? new Uint8Array(20 * 1024 * 1024 + 1)
      : new Uint8Array([137, 80, 78, 71]);
  };
  await prepare(subject);
  const result = await subject.send({
    type: "export-frame",
    requestId: "big-image",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(result.type, "frame-exported");
  assert.deepEqual(
    subject.exported.map((o) => o.constraint.value),
    [1, 0.5],
  );
});

test("a frame that changes while it is drawn is read again and sent as it is now", async () => {
  const subject = setup();
  const rest = (characters) => ({
    id: "1:2",
    type: "FRAME",
    name: "주문",
    children: [{ id: "1:3", type: "TEXT", name: "결제", characters }],
  });
  let current = rest("결제");
  let draws = 0;
  subject.frame.exportAsync = async ({ format }) => {
    if (format === "JSON_REST_V1") return { document: current };
    draws += 1;
    // 첫 번째 그리는 사이 글자가 바뀐다
    if (draws === 1) current = rest("결제하기");
    return new Uint8Array([137, 80, 78, 71]);
  };
  await prepare(subject);
  const result = await subject.send({
    type: "export-frame",
    requestId: "changing",
    sessionId: "session",
    nodeId: "1:2",
  });
  assert.equal(result.type, "frame-exported");
  assert.deepEqual(JSON.parse(result.source.document), rest("결제하기"));
  assert.equal(draws, 2);
});

test("thumbnails are bounded PNG exports independent of upload sessions and reject stale selection", async () => {
  const subject = setup();
  const ready = await subject.send({ type: "ui-ready" });
  const image = await subject.send({
    type: "thumbnail-frame",
    requestId: "thumb",
    selectionVersion: ready.selection.version,
    nodeId: "1:2",
    size: "thumbnail",
  });
  assert.equal(image.type, "frame-thumbnail");
  assert.equal(subject.exported.length, 1);
  assert.equal(subject.exported[0].format, "PNG");
  assert.equal(subject.exported[0].constraint.value, 240 / 844);
  await prepare(subject);
  await subject.send({
    type: "thumbnail-frame",
    requestId: "preview",
    selectionVersion: subject.messages.findLast(
      (message) => message.type === "selection-changed",
    ).selection.version,
    nodeId: "1:2",
    size: "preview",
  });
  assert.equal(
    (
      await subject.send({
        type: "validate-upload",
        requestId: "valid-after-preview",
        sessionId: "session",
      })
    ).type,
    "upload-validated",
  );
  subject.events.get("selectionchange")();
  assert.equal(
    (
      await subject.send({
        type: "thumbnail-frame",
        requestId: "stale",
        selectionVersion: ready.selection.version,
        nodeId: "1:2",
        size: "thumbnail",
      })
    ).code,
    "INVALID_SELECTION",
  );
});
test("thumbnail failure leaves upload preparation available", async () => {
  const subject = setup({ failPng: true });
  const ready = await subject.send({ type: "ui-ready" });
  assert.equal(
    (
      await subject.send({
        type: "thumbnail-frame",
        requestId: "thumb-fail",
        selectionVersion: ready.selection.version,
        nodeId: "1:2",
        size: "thumbnail",
      })
    ).code,
    "EXPORT_FAILED",
  );
  assert.equal((await prepare(subject)).type, "upload-prepared");
});
test("web open accepts resource IDs only and uses the configured web base", async () => {
  const subject = setup();
  const message = {
    type: "open-upload-web",
    requestId: "open",
    uploadId: "20000000-0000-4000-8000-000000000002",
    projectId: "30000000-0000-4000-8000-000000000003",
  };
  assert.equal((await subject.send(message)).type, "upload-web-opened");
  assert.deepEqual(subject.opened, [
    "http://127.0.0.1:5176/test-sets/new?upload=20000000-0000-4000-8000-000000000002&project=30000000-0000-4000-8000-000000000003",
  ]);
  for (const bad of [
    { uploadId: "https://evil.test" },
    { projectId: "../x" },
    { projectId: undefined },
  ])
    assert.equal(
      subject.protocol.isUiToMainMessage({ ...message, ...bad }),
      false,
    );
  assert.equal(
    (await subject.send({ type: "open-home-web", requestId: "home" })).type,
    "home-web-opened",
  );
  assert.equal(subject.opened.at(-1), "http://127.0.0.1:5176/test-sets");
  const token = "a".repeat(43);
  assert.equal(
    (
      await subject.send({
        type: "open-connect-web",
        requestId: "connect",
        requestToken: token,
      })
    ).type,
    "connect-web-opened",
  );
  assert.equal(
    subject.opened.at(-1),
    `http://127.0.0.1:5176/plugin-connect?request=${token}`,
  );
  assert.equal(
    subject.protocol.isUiToMainMessage({
      type: "open-connect-web",
      requestId: "bad",
      requestToken: "../x",
    }),
    false,
  );
  const missing = setup({ webBaseUrl: "" });
  assert.equal((await missing.send(message)).code, "WEB_UNAVAILABLE");
  assert.equal(missing.opened.length, 0);
});
test("the account token is kept in client storage and can be cleared", async () => {
  const subject = setup();
  const token = "b".repeat(43);
  assert.equal(
    (await subject.send({ type: "load-auth", requestId: "l1" })).token,
    null,
  );
  await subject.send({ type: "save-auth", requestId: "s1", token });
  assert.equal(
    (await subject.send({ type: "load-auth", requestId: "l2" })).token,
    token,
  );
  await subject.send({ type: "save-auth", requestId: "s2", token: null });
  assert.equal(
    (await subject.send({ type: "load-auth", requestId: "l3" })).token,
    null,
  );
});
test("the last project is remembered and only project IDs are accepted", async () => {
  const subject = setup();
  const projectId = "30000000-0000-4000-8000-000000000003";
  const load = async (requestId) =>
    (await subject.send({ type: "load-project", requestId })).projectId;
  assert.equal(await load("p1"), null);
  await subject.send({ type: "save-project", requestId: "p2", projectId });
  assert.equal(await load("p3"), projectId);
  assert.equal(
    subject.protocol.isUiToMainMessage({
      type: "save-project",
      requestId: "bad",
      projectId: "../x",
    }),
    false,
  );
  await subject.send({
    type: "save-project",
    requestId: "p4",
    projectId: null,
  });
  assert.equal(await load("p5"), null);
});

test("main announces its protocol version before the first selection", async () => {
  const subject = setup();
  await subject.send({ type: "ui-ready" });
  const [ready, selection] = subject.messages;
  assert.equal(ready.type, "main-ready");
  assert.equal(ready.protocolVersion, subject.protocol.PROTOCOL_VERSION);
  assert.equal(selection.type, "selection-changed");
  assert.ok(subject.protocol.isMainToUiMessage(ready));
});

test("a remote UI receives main messages only at its own origin", async () => {
  const bundled = setup();
  await bundled.send({ type: "ui-ready" });
  assert.equal(bundled.deliveries.at(-1), undefined);

  const remote = setup({ pluginUiUrl: "http://localhost:5174" });
  await remote.send({ type: "ui-ready" });
  for (const options of remote.deliveries)
    assert.deepEqual(JSON.parse(JSON.stringify(options)), {
      origin: "http://localhost:5174",
    });
});
