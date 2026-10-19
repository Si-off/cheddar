import {
  type ExportErrorCode,
  type FrameSelection,
  isToken,
  isUiToMainMessage,
  MAX_FRAME_DATA_BYTES,
  MAX_IMAGE_BYTES,
  MAX_THUMBNAIL_BYTES,
  type MainToUiMessage,
  type SelectedFrame,
  type UiToMainMessage,
} from "../protocol/messages";
import {
  buildScreenDocument,
  linkTargets,
  type SourceNode,
} from "./screen-document";

declare const __WEB_BASE_URL__: string;
const AUTH_KEY = "cheddar.pluginToken";

figma.showUI(__html__, { width: 360, height: 560, themeColors: true });
type Session = {
  id: string;
  fileKey: string;
  page: PageNode;
  frames: SelectedFrame[];
  changed: boolean;
  onChange: () => void;
};
let selectionVersion = 0;
let session: Session | undefined;
function send(message: MainToUiMessage) {
  figma.ui.postMessage(message);
}
function metadata(node: FrameNode): SelectedFrame {
  return {
    nodeId: node.id,
    name: node.name,
    width: node.width,
    height: node.height,
  };
}
function selection(): FrameSelection {
  const nodes = figma.currentPage.selection;
  const collected = new Map<string, FrameNode>();
  let unsupportedCount = 0;
  let sectionCount = 0;
  let emptySectionCount = 0;
  for (const node of nodes) {
    if (node.type === "FRAME") {
      collected.set(node.id, node);
    } else if (node.type === "SECTION") {
      sectionCount += 1;
      let found = false;
      const pending: SceneNode[] = [...node.children].reverse();
      while (pending.length) {
        const child = pending.pop();
        if (!child) continue;
        if (child.type === "FRAME") {
          found = true;
          collected.set(child.id, child);
          // A screen's nested layout frames belong to that screen's export.
        } else if ("children" in child) {
          for (let index = child.children.length - 1; index >= 0; index -= 1)
            pending.push(child.children[index]);
        }
      }
      if (!found) emptySectionCount += 1;
    } else {
      unsupportedCount += 1;
    }
  }
  // Selection order may place a descendant before its selected ancestor.
  const selected = [...collected.values()].filter((node) => {
    let parent = node.parent;
    while (parent) {
      if (collected.has(parent.id)) return false;
      parent = parent.parent;
    }
    return true;
  });
  const supported = selected.filter(
    (node) =>
      node.name.length > 0 &&
      node.name.length <= 255 &&
      Number.isFinite(node.width) &&
      node.width >= 0.01 &&
      Number.isFinite(node.height) &&
      node.height >= 0.01,
  );
  return {
    version: selectionVersion,
    fileKey: figma.fileKey ?? null,
    frames: supported.map(metadata),
    unsupportedCount: unsupportedCount + selected.length - supported.length,
    sectionCount,
    emptySectionCount,
  };
}
function publishSelection() {
  selectionVersion += 1;
  send({ type: "selection-changed", selection: selection() });
}
let observedPage = figma.currentPage;
observedPage.on("nodechange", publishSelection);
figma.on("currentpagechange", () => {
  if (!observedPage.removed) observedPage.off("nodechange", publishSelection);
  observedPage = figma.currentPage;
  observedPage.on("nodechange", publishSelection);
  publishSelection();
});
function release() {
  if (session && !session.page.removed)
    session.page.off("nodechange", session.onChange);
  session = undefined;
}
function active(id: string): Session {
  if (!session || session.id !== id) throw new Error("SESSION_EXPIRED");
  if (session.changed || session.page.removed) throw new Error("FRAME_CHANGED");
  return session;
}
// TextEncoder isn't available in the Figma main sandbox.
function utf8Size(value: string) {
  let bytes = 0;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}
async function handle(
  message: Exclude<
    UiToMainMessage,
    { type: "ui-ready" } | { type: "release-upload" }
  >,
) {
  if (message.type === "open-upload-web") {
    if (!__WEB_BASE_URL__) throw new Error("WEB_UNAVAILABLE");
    figma.openExternal(
      `${__WEB_BASE_URL__}/test-sets/new?upload=${encodeURIComponent(message.uploadId)}`,
    );
    send({ type: "upload-web-opened", requestId: message.requestId });
    return;
  }
  if (message.type === "open-connect-web") {
    if (!__WEB_BASE_URL__) throw new Error("WEB_UNAVAILABLE");
    figma.openExternal(
      `${__WEB_BASE_URL__}/plugin-connect?request=${encodeURIComponent(message.requestToken)}`,
    );
    send({ type: "connect-web-opened", requestId: message.requestId });
    return;
  }
  // 플러그인 iframe은 저장소를 쓸 수 없어 계정 토큰은 main의 clientStorage에 둔다
  if (message.type === "load-auth") {
    const token: unknown = await figma.clientStorage.getAsync(AUTH_KEY);
    send({
      type: "auth-loaded",
      requestId: message.requestId,
      token: isToken(token) ? token : null,
    });
    return;
  }
  if (message.type === "save-auth") {
    if (message.token)
      await figma.clientStorage.setAsync(AUTH_KEY, message.token);
    else await figma.clientStorage.deleteAsync(AUTH_KEY);
    send({ type: "auth-saved", requestId: message.requestId });
    return;
  }
  if (message.type === "thumbnail-frame") {
    const selected = selection();
    const expected = selected.frames.find(
      (frame) => frame.nodeId === message.nodeId,
    );
    if (message.selectionVersion !== selected.version || !expected)
      throw new Error("INVALID_SELECTION");
    const node = await figma.getNodeByIdAsync(message.nodeId);
    if (node?.type !== "FRAME" || node.removed)
      throw new Error("FRAME_CHANGED");
    const image = await node.exportAsync({
      format: "PNG",
      constraint: {
        type: "SCALE",
        value: Math.min(
          1,
          (message.size === "preview" ? 960 : 240) /
            Math.max(node.width, node.height),
        ),
      },
    });
    if (!image.length || image.length > MAX_THUMBNAIL_BYTES)
      throw new Error("IMAGE_TOO_LARGE");
    if (
      selectionVersion !== message.selectionVersion ||
      JSON.stringify(metadata(node)) !== JSON.stringify(expected)
    )
      throw new Error("FRAME_CHANGED");
    send({
      type: "frame-thumbnail",
      requestId: message.requestId,
      selectionVersion: message.selectionVersion,
      nodeId: message.nodeId,
      image,
    });
    return;
  }
  if (message.type === "prepare-upload") {
    const selected = selection();
    if (
      selected.version !== message.selectionVersion ||
      selected.unsupportedCount ||
      selected.emptySectionCount ||
      !selected.frames.length
    )
      throw new Error("INVALID_SELECTION");
    if (!selected.fileKey) throw new Error("FILE_KEY_UNAVAILABLE");
    release();
    const current: Session = {
      id: message.requestId,
      fileKey: selected.fileKey,
      page: figma.currentPage,
      frames: selected.frames,
      changed: false,
      onChange: () => {
        current.changed = true;
      },
    };
    current.page.on("nodechange", current.onChange);
    session = current;
    send({
      type: "upload-prepared",
      requestId: message.requestId,
      sessionId: current.id,
      fileKey: current.fileKey,
      frames: current.frames,
    });
    return;
  }
  const current = active(message.sessionId);
  if (message.type === "validate-upload") {
    send({
      type: "upload-validated",
      requestId: message.requestId,
      sessionId: current.id,
    });
    return;
  }
  const expected = current.frames.find(
    (item) => item.nodeId === message.nodeId,
  );
  if (!expected) throw new Error("INVALID_SELECTION");
  const node = await figma.getNodeByIdAsync(message.nodeId);
  if (
    node?.type !== "FRAME" ||
    node.removed ||
    JSON.stringify(metadata(node)) !== JSON.stringify(expected)
  )
    throw new Error("FRAME_CHANGED");
  const source = node as unknown as SourceNode;
  const external = new Map<string, string>();
  for (const id of linkTargets(source)) {
    const target = await figma.getNodeByIdAsync(id);
    if (target && "name" in target) external.set(id, target.name);
  }
  const data = JSON.stringify(buildScreenDocument(source, external));
  if (utf8Size(data) > MAX_FRAME_DATA_BYTES) throw new Error("DATA_TOO_LARGE");
  const image = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: 1 },
  });
  if (!image.length || image.length > MAX_IMAGE_BYTES)
    throw new Error("IMAGE_TOO_LARGE");
  active(current.id);
  if (JSON.stringify(metadata(node)) !== JSON.stringify(expected))
    throw new Error("FRAME_CHANGED");
  send({
    type: "frame-exported",
    requestId: message.requestId,
    sessionId: current.id,
    frame: expected,
    image,
    data,
  });
}
figma.on("selectionchange", publishSelection);
figma.on("stylechange", () => {
  if (session) session.changed = true;
  publishSelection();
});
figma.on("close", () => {
  if (!observedPage.removed) observedPage.off("nodechange", publishSelection);
  release();
});
figma.ui.onmessage = (message: unknown) => {
  if (!isUiToMainMessage(message)) return;
  if (message.type === "ui-ready") {
    publishSelection();
    return;
  }
  if (message.type === "release-upload") {
    if (session?.id === message.sessionId) release();
    return;
  }
  void handle(message).catch((error: unknown) => {
    const known: ExportErrorCode[] = [
      "INVALID_SELECTION",
      "FILE_KEY_UNAVAILABLE",
      "FRAME_CHANGED",
      "IMAGE_TOO_LARGE",
      "DATA_TOO_LARGE",
      "SESSION_EXPIRED",
      "WEB_UNAVAILABLE",
    ];
    const code =
      error instanceof Error && known.includes(error.message as ExportErrorCode)
        ? (error.message as ExportErrorCode)
        : "EXPORT_FAILED";
    send({ type: "export-error", requestId: message.requestId, code });
  });
};
