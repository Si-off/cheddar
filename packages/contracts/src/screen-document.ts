// 보드 하나를 AI가 읽을 화면 문서로 줄인다. 원본 JSON 대신 글자와 구조, 연결만 남긴다.
// 플러그인의 exportAsync({ format: "JSON_REST_V1" })와 서버의 Figma REST 응답이 같은 모양이라 둘 다 이 변환을 쓴다.
import type { FrameNode, SubcanvasNode } from "@figma/rest-api-spec";

export type SourceNode = FrameNode | SubcanvasNode;

export type ScreenNode = {
  kind: "frame" | "instance" | "text" | "icon";
  id: string;
  parentId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  name?: string;
  text?: string;
  props?: Record<string, string | boolean>;
  note?: string;
  children?: ScreenNode[];
  textStyles?: { start: number; end: number; decoration: string }[];
};

export type ScreenDocument = {
  schemaVersion: 2;
  board: { id: string; name: string; width: number; height: number };
  /** 읽는 순서의 글자 */
  texts: string[];
  tree: ScreenNode[];
  links: { from: string; to: string; trigger?: string; label?: string }[];
  notes: { target: string; text: string }[];
};

/** Plugin API의 주석. REST 원본에는 labelMarkdown이 없다 */
export type FrameAnnotation = { label?: string; labelMarkdown?: string };
export type ScreenDocumentOptions = {
  /** 노드 ID별 주석. 원본에 담긴 주석보다 먼저 쓴다 */
  annotations: Record<string, FrameAnnotation[]>;
  /** 보드 밖에 있는 연결 대상의 이름 */
  externalNames: Record<string, string>;
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

const own = <T>(map: Readonly<Record<string, T>>, key: string) =>
  Object.hasOwn(map, key) ? map[key] : undefined;

export function buildScreenDocument(
  board: SourceNode,
  { annotations = {}, externalNames = {} }: Partial<ScreenDocumentOptions> = {},
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
      const text = (a.labelMarkdown || a.label || "").trim();
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
  const visit = (node: SourceNode, parentId: string): ScreenNode | null => {
    // REST 모양은 보이는 노드의 visible을 생략한다
    if (node.visible === false) return null;
    const bounds = box(node);
    const provenance = {
      id: node.id,
      parentId,
      ...(bounds ? { bounds } : {}),
    };
    gather(node);
    if (DROP.has(node.type))
      return /plus|minus|close|arrow|추가|삭제|닫기/i.test(node.name)
        ? { kind: "icon", name: node.name, ...provenance }
        : null;
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
      const text = node.characters ?? "";
      if (!text.trim()) return null;
      const textStyles: NonNullable<ScreenNode["textStyles"]> = [];
      const overrides = node.characterStyleOverrides ?? [];
      for (let start = 0; start < text.length; ) {
        const decoration = (index: number) =>
          node.styleOverrideTable?.[overrides[index]]?.textDecoration ??
          node.style?.textDecoration ??
          "NONE";
        const value = decoration(start);
        let end = start + 1;
        while (end < text.length && decoration(end) === value) end++;
        if (value !== "NONE")
          textStyles.push({ start, end, decoration: value });
        start = end;
      }
      return {
        kind: "text",
        text,
        ...provenance,
        ...(textStyles.length ? { textStyles } : {}),
      };
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
    const children = readingOrder(childrenOf(node))
      .map((child) => visit(child, node.id))
      .filter((c): c is ScreenNode => c !== null);
    const hasProps = Object.keys(props).length > 0;
    // 글자도 속성도 없는 묶음은 아이콘이나 장식이라 버린다
    if (
      !instance &&
      !children.length &&
      !hasProps &&
      !/plus|minus|close|arrow|추가|삭제|닫기/i.test(node.name)
    )
      return null;
    return {
      kind: instance ? "instance" : "frame",
      ...provenance,
      name: clean(node.name),
      ...(hasProps ? { props } : {}),
      ...(children.length ? { children } : {}),
    };
  };

  gather(board);
  const tree = readingOrder(childrenOf(board))
    .map((node) => visit(node, board.id))
    .filter((c): c is ScreenNode => c !== null);
  // 모든 선택값과 설명의 원문을 읽는 순서대로 보존한다.
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
      id: board.id,
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
