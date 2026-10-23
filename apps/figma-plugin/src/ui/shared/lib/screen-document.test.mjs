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
const protocol = load("../../../protocol/messages.ts");
const { buildScreenDocument, readFrameSource } = load(
  "./screen-document.ts",
  () => protocol,
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
  assert.deepEqual(doc.board, { name: "로그인", width: 390, height: 844 });
  assert.ok(!JSON.stringify(doc).includes("숨은 글자"));
});

test("같은 컴포넌트가 이어 반복되면 처음 두 개와 개수만 남긴다", () => {
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
  assert.equal(list.children.length, 2);
  assert.equal(list.children[1].repeated, 5);
  assert.deepEqual(doc.texts, ["주문 1", "주문 2"]);
});

test("컴포넌트 속성은 남기고 글자 없는 아이콘은 버린다", () => {
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
    { kind: "instance", name: "Toggle", props: { State: "On" } },
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

test("원본 문자열로 화면 문서를 만들고 서버 상한을 넘으면 막지 않고 줄인다", () => {
  const source = (children) => ({
    document: JSON.stringify(board("주문", children)),
    annotations: {},
    externalNames: {},
  });
  const small = readFrameSource(source([text("t", "결제하기", 0, 0)]));
  assert.equal(small.reduced, false);
  assert.deepEqual(small.document.texts, ["결제하기"]);
  const large = Array.from({ length: 1400 }, (_, i) =>
    text(`t${i}`, `${i}-${"한".repeat(1990)}`, 0, i * 30),
  );
  const { document, reduced } = readFrameSource(source(large));
  assert.equal(reduced, true);
  assert.ok(
    new TextEncoder().encode(JSON.stringify(document)).length <=
      protocol.MAX_FRAME_DATA_BYTES,
  );
  assert.equal(document.board.name, "주문");
  assert.deepEqual(document.tree, []);
  assert.ok(document.texts.length > 0);
});
