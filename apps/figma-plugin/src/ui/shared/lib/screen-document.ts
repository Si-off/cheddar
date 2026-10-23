// 보드 하나를 AI가 읽을 화면 문서로 줄인다. 원본 JSON 대신 글자와 구조, 연결만 남긴다.
// main이 exportAsync({ format: "JSON_REST_V1" })로 보낸 REST 모양 트리를 읽는다.
import type { FrameNode, SubcanvasNode } from "@figma/rest-api-spec";
import {
  type FrameAnnotation,
  type FrameSource,
  MAX_FRAME_DATA_BYTES,
} from "../../../protocol/messages";

export type SourceNode = FrameNode | SubcanvasNode;

export type ScreenNode = {
  kind: "frame" | "instance" | "text";
  name?: string;
  text?: string;
  props?: Record<string, string | boolean>;
  note?: string;
  children?: ScreenNode[];
  /** 같은 컴포넌트가 이어 반복되어 처음 두 개만 남겼을 때 원래 개수 */
  repeated?: number;
};

export type ScreenDocument = {
  schemaVersion: 2;
  board: { name: string; width: number; height: number };
  /** 읽는 순서의 글자 */
  texts: string[];
  tree: ScreenNode[];
  links: { from: string; to: string; trigger?: string; label?: string }[];
  notes: { target: string; text: string }[];
};

// REST 명세에는 아직 형식이 없지만 원본에 label만 담겨 온다
type Annotated = { annotations?: FrameAnnotation[] };

const DROP = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "REGULAR_POLYGON",
  "RECTANGLE",
  "SLICE",
]);
const KEEP_REPEATED = 2;
const MAX_TEXT = 2000;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
// 속성 이름 끝의 "#12:3" 같은 내부 ID는 뜻이 없어 지운다
const propName = (name: string) => name.replace(/#[\d:]+$/, "");
const box = (node: SourceNode) =>
  "absoluteBoundingBox" in node ? node.absoluteBoundingBox : null;
const childrenOf = (node: SourceNode): readonly SourceNode[] =>
  "children" in node ? node.children : [];
const interactionsOf = (node: SourceNode) =>
  ("interactions" in node ? node.interactions : undefined) ?? [];

function readingOrder(nodes: readonly SourceNode[]) {
  // 좌표가 있으면 위에서 아래, 같은 줄은 왼쪽부터 읽는다. 8px 안쪽 차이는 같은 줄로 본다.
  return [...nodes].sort((a, b) => {
    const first = box(a);
    const second = box(b);
    if (!first || !second) return 0;
    const dy = first.y - second.y;
    if (Math.abs(dy) > 8) return dy;
    return first.x - second.x;
  });
}

function signature(node: ScreenNode) {
  return node.kind === "instance" ? `instance:${node.name}` : null;
}

function collapse(children: ScreenNode[]) {
  const out: ScreenNode[] = [];
  for (let i = 0; i < children.length; ) {
    const key = signature(children[i]);
    let end = i + 1;
    while (key && end < children.length && signature(children[end]) === key)
      end += 1;
    const run = end - i;
    if (run > KEEP_REPEATED) {
      out.push(...children.slice(i, i + KEEP_REPEATED));
      out[out.length - 1] = { ...out[out.length - 1], repeated: run };
    } else out.push(...children.slice(i, end));
    i = end;
  }
  return out;
}

const own = <T>(map: Readonly<Record<string, T>>, key: string) =>
  Object.hasOwn(map, key) ? map[key] : undefined;

export function buildScreenDocument(
  board: SourceNode,
  {
    annotations = {},
    externalNames = {},
  }: Partial<Omit<FrameSource, "document">> = {},
): ScreenDocument {
  const names = new Map<string, string>();
  const links: ScreenDocument["links"] = [];
  const notes: ScreenDocument["notes"] = [];
  const pendingLinks: {
    from: string;
    toId: string;
    trigger?: string;
    label?: string;
  }[] = [];

  // 주석과 화면 전환 연결. 보드 자신(시간 지연 전환 등)과 안쪽 노드 모두에서 모은다
  const gather = (node: SourceNode) => {
    names.set(node.id, clean(node.name));
    // Markdown이 있는 main의 주석을 먼저 쓴다
    const list =
      own(annotations, node.id) ?? (node as Annotated).annotations ?? [];
    for (const a of list) {
      const text = clean(a.labelMarkdown || a.label || "");
      if (text) notes.push({ target: clean(node.name), text });
    }
    for (const r of interactionsOf(node))
      for (const action of r.actions ?? [])
        if ("destinationId" in action && action.destinationId)
          pendingLinks.push({
            from: clean(node.name),
            toId: action.destinationId,
            trigger: r.trigger?.type,
          });
  };
  const visit = (node: SourceNode): ScreenNode | null => {
    // REST 모양은 보이는 노드의 visible을 생략한다
    if (node.visible === false || DROP.has(node.type)) return null;
    gather(node);
    if (node.type === "CONNECTOR") {
      const from = node.connectorStart.endpointNodeId;
      const to = node.connectorEnd.endpointNodeId;
      const label = clean(node.characters ?? "");
      if (from && to)
        pendingLinks.push({
          from: `#${from}`,
          toId: to,
          label: label || undefined,
        });
      return null;
    }
    if (node.type === "TEXT") {
      const text = clean(node.characters ?? "").slice(0, MAX_TEXT);
      if (!text) return null;
      return { kind: "text", text };
    }
    const instance = node.type === "INSTANCE";
    const props: Record<string, string | boolean> = {};
    // 원본 컴포넌트 세트에 오류가 있는 인스턴스는 속성이 비어 온다. 속성만 빼고 화면은 그대로 올린다
    if (instance)
      for (const [key, p] of Object.entries(node.componentProperties ?? {}))
        if (
          p.type !== "INSTANCE_SWAP" &&
          (typeof p.value === "string" || typeof p.value === "boolean")
        )
          props[propName(key)] = p.value;
    const children = collapse(
      readingOrder(childrenOf(node))
        .map(visit)
        .filter((c): c is ScreenNode => c !== null),
    );
    const hasProps = Object.keys(props).length > 0;
    // 글자도 속성도 없는 묶음은 아이콘이나 장식이라 버린다
    if (!children.length && !hasProps) return null;
    // 이름 없는 레이아웃 껍데기는 한 단계로 펼친다
    if (
      !instance &&
      children.length === 1 &&
      /^(Frame|Group) \d+$/.test(node.name)
    )
      return children[0];
    return {
      kind: instance ? "instance" : "frame",
      name: clean(node.name),
      ...(hasProps ? { props } : {}),
      ...(children.length ? { children } : {}),
    };
  };

  gather(board);
  const tree = readingOrder(childrenOf(board))
    .map(visit)
    .filter((c): c is ScreenNode => c !== null);
  // 접힌 반복 항목의 글자는 빼고, 남은 트리 순서대로 모은다
  const texts: string[] = [];
  const collect = (node: ScreenNode) => {
    if (node.text) texts.push(node.text);
    node.children?.forEach(collect);
  };
  tree.forEach(collect);
  for (const link of pendingLinks) {
    const from = link.from.startsWith("#")
      ? (names.get(link.from.slice(1)) ?? "")
      : link.from;
    const to = names.get(link.toId) ?? own(externalNames, link.toId);
    // 대상을 찾지 못한 연결은 뜻을 알 수 없어 남기지 않는다
    if (from && to)
      links.push({
        from,
        to,
        ...(link.trigger ? { trigger: link.trigger } : {}),
        ...(link.label ? { label: link.label } : {}),
      });
  }
  const bounds = box(board);
  return {
    schemaVersion: 2,
    board: {
      name: clean(board.name),
      width: Math.round(bounds?.width ?? 0),
      height: Math.round(bounds?.height ?? 0),
    },
    texts,
    tree,
    links,
    notes,
  };
}

const utf8Size = (document: ScreenDocument) =>
  new TextEncoder().encode(JSON.stringify(document)).length;

/**
 * 화면 문서가 서버 상한보다 크면 줄인다. 구조 트리, 연결, 주석, 글자 순으로 덜어내고 보드 정보는 남긴다.
 * 막지 않고 올릴 수 있는 만큼 올린다.
 */
export function fitScreenDocument(document: ScreenDocument) {
  if (utf8Size(document) <= MAX_FRAME_DATA_BYTES)
    return { document, reduced: false };
  const smaller: ScreenDocument = { ...document, tree: [] };
  for (const key of ["links", "notes", "texts"] as const)
    while (utf8Size(smaller) > MAX_FRAME_DATA_BYTES && smaller[key].length > 0)
      smaller[key] = smaller[key].slice(
        0,
        Math.floor(smaller[key].length / 2),
      ) as never;
  return { document: smaller, reduced: true };
}

/** main이 보낸 원본으로 화면 문서를 만든다. 서버 상한을 넘으면 줄인다. */
export function readFrameSource(source: FrameSource) {
  return fitScreenDocument(
    buildScreenDocument(JSON.parse(source.document) as SourceNode, source),
  );
}
