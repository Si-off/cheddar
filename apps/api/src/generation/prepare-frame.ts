type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}

// PNGs carry visual appearance. This table retains every scene node and all text,
// hierarchy, state and interaction data without repeating REST render metadata.
export function prepareFrame(value: unknown) {
  const envelope = record(value);
  const exported = record(envelope?.document) ?? envelope;
  const root = record(exported?.document) ?? exported;
  if (!root || typeof root.type !== "string" || typeof root.id !== "string")
    throw new Error("Unsupported frame document.");
  const strings: string[] = [];
  const indexes = new Map<string, number>();
  function intern(value: unknown): number {
    if (typeof value !== "string") return -1;
    const found = indexes.get(value);
    if (found !== undefined) return found;
    const index = strings.length;
    strings.push(value);
    indexes.set(value, index);
    return index;
  }
  const nodes: [number, number, number, number, number?][] = [];
  const properties: RecordValue[] = [];
  const propertyIndexes = new Map<string, number>();
  const sourceIds = new Map<string, number>();
  const usedComponents = new Set<string>();
  const destinations = new Set<string>();
  function findDestinations(value: unknown) {
    if (Array.isArray(value)) {
      for (const item of value) findDestinations(item);
      return;
    }
    const object = record(value);
    if (!object) return;
    for (const [key, item] of Object.entries(object)) {
      if (
        (key === "destinationId" || key === "transitionNodeID") &&
        typeof item === "string"
      )
        destinations.add(item);
      else if (item && typeof item === "object") findDestinations(item);
    }
  }
  const stack: { node: RecordValue; parent: number }[] = [
    { node: root, parent: -1 },
  ];
  while (stack.length) {
    const entry = stack.pop();
    if (!entry) break;
    const { node, parent } = entry;
    const index = nodes.length;
    if (typeof node.id === "string") sourceIds.set(node.id, index);
    const details: RecordValue = {};
    for (const key of [
      "visible",
      "opacity",
      "description",
      "componentId",
      "componentProperties",
      "componentPropertyDefinitions",
      "componentPropertyReferences",
      "interactions",
      "reactions",
      "transitionNodeID",
      "transitionDuration",
      "transitionEasing",
      "hyperlink",
      "isMask",
      "clipsContent",
      "overflowDirection",
      "layoutMode",
    ]) {
      const item = node[key];
      if (
        item === undefined ||
        item === null ||
        (Array.isArray(item) && !item.length)
      )
        continue;
      if (
        (key === "visible" && item === true) ||
        (key === "opacity" && item === 1)
      )
        continue;
      details[key] = item;
    }
    // Text ranges can contain links even if the node itself does not.
    const overrides = record(node.styleOverrideTable);
    const links = Object.entries(overrides ?? {}).flatMap(([style, value]) => {
      const hyperlink = record(value)?.hyperlink;
      return hyperlink ? [{ style, hyperlink }] : [];
    });
    if (links.length) {
      details.textLinks = links;
      details.characterStyleOverrides = node.characterStyleOverrides;
    }
    if (typeof node.componentId === "string")
      usedComponents.add(node.componentId);
    findDestinations(details);
    const row: [number, number, number, number, number?] = [
      parent,
      intern(node.type),
      intern(node.name),
      intern(node.characters),
    ];
    if (Object.keys(details).length) {
      const encoded = JSON.stringify(details);
      let propertyIndex = propertyIndexes.get(encoded);
      if (propertyIndex === undefined) {
        propertyIndex = properties.length;
        properties.push(details);
        propertyIndexes.set(encoded, propertyIndex);
      }
      row.push(propertyIndex);
    }
    nodes.push(row);
    const children = Array.isArray(node.children) ? node.children : [];
    for (let child = children.length - 1; child >= 0; child--) {
      const next = record(children[child]);
      if (next) stack.push({ node: next, parent: index });
    }
  }
  const components: RecordValue = {};
  const definitions = record(exported?.components);
  const sets = record(exported?.componentSets);
  for (const id of usedComponents) {
    const component = record(definitions?.[id]);
    if (!component) continue;
    const set =
      typeof component.componentSetId === "string"
        ? record(sets?.[component.componentSetId])
        : undefined;
    components[id] = {
      name: component.name,
      description: component.description,
      ...(set ? { set: { name: set.name, description: set.description } } : {}),
    };
  }
  return {
    format: "scene-table-v1",
    legend:
      "Each nodes row is [parentRow, typeString, nameString, textString, optional propertyIndex]. propertyIndex refers to properties. String indexes refer to strings; -1 means absent. Parent -1 is the frame root. All scene nodes and text are retained. PNG supplies appearance and geometry; drawing/style metadata is omitted. prototypeTargets maps referenced Figma node IDs to row indexes within this frame; other targets are external.",
    strings,
    properties,
    nodes,
    components,
    prototypeTargets: Object.fromEntries(
      [...destinations]
        .filter((id) => sourceIds.has(id))
        .map((id) => [id, sourceIds.get(id)]),
    ),
  };
}
