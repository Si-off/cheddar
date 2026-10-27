import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

function load(path, require = () => ({})) {
  const code = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const module = { exports: {} };
  new Function("module", "exports", "require", code)(
    module,
    module.exports,
    require,
  );
  return module.exports;
}
// 변환은 서버와 함께 쓰는 @cheddar/contracts에 있다
const contracts = load(
  "../../../../../../packages/contracts/src/screen-document.ts",
);
const { buildScreenDocument, readFrameSource } = load(
  "./screen-document.ts",
  (name) => (name === "@cheddar/contracts" ? contracts : {}),
);

// exportAsync({ format: "JSON_REST_V1" })의 document 모양. 보이는 노드는 visible을 생략한다
const at = (x, y, width = 100, height = 20) => ({
  absoluteBoundingBox: { x, y, width, height },
});
const text = (id, characters, x, y, extra = {}) => ({
  id,
  type: "TEXT",
  name: characters,
  characters,
  ...at(x, y),
  ...extra,
});
const row = (id, label, y) => ({
  id,
  type: "INSTANCE",
  name: "List/Row",
  ...at(0, y),
  children: [text(`${id}t`, label, 0, y)],
});
const board = (name, children, extra = {}) => ({
  id: "1",
  type: "FRAME",
  name,
  ...at(1000, 2000, 390, 844),
  children,
  ...extra,
});

test("숨김과 벡터는 빼고 글자를 위에서 아래, 왼쪽부터 읽는다", () => {
  const doc = buildScreenDocument(
    board(
      "로그인",
      [
        text("b", "비밀번호", 1000, 2100),
        text("a2", "로그인", 1200, 2010),
        text("a1", "뒤로", 1000, 2012),
        text("h", "숨은 글자", 1000, 2050, { visible: false }),
        { id: "v", type: "VECTOR", name: "Vector", ...at(0, 0) },
      ],
      at(1000, 2000, 390.4, 844),
    ),
  );
  assert.deepEqual(doc.texts, ["뒤로", "로그인", "비밀번호"]);
  assert.deepEqual(doc.board, {
    id: "1",
    name: "로그인",
    width: 390,
    height: 844,
  });
  assert.ok(!JSON.stringify(doc).includes("숨은 글자"));
});

test("같은 컴포넌트의 반복 항목도 서로 다른 값과 노드 ID를 모두 보존한다", () => {
  const doc = buildScreenDocument(
    board("목록", [
      {
        id: "list",
        type: "FRAME",
        name: "주문 목록",
        ...at(0, 0),
        children: [1, 2, 3, 4, 5].map((n) => row(`r${n}`, `주문 ${n}`, n * 50)),
      },
    ]),
  );
  const list = doc.tree[0];
  assert.equal(list.children.length, 5);
  assert.deepEqual(
    list.children.map((node) => node.id),
    ["r1", "r2", "r3", "r4", "r5"],
  );
  assert.ok(list.children.every((node) => node.parentId === "list"));
  assert.deepEqual(doc.texts, [
    "주문 1",
    "주문 2",
    "주문 3",
    "주문 4",
    "주문 5",
  ]);
});

test("컴포넌트 속성과 글자 없는 아이콘 인스턴스의 이름과 위치를 남긴다", () => {
  const doc = buildScreenDocument(
    board("설정", [
      {
        id: "t",
        type: "INSTANCE",
        name: "Toggle",
        ...at(0, 0),
        componentProperties: {
          "State#12:3": { type: "VARIANT", value: "On" },
          "Icon#1:2": { type: "INSTANCE_SWAP", value: "9:9" },
        },
        children: [],
      },
      {
        id: "i",
        type: "INSTANCE",
        name: "Icon/Search",
        ...at(0, 40),
        children: [{ id: "p", type: "VECTOR", name: "path", ...at(0, 40) }],
      },
    ]),
  );
  assert.deepEqual(doc.tree, [
    {
      kind: "instance",
      id: "t",
      parentId: "1",
      bounds: at(0, 0).absoluteBoundingBox,
      name: "Toggle",
      props: { State: "On" },
    },
    {
      kind: "instance",
      id: "i",
      parentId: "1",
      bounds: at(0, 40).absoluteBoundingBox,
      name: "Icon/Search",
    },
  ]);
});

test("원본 컴포넌트가 깨져 속성이 없는 인스턴스도 화면 내용을 만든다", () => {
  const doc = buildScreenDocument(
    board("주문 관리", [
      {
        id: "b",
        type: "INSTANCE",
        name: "Button",
        ...at(0, 0),
        children: [text("bt", "저장", 0, 0)],
      },
    ]),
  );
  assert.deepEqual(doc.texts, ["저장"]);
});

test("연결은 이름으로 바꾸고 대상을 모르는 연결은 버리며 주석을 남긴다", () => {
  const source = board("장바구니", [
    text("buy", "주문하기", 0, 0, {
      interactions: [
        {
          trigger: { type: "ON_CLICK" },
          actions: [{ type: "NODE", destinationId: "9:1" }],
        },
        { trigger: null, actions: [{ type: "NODE", destinationId: "9:404" }] },
        { trigger: { type: "ON_CLICK" }, actions: [{ type: "BACK" }] },
      ],
      annotations: [{ label: "재고가 없으면 비활성" }],
    }),
  ]);
  const doc = buildScreenDocument(source, {
    externalNames: { "9:1": "주문서" },
  });
  assert.deepEqual(doc.links, [
    { from: "주문하기", to: "주문서", trigger: "ON_CLICK" },
  ]);
  assert.deepEqual(doc.notes, [
    { target: "주문하기", text: "재고가 없으면 비활성" },
  ]);
});

test("주석은 main이 보낸 Markdown을 먼저 쓴다", () => {
  const source = board("상세", [
    text("t", "쿠폰 보기", 0, 0, { annotations: [{ label: "명세 참고" }] }),
  ]);
  const doc = buildScreenDocument(source, {
    annotations: {
      t: [{ label: "명세 참고", labelMarkdown: "[명세](https://x.test) 참고" }],
    },
  });
  assert.deepEqual(doc.notes, [
    { target: "쿠폰 보기", text: "[명세](https://x.test) 참고" },
  ]);
});

test("보드 자신의 화면 전환과 주석도 남긴다", () => {
  const doc = buildScreenDocument(
    board("스플래시", [text("t", "Cheddar", 0, 0)], {
      interactions: [
        {
          trigger: { type: "AFTER_TIMEOUT", timeout: 2000 },
          actions: [{ type: "NODE", destinationId: "9:2" }],
        },
      ],
      annotations: [{ label: "2초 뒤 홈으로" }],
    }),
    { externalNames: { "9:2": "홈" } },
  );
  assert.deepEqual(doc.links, [
    { from: "스플래시", to: "홈", trigger: "AFTER_TIMEOUT" },
  ]);
  assert.deepEqual(doc.notes, [{ target: "스플래시", text: "2초 뒤 홈으로" }]);
});

test("연결선은 보드 안 노드 이름과 라벨로 남긴다", () => {
  const doc = buildScreenDocument(
    board("흐름", [
      text("a", "결제", 0, 0),
      text("b", "완료", 0, 100),
      {
        id: "c",
        type: "CONNECTOR",
        name: "Connector",
        ...at(0, 50),
        connectorStart: { endpointNodeId: "a" },
        connectorEnd: { endpointNodeId: "b" },
        characters: " 성공  시 ",
      },
    ]),
  );
  assert.deepEqual(doc.links, [{ from: "결제", to: "완료", label: "성공 시" }]);
});

test("5MB를 넘는 화면도 마지막 텍스트와 트리를 원래 프레임 안에 보존한다", () => {
  const children = Array.from({ length: 1400 }, (_, i) =>
    text(`t${i}`, `${i}-${"한".repeat(1990)}`, 0, i * 30),
  );
  const { document } = readFrameSource({
    document: JSON.stringify(board("주문", children)),
    annotations: {},
    externalNames: {},
  });
  assert.ok(
    new TextEncoder().encode(JSON.stringify(document)).length > 5 * 1024 * 1024,
  );
  assert.equal(document.board.id, "1");
  assert.deepEqual(
    document.texts,
    children.map((node) => node.characters),
  );
  assert.deepEqual(
    document.tree.map((node) => node.id),
    children.map((node) => node.id),
  );
});

test("긴 설명과 줄바꿈, 부분 취소선, 주석, 부모와 위치를 함께 보존한다", () => {
  const characters = `폐기 정책\n${"상세 규칙\n".repeat(400)}마지막 필수 규칙`;
  const doc = buildScreenDocument(
    board("정책", [
      {
        id: "container",
        type: "FRAME",
        name: "Frame 42",
        ...at(10, 20),
        children: [
          text("rules", characters, 10, 20, {
            style: { textDecoration: "NONE" },
            characterStyleOverrides: [1, 1, 1, 1, 1],
            styleOverrideTable: { 1: { textDecoration: "STRIKETHROUGH" } },
          }),
        ],
      },
    ]),
    { annotations: { rules: [{ labelMarkdown: "1. 첫 조건\n2. 다음 조건" }] } },
  );
  assert.deepEqual(doc.texts, [characters]);
  const node = doc.tree[0].children[0];
  assert.equal(node.id, "rules");
  assert.equal(node.parentId, "container");
  assert.equal(doc.tree[0].parentId, doc.board.id);
  assert.deepEqual(node.bounds, at(10, 20).absoluteBoundingBox);
  assert.deepEqual(node.textStyles, [
    { start: 0, end: 5, decoration: "STRIKETHROUGH" },
  ]);
  assert.equal(doc.notes[0].text, "1. 첫 조건\n2. 다음 조건");
});

test("기능을 나타내는 벡터 아이콘과 해당 주석 및 연결을 보존한다", () => {
  const doc = buildScreenDocument(
    board("목록", [
      {
        id: "add",
        type: "VECTOR",
        name: "plus",
        ...at(10, 20),
        annotations: [{ label: "새 항목 추가" }],
        interactions: [
          {
            trigger: { type: "ON_CLICK" },
            actions: [{ type: "NODE", destinationId: "next" }],
          },
        ],
      },
    ]),
    { externalNames: { next: "항목 추가" } },
  );
  assert.equal(doc.tree[0].kind, "icon");
  assert.equal(doc.tree[0].id, "add");
  assert.equal(doc.notes[0].text, "새 항목 추가");
  assert.deepEqual(doc.links, [
    { from: "plus", to: "항목 추가", trigger: "ON_CLICK" },
  ]);
});
