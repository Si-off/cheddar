import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    readFileSync(new URL("./upload-session.ts", import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  { exports, File, Uint8Array, Error },
);
const { FrameUploadSession } = exports;
const frames = [1, 2].map((value) => ({
  nodeId: `1:${value}`,
  name: `화면 ${value}`,
  width: 390,
  height: 844,
}));
const extracted = { image: new Uint8Array([137]), data: "{}" };

test("a retry reuses acknowledged files and registers only after every frame succeeds", async () => {
  const run = new FrameUploadSession(
    "project",
    "묶음",
    "session",
    "figma",
    frames,
    "request",
  );
  const files = [];
  const bundles = [];
  let failed = false;
  const gateway = {
    file: async (_id, file) => {
      files.push(file.name);
      if (file.name === "화면 1.json" && !failed) {
        failed = true;
        throw new Error("network");
      }
      return { id: file.name };
    },
    bundle: async (_id, input) => {
      bundles.push(input);
      return { id: "upload" };
    },
  };
  const exporter = { export: async () => extracted, validate: async () => {} };
  await assert.rejects(
    run.run(gateway, exporter, new AbortController().signal, () => {}),
  );
  assert.equal(bundles.length, 0);
  await run.run(gateway, exporter, new AbortController().signal, () => {});
  assert.equal(files.filter((name) => name === "화면 1.png").length, 1);
  assert.equal(files.filter((name) => name === "화면 1.json").length, 2);
  assert.equal(bundles[0].frames.length, 2);
  assert.equal(bundles[0].frames[0].figmaNodeId, "1:1");
});
test("a lost registration response replays the exact body even after document change", async () => {
  const run = new FrameUploadSession(
    "project",
    "묶음",
    "session",
    "figma",
    frames,
    "request",
  );
  const bodies = [];
  let modified = false;
  let files = 0;
  const gateway = {
    file: async () => ({ id: `${++files}` }),
    bundle: async (_id, input) => {
      bodies.push(JSON.stringify(input));
      if (bodies.length === 1) throw new Error("lost response");
      return { id: "existing-upload" };
    },
  };
  const exporter = {
    export: async () => extracted,
    validate: async () => {
      if (modified) throw new Error("document changed");
    },
  };
  await assert.rejects(
    run.run(gateway, exporter, new AbortController().signal, () => {}),
  );
  modified = true;
  const result = await run.run(
    gateway,
    exporter,
    new AbortController().signal,
    () => {},
  );
  assert.equal(result.id, "existing-upload");
  assert.equal(bodies[0], bodies[1]);
  assert.equal(files, 4);
});
