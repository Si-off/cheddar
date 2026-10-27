import assert from "node:assert/strict";
import test from "node:test";
import {
  FrameMaterial,
  type FrameText,
} from "../src/generation/pi/frame-material";
import { emptyPiDraft, PiWorkspace } from "../src/generation/pi/workspace";
import type { GenerationInput } from "../src/generation/types";

function fixture(...documents: unknown[]) {
  const input: GenerationInput = {
    columns: [],
    memo: "",
    featureGroups: [],
    screenStructure: [],
    viewpoints: [],
    existingCases: [],
    styleExamples: [],
    frames: documents.map((document, index) => ({
      id: `frame-${index}`,
      name: `화면 ${index}`,
      screenDocument: JSON.stringify(document),
      imageStorageKeys: ["overview", "detail"],
    })),
  };
  const draft = emptyPiDraft();
  const workspace = new PiWorkspace(
    input,
    draft,
    async () => {
      throw new Error("이미지 호출 없음");
    },
    async () => {},
  );
  return { input, draft, workspace };
}

async function call<T>(
  workspace: PiWorkspace,
  name: string,
  args: unknown,
): Promise<T> {
  const tool = workspace.tools().find((t) => t.name === name);
  assert.ok(tool);
  const result = await tool.execute(
    "call",
    args,
    undefined,
    undefined,
    {} as never,
  );
  const text = result.content.find((item) => item.type === "text");
  assert.ok(text && text.type === "text");
  return JSON.parse(text.text) as T;
}
type Page<T> = { items: T[]; total: number; nextOffset: number | null };

test("조회 도구는 원문·취소선·반복 상태·주석·연결을 보존하고 기본 응답에서 구조만 생략한다", async () => {
  const original = {
    schemaVersion: 2,
    board: { id: "board", name: "주문", width: 100, height: 300 },
    texts: ["일반 / 제휴", "선택", "선택"],
    tree: [
      {
        kind: "frame",
        id: "search",
        name: "검색 조건",
        children: [
          {
            kind: "text",
            id: "type",
            parentId: "search",
            text: "일반 / 제휴",
            bounds: { x: 10, y: 20, width: 100, height: 20 },
            textStyles: [{ start: 5, end: 7, decoration: "STRIKETHROUGH" }],
          },
          {
            kind: "instance",
            id: "enabled",
            name: "선택",
            props: { 상태: "활성" },
            children: [{ kind: "text", id: "label1", text: "선택" }],
          },
          {
            kind: "instance",
            id: "disabled",
            name: "선택",
            props: { 상태: "비활성" },
            children: [{ kind: "text", id: "label2", text: "선택" }],
          },
          { kind: "icon", id: "add", name: "추가" },
        ],
      },
    ],
    notes: [
      {
        target: "검색 조건",
        text: "복수 조건 결합 방식은 개발 확인 필요\n확정하지 않음",
      },
    ],
    links: [{ from: "주문번호", to: "주문 상세", trigger: "ON_CLICK" }],
  };
  const f = fixture(original),
    before = f.input.frames[0].screenDocument;
  const list = await call<{
    frames: {
      areas: { name: string }[];
      textCharacters: number;
      imageIndices: number[];
    }[];
  }>(f.workspace, "list_materials", {});
  assert.ok(list.frames[0].areas.some((a) => a.name === "검색 조건"));
  assert.deepEqual(list.frames[0].imageIndices, [0, 1]);
  assert.ok(list.frames[0].textCharacters < before.length);
  const read = await call<Page<FrameText>>(f.workspace, "read_frame", {
    frameId: "frame-0",
  });
  assert.equal(read.items.filter((x) => x.text === "선택").length, 2);
  assert.equal(read.items.filter((x) => x.text === "일반 / 제휴").length, 1);
  assert.deepEqual(read.items.find((x) => x.nodeId === "type")?.textStyles, [
    { start: 5, end: 7, decoration: "STRIKETHROUGH", text: "제휴" },
  ]);
  assert.match(JSON.stringify(read.items), /비활성/);
  assert.ok(read.items.some((x) => x.kind === "note" && x.text.includes("\n")));
  assert.ok(
    read.items.some((x) => x.kind === "link" && x.text.includes("주문 상세")),
  );
  assert.ok(read.items.some((x) => x.kind === "icon" && x.text === "추가"));
  assert.doesNotMatch(JSON.stringify(read), /bounds|parentId|children/);
  const detail = await call<{ data: string }>(f.workspace, "read_frame", {
    frameId: "frame-0",
    nodeId: "type",
    mode: "raw",
  });
  assert.deepEqual(JSON.parse(detail.data), original.tree[0].children[0]);
  const scoped = await call<Page<FrameText>>(f.workspace, "read_frame", {
    frameId: "frame-0",
    nodeId: "disabled",
  });
  assert.deepEqual(
    scoped.items.map((x) => x.nodeId),
    ["disabled", "label2"],
  );
  const raw = await call<{ data: string }>(f.workspace, "read_frame", {
    frameId: "frame-0",
    mode: "raw",
  });
  assert.equal(raw.data, before);
  assert.equal(f.input.frames[0].screenDocument, before);
});

test("긴 설명은 자르지 않고 페이지 경계 뒤의 검색 결과와 다른 화면도 모두 조회한다", async () => {
  const long = `검색 설명\n${"가".repeat(25000)}\n마지막 필수 규칙`;
  const f = fixture(
    {
      tree: [
        {
          id: "section",
          name: "설명",
          children: [
            { id: "long", text: long },
            ...Array.from({ length: 85 }, (_, i) => ({
              id: `t${i}`,
              text: `검색 선택값 ${i}`,
            })),
          ],
        },
      ],
    },
    { texts: [{ id: "last", text: "검색 마지막 화면" }] },
  );
  const first = await call<Page<FrameText>>(f.workspace, "read_frame", {
    frameId: "frame-0",
  });
  assert.equal(first.items[0].text, long);
  assert.equal(first.nextOffset, 1);
  let offset: number | null = 0;
  const hits: {
    frameId: string;
    offset: number;
    match: FrameText;
    next?: FrameText;
  }[] = [];
  do {
    const page: Page<(typeof hits)[number]> = await call(
      f.workspace,
      "search_frames",
      { query: "검색", offset },
    );
    hits.push(...page.items);
    offset = page.nextOffset;
  } while (offset !== null);
  assert.equal(hits.length, 87);
  assert.equal(hits[0].match.text, long);
  assert.equal(hits[0].next?.text, "검색 선택값 0");
  assert.equal(hits.at(-1)?.frameId, "frame-1");
  const scoped = await call<Page<(typeof hits)[number]>>(
    f.workspace,
    "search_frames",
    { query: "검색", frameId: "frame-1" },
  );
  assert.equal(scoped.total, 1);
  const selected = hits[50];
  const read = await call<Page<FrameText>>(f.workspace, "read_frame", {
    frameId: selected.frameId,
    offset: selected.offset,
  });
  assert.deepEqual(read.items[0], selected.match);
  const raw = await call<{ data: string }>(f.workspace, "read_frame", {
    frameId: "frame-0",
    mode: "raw",
    offset: 24000,
  });
  assert.equal(raw.data, f.input.frames[0].screenDocument.slice(24000, 48000));
});

test("이전 텍스트 형식과 원문 전용 형식도 읽으며 잘못된 노드를 읽음으로 기록하지 않는다", async () => {
  const f = fixture({
    texts: [
      {
        id: "old",
        text: "예전 설명",
        textStyles: [{ decoration: "STRIKETHROUGH" }],
      },
      "보충 설명",
    ],
  });
  await assert.rejects(
    call(f.workspace, "read_frame", { frameId: "frame-0", nodeId: "missing" }),
  );
  assert.deepEqual(f.draft.readFrames, []);
  const old = await call<Page<FrameText>>(f.workspace, "read_frame", {
    frameId: "frame-0",
  });
  assert.deepEqual(
    old.items.map((x) => x.text),
    ["예전 설명", "보충 설명"],
  );
  assert.match(JSON.stringify(old), /STRIKETHROUGH/);
  const flat = new FrameMaterial(
    JSON.stringify({ text: "원문", notes: [{ text: "주석" }] }),
  );
  assert.deepEqual(flat.items.map((x) => x.content.text).sort(), [
    "원문",
    "주석",
  ]);
  const unknown = '{"other":"알 수 없는 형식의 원문"}';
  assert.equal(new FrameMaterial(unknown).items[0].content.text, unknown);
});
