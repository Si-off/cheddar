figma.showUI(__html__, { width: 380, height: 640, themeColors: false });
const prototypeFrames = new Set([
  "browse",
  "product",
  "cart",
  "checkout",
  "complete",
]);
figma.ui.onmessage = (message: { type?: string; frames?: unknown }) => {
  if (message.type !== "prototype-open-web" || !Array.isArray(message.frames))
    return;
  const selected = message.frames.filter(
    (id): id is string => typeof id === "string" && prototypeFrames.has(id),
  );
  if (!selected.length) return;
  figma.openExternal(
    `http://127.0.0.1:5178/design-prototype.html?from=figma&frames=${selected.join(",")}`,
  );
};
