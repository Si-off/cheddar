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
const screenDocumentCode = compile("./screen-document.ts");
function setup({
  fileKey = "file-key",
  nodes,
  failPng = false,
  webBaseUrl = "http://127.0.0.1:5176",
  pluginUiUrl = "",
  children = [],
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
    exportAsync: async (options) => {
      exported.push(options);
      const { format } = options;
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
  const lookup = new Map([[frame.id, frame]]);
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
  const screenDocument = { exports: {} };
  vm.runInNewContext(screenDocumentCode, {
    exports: screenDocument.exports,
    Set,
    Map,
    Object,
  });
  vm.runInNewContext(mainCode, {
    figma,
    __html__: "",
    __WEB_BASE_URL__: webBaseUrl,
    __PLUGIN_UI_ORIGIN__: pluginUiUrl ? new URL(pluginUiUrl).origin : "",
    console,
    exports: {},
    require: (path) =>
      path.endsWith("screen-document")
        ? screenDocument.exports
        : protocol.exports,
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
test("unsupported direct selections and stale selections cannot start", async () => {
  const mixed = setup({ nodes: [{ id: "a", type: "INSTANCE" }] });
  const selected = await mixed.send({ type: "ui-ready" });
  assert.equal(selected.selection.frames.length, 0);
  assert.equal(selected.selection.unsupportedCount, 1);
  assert.equal((await prepare(mixed)).code, "INVALID_SELECTION");
  const subject = setup();
  const ready = await subject.send({ type: "ui-ready" });
  subject.events.get("selectionchange")();
  assert.equal(
    (
      await subject.send({
        type: "prepare-upload",
        requestId: "bad",
        selectionVersion: ready.selection.version,
      })
    ).code,
    "INVALID_SELECTION",
  );
  const missing = setup({ fileKey: null });
  assert.equal((await prepare(missing)).code, "FILE_KEY_UNAVAILABLE");
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
    exportAsync: async ({ format }) =>
      format === "PNG"
        ? new Uint8Array([137, 80, 78, 71])
        : { document: { id, type: "FRAME" } },
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

test("empty Sections, invalid frame metadata, and unsupported direct nodes block registration", async () => {
  const empty = branch("SECTION", "empty", [
    branch("GROUP", "group", [{ id: "text", type: "TEXT" }]),
    branch("SECTION", "empty-inner"),
  ]);
  for (const nodes of [[empty], [screen("direct"), empty]]) {
    const subject = setup({ nodes });
    const selected = await subject.send({ type: "ui-ready" });
    assert.equal(selected.selection.emptySectionCount, 1);
    assert.equal(selected.selection.unsupportedCount, 0);
    assert.equal((await prepare(subject)).code, "INVALID_SELECTION");
  }
  const invalid = { ...screen("invalid"), width: 0 };
  const section = branch("SECTION", "section", [screen("valid"), invalid]);
  const subject = setup({
    nodes: [section, { id: "direct-text", type: "TEXT" }],
  });
  const selected = await subject.send({ type: "ui-ready" });
  assert.deepEqual(selectedIds(selected), ["valid"]);
  assert.equal(selected.selection.unsupportedCount, 2);
  assert.equal(selected.selection.emptySectionCount, 0);
  assert.equal((await prepare(subject)).code, "INVALID_SELECTION");
  assert.equal(
    subject.protocol.isMainToUiMessage({
      ...selected,
      selection: { ...selected.selection, emptySectionCount: 2 },
    }),
    false,
  );
});

test("a prepared Section snapshot survives selection changes but stops after document edits", async () => {
  const first = screen("first");
  const section = branch("SECTION", "section", [first]);
  const subject = setup({ nodes: [section] });
  const prepared = await prepare(subject);
  subject.page.selection = [screen("another")];
  subject.events.get("selectionchange")();
  assert.deepEqual(
    Array.from(prepared.frames, (frame) => frame.nodeId),
    ["first"],
  );
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
  section.children.push(screen("added"));
  for (const callback of subject.pageEvents) callback();
  assert.equal(
    (
      await subject.send({
        type: "export-frame",
        requestId: "changed",
        sessionId: "session",
        nodeId: first.id,
      })
    ).code,
    "FRAME_CHANGED",
  );
});
test("exports a screen document and PNG without uploading unselected frames", async () => {
  const subject = setup({
    children: [
      { id: "1:3", type: "TEXT", name: "결제", characters: "결제하기" },
    ],
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
  const data = JSON.parse(result.data);
  assert.equal(data.schemaVersion, 2);
  assert.equal(data.board.name, "주문");
  assert.deepEqual(data.texts, ["결제하기"]);
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
test("document changes and released sessions cannot publish a mixed snapshot", async () => {
  const subject = setup();
  await prepare(subject);
  for (const callback of subject.pageEvents) callback();
  assert.equal(
    (
      await subject.send({
        type: "export-frame",
        requestId: "changed",
        sessionId: "session",
        nodeId: "1:2",
      })
    ).code,
    "FRAME_CHANGED",
  );
  await subject.send({ type: "release-upload", sessionId: "session" });
  assert.equal(subject.pageEvents.size, 1);
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
test("oversized UTF-8 JSON and failed exports produce safe actionable codes", async () => {
  const oversized = setup({
    children: [1, 2].map((n) => ({
      id: `big${n}`,
      type: "FRAME",
      name: `묶음 ${n}`,
      children: Array.from({ length: 700 }, (_, i) => ({
        id: `t${n}-${i}`,
        type: "TEXT",
        name: "t",
        characters: `${n}-${i}-${"한".repeat(1990)}`,
      })),
    })),
  });
  await prepare(oversized);
  assert.equal(
    (
      await oversized.send({
        type: "export-frame",
        requestId: "large",
        sessionId: "session",
        nodeId: "1:2",
      })
    ).code,
    "DATA_TOO_LARGE",
  );
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
