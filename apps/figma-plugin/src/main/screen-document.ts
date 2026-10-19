// 보드 하나를 AI가 읽을 화면 문서로 줄인다. 원본 JSON 대신 글자와 구조, 연결만 남긴다.
// Figma 노드의 필요한 부분만 구조로 받아서 Figma 밖에서도 검사할 수 있게 한다.

export type SourceNode = {
  id: string;
  type: string;
  name: string;
  visible?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  characters?: string;
  componentProperties?: Record<
    string,
    { type: string; value: string | boolean }
  >;
  annotations?: readonly { label?: string; labelMarkdown?: string }[];
  reactions?: readonly {
    trigger?: { type?: string } | null;
    actions?: readonly { type?: string; destinationId?: string | null }[];
  }[];
  connectorStart?: { endpointNodeId?: string };
  connectorEnd?: { endpointNodeId?: string };
  text?: { characters?: string };
  children?: readonly SourceNode[];
};

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

const DROP = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "POLYGON",
  "RECTANGLE",
  "SLICE",
]);
const KEEP_REPEATED = 2;
const MAX_TEXT = 2000;

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
// 속성 이름 끝의 "#12:3" 같은 내부 ID는 뜻이 없어 지운다
const propName = (name: string) => name.replace(/#[\d:]+$/, "");

function readingOrder(nodes: readonly SourceNode[]) {
  // 좌표가 있으면 위에서 아래, 같은 줄은 왼쪽부터 읽는다. 8px 안쪽 차이는 같은 줄로 본다.
  return [...nodes].sort((a, b) => {
    if (a.y === undefined || b.y === undefined) return 0;
    const dy = a.y - b.y;
    if (Math.abs(dy) > 8) return dy;
    return (a.x ?? 0) - (b.x ?? 0);
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

/** 연결 대상 ID를 모은다. 다른 보드로 가는 대상은 main이 이름을 찾아 넘긴다. */
export function linkTargets(board: SourceNode): string[] {
  const ids = new Set<string>();
  const walk = (node: SourceNode) => {
    for (const r of node.reactions ?? [])
      for (const a of r.actions ?? [])
        if (a.destinationId) ids.add(a.destinationId);
    if (node.connectorEnd?.endpointNodeId)
      ids.add(node.connectorEnd.endpointNodeId);
    for (const child of node.children ?? []) walk(child);
  };
  walk(board);
  return [...ids];
}

export function buildScreenDocument(
  board: SourceNode,
  /** 이 보드 밖에 있는 연결 대상의 이름 */
  external: ReadonlyMap<string, string> = new Map(),
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
    for (const a of node.annotations ?? []) {
      const text = clean(a.labelMarkdown || a.label || "");
      if (text) notes.push({ target: clean(node.name), text });
    }
    for (const r of node.reactions ?? [])
      for (const action of r.actions ?? [])
        if (action.destinationId)
          pendingLinks.push({
            from: clean(node.name),
            toId: action.destinationId,
            trigger: r.trigger?.type,
          });
  };
  const visit = (node: SourceNode): ScreenNode | null => {
    if (node.visible === false || DROP.has(node.type)) return null;
    gather(node);
    if (node.type === "CONNECTOR") {
      const from = node.connectorStart?.endpointNodeId;
      const to = node.connectorEnd?.endpointNodeId;
      const label = clean(node.text?.characters ?? "");
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
    const props: Record<string, string | boolean> = {};
    for (const [key, p] of Object.entries(node.componentProperties ?? {}))
      if (p.type !== "INSTANCE_SWAP") props[propName(key)] = p.value;
    const children = collapse(
      readingOrder(node.children ?? [])
        .map(visit)
        .filter((c): c is ScreenNode => c !== null),
    );
    const hasProps = Object.keys(props).length > 0;
    // 글자도 속성도 없는 묶음은 아이콘이나 장식이라 버린다
    if (!children.length && !hasProps) return null;
    const instance = node.type === "INSTANCE";
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
  const tree = readingOrder(board.children ?? [])
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
    const to = names.get(link.toId) ?? external.get(link.toId);
    // 대상을 찾지 못한 연결은 뜻을 알 수 없어 남기지 않는다
    if (from && to)
      links.push({
        from,
        to,
        ...(link.trigger ? { trigger: link.trigger } : {}),
        ...(link.label ? { label: link.label } : {}),
      });
  }
  return {
    schemaVersion: 2,
    board: {
      name: clean(board.name),
      width: Math.round(board.width ?? 0),
      height: Math.round(board.height ?? 0),
    },
    texts,
    tree,
    links,
    notes,
  };
}
