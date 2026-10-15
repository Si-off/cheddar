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
function setup({
  fileKey = "file-key",
  nodes,
  failPng = false,
  json = { document: { type: "FRAME", children: [] } },
} = {}) {
  const messages = [];
  const events = new Map();
  const pageEvents = new Set();
  const frame = {
    id: "1:2",
    type: "FRAME",
    name: "주문",
    width: 390,
    height: 844,
    removed: false,
    exportAsync: async ({ format }) => {
      if (format === "PNG" && failPng) throw new Error("private detail");
      return format === "PNG" ? new Uint8Array([137, 80, 78, 71]) : json;
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
    ui: { postMessage: (message) => messages.push(message) },
    on: (event, callback) => events.set(event, callback),
    getNodeByIdAsync: async (id) => lookup.get(id) ?? null,
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
    exports: {},
    require: () => protocol.exports,
    Uint8Array,
    Error,
    Date,
  });
  return {
    messages,
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
  assert.equal(JSON.parse(exported.data).source.figmaNodeId, first.id);
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
test("exports immutable provenance and PNG without traversing or uploading unselected frames", async () => {
  const subject = setup();
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
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.source.figmaFileKey, "file-key");
  assert.equal(data.source.figmaNodeId, "1:2");
  assert.equal(data.document.document.type, "FRAME");
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
  const oversized = setup({ json: { text: "한".repeat(2 * 1024 * 1024) } });
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
