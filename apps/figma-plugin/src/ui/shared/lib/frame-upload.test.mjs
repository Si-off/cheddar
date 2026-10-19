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

test("실패한 프레임만 다시 추출하고 모두 끝나면 원래 순서로 보낼 내용을 만든다", async () => {
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
  assert.throws(() => upload.payload());

  failB = false;
  assert.equal(await upload.extract(exportFrame, slice, () => {}, signal), 0);
  assert.deepEqual(calls, ["a", "b", "c", "b"]);
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

test("문서가 바뀌면 남은 프레임을 모두 실패로 두고 멈춘다", async () => {
  const upload = new FrameUpload("s", frames);
  const exportFrame = async (id) => {
    if (id === "b") throw new Error("FRAME_CHANGED");
    return { image: new Uint8Array([1]), data: doc(id) };
  };
  await assert.rejects(
    upload.extract(
      exportFrame,
      async () => ["x"],
      () => {},
      new AbortController().signal,
    ),
    /FRAME_CHANGED/,
  );
  assert.deepEqual([...upload.states.values()], ["done", "failed", "failed"]);
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
      throw new Error(nodeId === "1" ? "IMAGE_TOO_LARGE" : "DATA_TOO_LARGE");
    },
    async () => [],
    () => {},
    new AbortController().signal,
  );
  assert.equal(mixed.commonFailure, null);
});
