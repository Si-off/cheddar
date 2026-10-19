import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const code = ts.transpileModule(
  readFileSync(new URL("./screen-document.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  },
).outputText;
const module = { exports: {} };
new Function("module", "exports", code)(module, module.exports);
const { buildScreenDocument, linkTargets } = module.exports;

const text = (id, characters, x, y, extra = {}) => ({
  id,
  type: "TEXT",
  name: characters,
  characters,
  x,
  y,
  ...extra,
});
const row = (id, label, y) => ({
  id,
  type: "INSTANCE",
  name: "List/Row",
  y,
  children: [text(`${id}t`, label, 0, 0)],
});

test("숨김과 벡터는 빼고 글자를 위에서 아래, 왼쪽부터 읽는다", () => {
  const doc = buildScreenDocument({
    id: "1",
    type: "FRAME",
    name: "로그인",
    width: 390.4,
    height: 844,
    children: [
      text("b", "비밀번호", 0, 100),
      text("a2", "로그인", 200, 10),
      text("a1", "뒤로", 0, 12),
      text("h", "숨은 글자", 0, 50, { visible: false }),
      { id: "v", type: "VECTOR", name: "Vector" },
    ],
  });
  assert.deepEqual(doc.texts, ["뒤로", "로그인", "비밀번호"]);
  assert.deepEqual(doc.board, { name: "로그인", width: 390, height: 844 });
  assert.ok(!JSON.stringify(doc).includes("숨은 글자"));
});

test("같은 컴포넌트가 이어 반복되면 처음 두 개와 개수만 남긴다", () => {
  const doc = buildScreenDocument({
    id: "1",
    type: "FRAME",
    name: "목록",
    children: [
      {
        id: "list",
        type: "FRAME",
        name: "주문 목록",
        children: [1, 2, 3, 4, 5].map((n) => row(`r${n}`, `주문 ${n}`, n * 50)),
      },
    ],
  });
  const list = doc.tree[0];
  assert.equal(list.children.length, 2);
  assert.equal(list.children[1].repeated, 5);
  assert.deepEqual(doc.texts, ["주문 1", "주문 2"]);
});

test("컴포넌트 속성은 남기고 글자 없는 아이콘은 버린다", () => {
  const doc = buildScreenDocument({
    id: "1",
    type: "FRAME",
    name: "설정",
    children: [
      {
        id: "t",
        type: "INSTANCE",
        name: "Toggle",
        componentProperties: {
          "State#12:3": { type: "VARIANT", value: "On" },
          "Icon#1:2": { type: "INSTANCE_SWAP", value: "9:9" },
        },
      },
      {
        id: "i",
        type: "INSTANCE",
        name: "Icon/Search",
        children: [{ id: "p", type: "VECTOR", name: "path" }],
      },
    ],
  });
  assert.deepEqual(doc.tree, [
    { kind: "instance", name: "Toggle", props: { State: "On" } },
  ]);
});

test("연결은 이름으로 바꾸고 대상을 모르는 연결은 버리며 주석을 남긴다", () => {
  const board = {
    id: "1",
    type: "FRAME",
    name: "장바구니",
    children: [
      {
        ...text("buy", "주문하기", 0, 0),
        reactions: [
          {
            trigger: { type: "ON_CLICK" },
            actions: [{ type: "NODE", destinationId: "9:1" }],
          },
          { actions: [{ type: "NODE", destinationId: "9:404" }] },
        ],
        annotations: [{ label: "재고가 없으면 비활성" }],
      },
    ],
  };
  assert.deepEqual(linkTargets(board).sort(), ["9:1", "9:404"]);
  const doc = buildScreenDocument(board, new Map([["9:1", "주문서"]]));
  assert.deepEqual(doc.links, [
    { from: "주문하기", to: "주문서", trigger: "ON_CLICK" },
  ]);
  assert.deepEqual(doc.notes, [
    { target: "주문하기", text: "재고가 없으면 비활성" },
  ]);
});

test("보드 자신의 화면 전환과 주석도 남긴다", () => {
  const doc = buildScreenDocument(
    {
      id: "1",
      type: "FRAME",
      name: "스플래시",
      reactions: [
        {
          trigger: { type: "AFTER_TIMEOUT" },
          actions: [{ type: "NODE", destinationId: "9:2" }],
        },
      ],
      annotations: [{ label: "2초 뒤 홈으로" }],
      children: [text("t", "Cheddar", 0, 0)],
    },
    new Map([["9:2", "홈"]]),
  );
  assert.deepEqual(doc.links, [
    { from: "스플래시", to: "홈", trigger: "AFTER_TIMEOUT" },
  ]);
  assert.deepEqual(doc.notes, [{ target: "스플래시", text: "2초 뒤 홈으로" }]);
});
