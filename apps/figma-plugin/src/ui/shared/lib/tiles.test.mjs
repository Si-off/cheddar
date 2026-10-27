import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(
  // 나누는 규칙은 서버와 함께 쓰는 @workspace/contracts에 있다
  readFileSync(
    new URL(
      "../../../../../../packages/contracts/src/tiles.ts",
      import.meta.url,
    ),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const module = { exports: {} };
new Function("module", "exports", code)(module, module.exports);
const { tileRects, TILE_HEIGHT, TILE_OVERLAP } = module.exports;

test("보통 높이의 보드는 나누지 않는다", () => {
  assert.deepEqual(tileRects(1688), [{ top: 0, height: 1688 }]);
});

test("긴 보드는 겹치게 나누고 끝까지 빠짐없이 덮는다", () => {
  for (const height of [2001, 3000, 5400, 12345]) {
    const rects = tileRects(height);
    assert.ok(rects.length > 1);
    assert.equal(rects[0].top, 0);
    const last = rects.at(-1);
    assert.equal(last.top + last.height, height);
    for (let i = 1; i < rects.length; i += 1) {
      const overlap = rects[i - 1].top + rects[i - 1].height - rects[i].top;
      assert.ok(overlap >= TILE_OVERLAP, `${height}: ${overlap}`);
      assert.ok(rects[i].height === TILE_HEIGHT);
    }
  }
});
