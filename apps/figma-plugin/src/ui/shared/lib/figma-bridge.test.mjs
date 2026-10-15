import assert from "node:assert/strict";
import { randomFillSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

function loadBridge() {
  const protocol = {};
  const compile = (path, context) =>
    vm.runInNewContext(
      ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
      context,
    );
  compile("../../../protocol/messages.ts", { exports: protocol, Uint8Array });
  let listener;
  const parent = { postMessage() {} };
  const window = {
    parent,
    addEventListener(_type, callback) {
      listener = callback;
    },
    removeEventListener() {
      listener = undefined;
    },
  };
  const manifest = JSON.parse(
    readFileSync(new URL("../../../../manifest.json", import.meta.url), "utf8"),
  );
  const exports = {};
  compile("./figma-bridge.ts", {
    exports,
    window,
    setTimeout,
    clearTimeout,
    crypto: { getRandomValues: randomFillSync },
    require(name) {
      if (name === "zustand")
        return {
          create(initial) {
            let state = initial();
            return {
              getState: () => state,
              setState: (value) => {
                state = { ...state, ...value };
              },
            };
          },
        };
      if (name.endsWith("manifest.json")) return { default: manifest };
      return protocol;
    },
  });
  const disconnect = exports.connectToFigma();
  const deliver = (source, origin, pluginId = manifest.id) =>
    listener({
      source,
      origin,
      data: {
        pluginId,
        pluginMessage: {
          type: "selection-changed",
          selection: {
            version: 1,
            fileKey: "file",
            frames: [],
            unsupportedCount: 0,
          },
        },
      },
    });
  return { exports, parent, deliver, disconnect };
}

test("Figma editor relay connects across nested sandbox frames", () => {
  const { exports, deliver, disconnect } = loadBridge();
  deliver({}, "https://www.figma.com");
  assert.equal(exports.useFigmaConnection.getState().connected, true);
  disconnect();
  assert.equal(exports.useFigmaConnection.getState().connected, false);
});

test("unrelated windows and a different plugin cannot establish a connection", () => {
  const { exports, deliver, parent, disconnect } = loadBridge();
  deliver({}, "https://example.com");
  deliver({}, "https://www.figma.com", "another-plugin");
  deliver({}, "https://figma.com.example.com");
  assert.equal(exports.useFigmaConnection.getState().connected, false);
  deliver(parent, "http://localhost:8766");
  assert.equal(exports.useFigmaConnection.getState().connected, true);
  disconnect();
});

test("opaque-origin UI creates distinct UUID request keys without randomUUID", () => {
  const { exports, disconnect } = loadBridge();
  const ids = Array.from({ length: 100 }, () => exports.createRequestId());
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids)
    assert.match(
      id,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  disconnect();
});
