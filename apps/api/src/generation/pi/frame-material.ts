type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const string = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

export type FrameText = {
  kind: string;
  nodeId?: string;
  area?: string;
  text: string;
  textStyles?: unknown[];
};

/** 노드를 자르지 않고 한 묶음씩 반환한다. 긴 설명 한 개는 예산보다 커도 온전히 읽는다. */
export function materialPage<T>(items: T[], offset: number, limit = 80) {
  const page: T[] = [];
  let characters = 0;
  for (const item of items.slice(offset)) {
    const size = JSON.stringify(item).length;
    if (page.length && (characters + size > 24000 || page.length >= limit))
      break;
    page.push(item);
    characters += size;
  }
  const end = offset + page.length;
  return {
    items: page,
    total: items.length,
    nextOffset: end < items.length ? end : null,
  };
}

/** 저장된 원문은 수정하지 않고, 조회 시에만 텍스트와 의미 있는 속성을 펼친다. */
export class FrameMaterial {
  readonly items: { content: FrameText; ancestors: string[] }[] = [];
  private readonly nodes = new Map<string, unknown>();

  constructor(readonly raw: string) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.add({ kind: "text", text: raw }, []);
      return;
    }
    const document = object(parsed);
    const boardId = string(object(document.board).id);
    if (boardId) this.nodes.set(boardId, parsed);
    const mirrored = new Map<string, number>();
    const visit = (
      value: unknown,
      area: string | undefined,
      parents: string[],
    ) => {
      const node = object(value);
      const nodeId = string(node.id);
      if (nodeId) this.nodes.set(nodeId, value);
      const ancestors = nodeId ? [...parents, nodeId] : parents;
      const text = string(node.text);
      if (text) {
        this.add(this.text(node, area), ancestors);
        mirrored.set(text, (mirrored.get(text) ?? 0) + 1);
      }
      if (Object.keys(object(node.props)).length)
        this.add(
          {
            kind: "properties",
            nodeId,
            area,
            text: JSON.stringify(node.props),
          },
          ancestors,
        );
      if (typeof node.note === "string")
        this.add({ kind: "note", nodeId, area, text: node.note }, ancestors);
      if (node.kind === "icon" && typeof node.name === "string")
        this.add({ kind: "icon", nodeId, area, text: node.name }, ancestors);
      for (const child of array(node.children)) visit(child, area, ancestors);
    };
    for (const node of array(document.tree))
      visit(node, string(object(node).name), boardId ? [boardId] : []);

    // texts는 tree의 미러일 때만 제외한다. 서로 다른 트리 노드의 반복값은 합치지 않는다.
    for (const value of array(document.texts)) {
      const node = typeof value === "string" ? { text: value } : object(value);
      const nodeId = string(node.id);
      if (nodeId && this.nodes.has(nodeId)) continue;
      const text = string(node.text);
      if (!text) continue;
      const remaining = mirrored.get(text) ?? 0;
      if (!nodeId && remaining > 0) {
        mirrored.set(text, remaining - 1);
        continue;
      }
      if (nodeId) this.nodes.set(nodeId, value);
      this.add(this.text(node), nodeId ? [nodeId] : []);
    }
    for (const value of array(document.notes)) {
      const note = object(value);
      if (typeof note.text === "string")
        this.add(
          { kind: "note", area: string(note.target), text: note.text },
          [],
        );
    }
    for (const value of array(document.links))
      this.add({ kind: "link", text: JSON.stringify(value) }, []);
    if (typeof document.text === "string") {
      if (typeof document.id === "string") this.nodes.set(document.id, parsed);
      this.add(this.text(document), document.id ? [String(document.id)] : []);
    }
    if (!this.items.length) this.add({ kind: "source", text: raw }, []);
  }

  private text(node: ObjectValue, area?: string): FrameText {
    const text = String(node.text);
    const styles = array(node.textStyles);
    return {
      kind: "text",
      nodeId: string(node.id),
      area,
      text,
      ...(styles.length
        ? {
            textStyles: styles.map((value) => {
              const style = object(value);
              return {
                ...style,
                ...(typeof style.start === "number" &&
                typeof style.end === "number"
                  ? { text: text.slice(style.start, style.end) }
                  : {}),
              };
            }),
          }
        : {}),
    };
  }

  private add(content: FrameText, ancestors: string[]) {
    if (content.text.trim()) this.items.push({ content, ancestors });
  }

  summary() {
    const areas = new Map<string, number>();
    for (const { content } of this.items)
      if (content.area)
        areas.set(content.area, (areas.get(content.area) ?? 0) + 1);
    return {
      textCharacters: this.items.reduce(
        (n, item) => n + item.content.text.length,
        0,
      ),
      textItems: this.items.length,
      areas: [...areas].map(([name, items]) => ({ name, items })),
    };
  }

  read(offset: number, mode: "text" | "raw", nodeId?: string) {
    if (nodeId && !this.nodes.has(nodeId))
      throw new Error("선택한 화면에서 노드를 찾을 수 없습니다.");
    if (mode === "raw") {
      const raw = nodeId ? JSON.stringify(this.nodes.get(nodeId)) : this.raw;
      const end = offset + 24000;
      return {
        mode,
        data: raw.slice(offset, end),
        nextOffset: end < raw.length ? end : null,
      };
    }
    const items = this.items
      .filter((item) => !nodeId || item.ancestors.includes(nodeId))
      .map((item) => item.content);
    return { mode, ...materialPage(items, offset) };
  }

  search(query: string) {
    const needle = query.toLowerCase();
    return this.items.flatMap(({ content }, offset) => {
      if (!content.text.toLowerCase().includes(needle)) return [];
      const neighbor = (index: number) => {
        const item = this.items[index]?.content;
        return item?.area === content.area ? item : undefined;
      };
      return [
        {
          offset,
          match: content,
          previous: neighbor(offset - 1),
          next: neighbor(offset + 1),
        },
      ];
    });
  }
}
