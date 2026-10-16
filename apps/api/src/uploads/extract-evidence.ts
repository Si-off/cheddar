import { randomUUID } from "node:crypto";
import type {
  EvidenceItemDto,
  EvidenceRegionDto,
} from "../contracts/evidence.dto";

type Node = {
  id?: string;
  type?: string;
  name?: string;
  characters?: string;
  visible?: boolean;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  children?: Node[];
};
export function extractEvidence(
  raw: unknown,
  frameId: string,
): EvidenceItemDto[] {
  const envelope = raw as { document?: { document?: Node } & Node } & Node;
  const root = envelope?.document?.document ?? envelope?.document ?? envelope;
  if (!root || typeof root.id !== "string" || typeof root.type !== "string")
    throw new Error("Unsupported frame document");
  const bounds = root.absoluteBoundingBox;
  function region(node: Node): EvidenceRegionDto | undefined {
    const box = node.absoluteBoundingBox;
    if (
      !bounds ||
      !box ||
      ![
        box.x,
        box.y,
        box.width,
        box.height,
        bounds.x,
        bounds.y,
        bounds.width,
        bounds.height,
      ].every(Number.isFinite) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      return;
    const x = Math.max(0, (box.x - bounds.x) / bounds.width),
      y = Math.max(0, (box.y - bounds.y) / bounds.height);
    const right = Math.min(1, (box.x + box.width - bounds.x) / bounds.width),
      bottom = Math.min(1, (box.y + box.height - bounds.y) / bounds.height);
    if (right <= x || bottom <= y) return;
    return { x, y, width: right - x, height: bottom - y };
  }
  const items: EvidenceItemDto[] = [];
  const source = {
    id: randomUUID(),
    kind: "screen" as const,
    title: root.name || "화면",
    text: "",
    frameId,
    nodeId: root.id,
    region: region(root),
  };
  items.push(source);
  const stack: { node: Node; parent: string; depth: number }[] = (
    root.children ?? []
  ).map((node) => ({ node, parent: source.id, depth: 1 }));
  let visited = 0;
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    if (++visited > 100000) throw new Error("Too many source nodes");
    const { node, depth } = entry;
    if (node.visible === false) continue;
    let parent = entry.parent;
    const box = node.absoluteBoundingBox;
    // Geometric candidates remain editable; names never establish screen semantics.
    if (
      node.type === "FRAME" &&
      box &&
      box.width >= 200 &&
      box.height >= 200 &&
      depth <= 3 &&
      box.width / box.height >= 0.3 &&
      box.width / box.height <= 3
    ) {
      const item: EvidenceItemDto = {
        id: randomUUID(),
        kind: "screen",
        title: node.name || "화면",
        text: "",
        frameId,
        nodeId: node.id,
        parentId: parent,
        region: region(node),
      };
      items.push(item);
      parent = item.id;
    }
    if (node.type === "TEXT" && node.characters?.trim()) {
      const text = node.characters;
      if (text.length > 20000) throw new Error("Source text too long");
      items.push({
        id: randomUUID(),
        kind: "requirement",
        title: text.split(/\r?\n/)[0].slice(0, 255),
        text,
        frameId,
        nodeId: node.id,
        parentId: parent,
        region: region(node),
      });
    }
    for (const child of [...(node.children ?? [])].reverse())
      stack.push({ node: child, parent, depth: depth + 1 });
    if (items.length > 10000) throw new Error("Too many source items");
  }
  return items;
}
