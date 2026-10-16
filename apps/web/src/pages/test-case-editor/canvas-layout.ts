import ELK from "elkjs/lib/elk.bundled.js";
import {
  type CaseDraft,
  displayValue,
  type Snapshot,
} from "@/entities/test-case";
import type { Flow, Layout } from "./canvas-session";

export type CanvasGroup = {
  id: string;
  title: string;
  description: string;
  caseIds: string[];
  stepId?: string;
};
export type Geometry = {
  id: string;
  parentId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export const CARD_WIDTH = 520;
const GAP = 32;
function groupKey(value: string) {
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < value.length; i++) {
    a = Math.imul(a ^ value.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ value.charCodeAt(i);
  }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
export function canvasGroups(
  snapshot: Snapshot,
  flow: Flow,
  layout: Layout,
  mode: "groups" | "flow",
): CanvasGroup[] {
  if (mode === "flow")
    return flow.steps.map((s) => ({
      id: `f:${s.id}`,
      stepId: s.id,
      title: s.title,
      description: s.description,
      caseIds: s.caseIds,
    }));
  const column = snapshot.columns.find((c) => c.id === layout.groupBy);
  if (!column)
    return [
      {
        id: "g:all",
        title: "전체 케이스",
        description: "",
        caseIds: snapshot.cases.map((c) => c.id),
      },
    ];
  const groups = new Map<string, CanvasGroup>();
  for (const c of snapshot.cases) {
    const value =
      column.kind === "system"
        ? c[column.field ?? "title"]
        : c.customValues[column.id];
    const values = Array.isArray(value)
      ? value.length
        ? value
        : [null]
      : [value ?? null];
    for (const v of values) {
      const key = JSON.stringify(v);
      const id = `g:${column.id}:${groupKey(key)}`;
      let group = groups.get(key);
      if (!group) {
        const title =
          column.valueType === "tags"
            ? (column.options?.find((o) => o.id === v)?.name ?? "미지정")
            : displayValue(snapshot, c, column) || "미지정";
        group = { id, title, description: "", caseIds: [] };
        groups.set(key, group);
      }
      group.caseIds.push(c.id);
    }
  }
  return [...groups.values()];
}
function estimatedHeight(snapshot: Snapshot, item: CaseDraft) {
  let height = 125 + Math.ceil(item.title.length / 28) * 26;
  for (const column of snapshot.columns.filter((c) => c.kind === "custom")) {
    const text = displayValue(snapshot, item, column);
    height +=
      48 +
      text
        .split("\n")
        .reduce((n, line) => n + Math.max(1, Math.ceil(line.length / 32)), 0) *
        25;
  }
  if (item.relatedFrameIds.length || item.screenIds.length) height += 80;
  return height;
}
export function geometry(
  groups: CanvasGroup[],
  snapshot: Snapshot,
  layout: Layout,
  heights: Map<string, number>,
  arrange = false,
): Geometry[] {
  const positions = new Map(layout.positions.map((p) => [p.id, p]));
  const cases = new Map(snapshot.cases.map((c) => [c.id, c]));
  const result: Geometry[] = [];
  let groupX = 0;
  for (const group of groups) {
    const columns = Math.max(
      1,
      Math.min(10, Math.ceil(Math.sqrt(group.caseIds.length))),
    );
    const bottoms = Array<number>(columns).fill(
      (heights.get(`header:${group.id}`) ??
        64 + Math.ceil(group.description.length / 60) * 24) + GAP,
    );
    const children: Geometry[] = [];
    for (const id of group.caseIds) {
      const item = cases.get(id);
      if (!item) continue;
      const nodeId = `${group.id}:case:${id}`;
      const column = bottoms.indexOf(Math.min(...bottoms));
      const saved = !arrange ? positions.get(nodeId) : undefined;
      const x = Math.max(GAP, saved?.x ?? GAP + column * (CARD_WIDTH + GAP));
      let y = Math.max(
        (heights.get(`header:${group.id}`) ?? 64) + GAP,
        saved?.y ?? bottoms[column],
      );
      const height = heights.get(nodeId) ?? estimatedHeight(snapshot, item);
      // Only push down overlapping cards in this group after a content resize.
      for (const prior of children)
        if (
          x < prior.x + prior.width + GAP &&
          x + CARD_WIDTH + GAP > prior.x &&
          y < prior.y + prior.height + GAP &&
          y + height + GAP > prior.y
        )
          y = prior.y + prior.height + GAP;
      children.push({
        id: nodeId,
        parentId: group.id,
        x,
        y,
        width: CARD_WIDTH,
        height,
      });
      bottoms[column] = y + height + GAP;
    }
    const width = Math.max(
      CARD_WIDTH + GAP * 2,
      ...children.map((c) => c.x + c.width + GAP),
    );
    const height = Math.max(160, ...children.map((c) => c.y + c.height + GAP));
    const saved = !arrange ? positions.get(group.id) : undefined;
    result.push(
      { id: group.id, x: saved?.x ?? groupX, y: saved?.y ?? 0, width, height },
      ...children,
    );
    groupX += width + 100;
  }
  return result;
}
export async function autoLayout(
  groups: CanvasGroup[],
  snapshot: Snapshot,
  flow: Flow,
  layout: Layout,
  heights: Map<string, number>,
  mode: "groups" | "flow",
): Promise<Layout> {
  const nodes = geometry(groups, snapshot, layout, heights, true);
  const roots = nodes.filter((n) => !n.parentId);
  if (mode === "flow" && roots.length) {
    const elk = new ELK();
    const graph = await elk.layout({
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "100",
        "elk.layered.spacing.nodeNodeBetweenLayers": "180",
      },
      children: roots.map((n) => ({
        id: n.id,
        width: n.width,
        height: n.height,
      })),
      edges: flow.edges.map((e) => ({
        id: e.id,
        sources: [`f:${e.from}`],
        targets: [`f:${e.to}`],
      })),
    });
    for (const n of graph.children ?? []) {
      const target = roots.find((r) => r.id === n.id);
      if (target) {
        target.x = n.x ?? 0;
        target.y = n.y ?? 0;
      }
    }
  } else {
    let x = 0;
    let y = 0;
    let rowHeight = 0;
    roots.forEach((n, i) => {
      if (i && i % 2 === 0) {
        x = 0;
        y += rowHeight + 100;
        rowHeight = 0;
      }
      n.x = x;
      n.y = y;
      x += n.width + 100;
      rowHeight = Math.max(rowHeight, n.height);
    });
  }
  const changed = new Set(nodes.map((n) => n.id));
  return {
    ...layout,
    positions: [
      ...layout.positions.filter((p) => !changed.has(p.id)),
      ...nodes.map(({ id, x, y }) => ({ id, x, y })),
    ],
  };
}
