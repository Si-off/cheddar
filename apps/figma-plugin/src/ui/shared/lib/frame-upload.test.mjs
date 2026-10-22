import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("./frame-upload.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const module = { exports: {} };
new Function("module", "exports", code)(module, module.exports);
const { FrameUpload } = module.exports;

const frames = ["a", "b", "c"].map((id) => ({
  nodeId: id,
  name: `화면 ${id}`,
  width: 390,
  height: 844,
}));
const doc = (id) => JSON.stringify({ board: { name: id } });

test("일시적인 실패는 한 번 더 읽고, 그래도 실패한 프레임만 다시 시도에서 읽는다", async () => {
  const upload = new FrameUpload("s", frames);
  const calls = [];
  let failB = true;
  const exportFrame = async (id) => {
    calls.push(id);
    if (id === "b" && failB) throw new Error("EXPORT_FAILED");
    return { image: new Uint8Array([1]), data: doc(id) };
  };
  // c는 타일 두 장
  const slice = async () => (calls.at(-1) === "c" ? ["c1", "c2"] : ["one"]);
  const signal = new AbortController().signal;
  assert.equal(await upload.extract(exportFrame, slice, () => {}, signal), 1);
  assert.equal(upload.states.get("b"), "failed");
  // 읽은 프레임만으로도 보낼 수 있다
  assert.deepEqual(
    JSON.parse(upload.payload().manifest).frames.map((f) => f.name),
    ["화면 a", "화면 c"],
  );

  failB = false;
  assert.equal(await upload.extract(exportFrame, slice, () => {}, signal), 0);
  assert.deepEqual(calls, ["a", "b", "b", "c", "b"]);
  const { manifest, images } = upload.payload();
  assert.deepEqual(
    JSON.parse(manifest).frames.map((f) => [f.name, f.imageCount]),
    [
      ["화면 a", 1],
      ["화면 b", 1],
      ["화면 c", 2],
    ],
  );
  assert.deepEqual(images, ["one", "one", "c1", "c2"]);
});

test("지워진 프레임은 건너뛰고 나머지를 읽으며, 연결이 끊기면 멈춘다", async () => {
  const upload = new FrameUpload("s", frames);
  const calls = [];
  const exportFrame = async (id) => {
    calls.push(id);
    if (id === "b") throw new Error("FRAME_REMOVED");
    return { image: new Uint8Array([1]), data: doc(id) };
  };
  const signal = new AbortController().signal;
  assert.equal(
    await upload.extract(
      exportFrame,
      async () => ["x"],
      () => {},
      signal,
    ),
    0,
  );
  assert.deepEqual([...upload.states.values()], ["done", "skipped", "done"]);
  assert.equal(upload.skippedCount, 1);
  // 다시 시도해도 지워진 프레임은 읽지 않는다
  await upload.extract(
    exportFrame,
    async () => ["x"],
    () => {},
    signal,
  );
  assert.deepEqual(calls, ["a", "b", "c"]);

  // 연결이 끊기면 남은 프레임은 실패로 두고 멈추되, 읽은 프레임은 그대로 올릴 수 있다
  const lost = new FrameUpload("s", frames);
  const lostCalls = [];
  await lost.extract(
    async (id) => {
      lostCalls.push(id);
      if (id === "b") throw new Error("DISCONNECTED");
      return { image: new Uint8Array([1]), data: doc(id) };
    },
    async () => ["x"],
    () => {},
    signal,
  );
  assert.equal(lost.stopped, "DISCONNECTED");
  assert.deepEqual(lostCalls, ["a", "b"]);
  assert.deepEqual([...lost.states.values()], ["done", "failed", "failed"]);
  assert.deepEqual(
    JSON.parse(lost.payload().manifest).frames.map((f) => f.name),
    ["화면 a"],
  );
});

test("읽는 사이 바뀐 이름으로 올린다", async () => {
  const upload = new FrameUpload("s", [frames[0]]);
  await upload.extract(
    async () => ({
      image: new Uint8Array([1]),
      data: doc("a"),
      frame: { ...frames[0], name: "새 이름" },
    }),
    async () => ["x"],
    () => {},
    new AbortController().signal,
  );
  assert.equal(JSON.parse(upload.payload().manifest).frames[0].name, "새 이름");
});

test("실패 이유가 모두 같을 때만 그 이유를 알려준다", async () => {
  const frames = [
    { nodeId: "1", name: "A", width: 10, height: 10 },
    { nodeId: "2", name: "B", width: 10, height: 10 },
  ];
  const same = new FrameUpload("s", frames);
  await same.extract(
    async () => {
      throw new Error("IMAGE_TOO_LARGE");
    },
    async () => [],
    () => {},
    new AbortController().signal,
  );
  assert.equal(same.commonFailure, "IMAGE_TOO_LARGE");

  const mixed = new FrameUpload("s", frames);
  await mixed.extract(
    async (nodeId) => {
      throw new Error(nodeId === "1" ? "IMAGE_TOO_LARGE" : "INVALID_SELECTION");
    },
    async () => [],
    () => {},
    new AbortController().signal,
  );
  assert.equal(mixed.commonFailure, null);
});
