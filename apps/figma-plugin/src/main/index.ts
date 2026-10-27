import type {
  FrameNode as RestFrameNode,
  SubcanvasNode,
} from "@figma/rest-api-spec";
import {
  type ExportErrorCode,
  type FrameAnnotation,
  type FrameSelection,
  type FrameSource,
  isResourceId,
  isToken,
  isUiToMainMessage,
  MAX_IMAGE_BYTES,
  MAX_THUMBNAIL_BYTES,
  type MainToUiMessage,
  PROTOCOL_VERSION,
  type SelectedFrame,
  type UiToMainMessage,
} from "../protocol/messages";

declare const __WEB_BASE_URL__: string;
/** 원격 UI 빌드에서만 값이 있다 */
declare const __PLUGIN_UI_ORIGIN__: string;
const AUTH_KEY = "cheddar.pluginToken";
const PROJECT_KEY = "cheddar.lastProjectId";

// 원격 UI 빌드의 __html__은 원격 주소로 이동하는 짧은 문서다
figma.showUI(__html__, { width: 360, height: 560, themeColors: true });
/** 업로드 한 번에서 올릴 프레임 목록. 문서를 지켜보지 않고, 프레임마다 읽는 순간의 모습을 올린다. */
type Session = {
  id: string;
  frames: SelectedFrame[];
};
/** 읽는 도중 프레임이 바뀌면 조용히 다시 읽는 횟수 */
const SNAPSHOT_ATTEMPTS = 3;
/** 이미지가 너무 크면 이 배율들로 차례로 다시 그린다 */
const EXPORT_SCALES = [1, 0.5, 0.25];
/** 사용자에게 띄우지 않는 기록. Figma 개발 콘솔에서 본다. */
function note(message: string, detail?: Record<string, unknown>) {
  console.info(`[cheddar] ${message}`, detail ?? "");
}
let selectionVersion = 0;
let session: Session | undefined;
function send(message: MainToUiMessage) {
  // 원격 UI에는 토큰이 오가므로 그 origin의 문서에만 전달한다
  if (__PLUGIN_UI_ORIGIN__)
    figma.ui.postMessage(message, { origin: __PLUGIN_UI_ORIGIN__ });
  else figma.ui.postMessage(message);
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
  session = undefined;
}
function active(id: string): Session {
  if (!session || session.id !== id) throw new Error("SESSION_EXPIRED");
  return session;
}
/**
 * 화면 문서는 UI가 만든다. main은 노드를 읽어 원본만 넘기고 거르지 않는다.
 * UI가 찾을 수 없는 것만 더한다: 프레임 밖 연결 대상의 이름과 REST 원본에 없는 주석 Markdown.
 * 큰 원본도 내용을 생략하지 않는다. 전체 업로드 크기는 서버에서 검사한다.
 */
async function frameSource(node: FrameNode): Promise<FrameSource> {
  const rest = (await node.exportAsync({ format: "JSON_REST_V1" })) as {
    document: RestFrameNode;
  };
  const document = JSON.stringify(rest.document);
  const inside = new Set<string>();
  const targets = new Set<string>();
  const walk = (item: RestFrameNode | SubcanvasNode) => {
    inside.add(item.id);
    if ("interactions" in item)
      for (const interaction of item.interactions ?? [])
        for (const action of interaction.actions ?? [])
          if ("destinationId" in action && action.destinationId)
            targets.add(action.destinationId);
    if (item.type === "CONNECTOR" && item.connectorEnd.endpointNodeId)
      targets.add(item.connectorEnd.endpointNodeId);
    if ("children" in item) for (const child of item.children) walk(child);
  };
  walk(rest.document);
  const externalNames: Record<string, string> = {};
  for (const id of targets) {
    if (inside.has(id)) continue;
    const target = await figma.getNodeByIdAsync(id);
    if (target && "name" in target) externalNames[id] = target.name;
  }
  const annotations: Record<string, FrameAnnotation[]> = {};
  for (const item of [node, ...node.findAll((n) => "annotations" in n)])
    if ("annotations" in item && item.annotations.length)
      annotations[item.id] = [...item.annotations];
  return { document, annotations, externalNames };
}
const sameSource = (a: FrameSource, b: FrameSource) =>
  a.document === b.document &&
  JSON.stringify([a.annotations, a.externalNames]) ===
    JSON.stringify([b.annotations, b.externalNames]);
async function exportImage(node: FrameNode) {
  for (const scale of EXPORT_SCALES) {
    const image = await node.exportAsync({
      format: "PNG",
      constraint: { type: "SCALE", value: scale },
    });
    if (image.length && image.length <= MAX_IMAGE_BYTES) {
      if (scale < 1)
        note("이미지를 줄여서 올립니다", { frame: node.name, scale });
      return image;
    }
  }
  throw new Error("IMAGE_TOO_LARGE");
}
/**
 * 프레임 하나를 읽는 순간의 모습. 이미지를 그리는 사이 프레임이 바뀌었으면 다시 읽고,
 * 그래도 계속 바뀌면 마지막으로 읽은 모습을 쓴다.
 */
async function snapshot(node: FrameNode) {
  let source = await frameSource(node);
  let image = await exportImage(node);
  for (let attempt = 1; attempt < SNAPSHOT_ATTEMPTS; attempt += 1) {
    const after = await frameSource(node);
    if (sameSource(after, source)) break;
    note("읽는 사이 프레임이 바뀌어 다시 읽습니다", { frame: node.name });
    source = after;
    image = await exportImage(node);
  }
  return { source, image };
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
      `${__WEB_BASE_URL__}/test-sets/new?upload=${encodeURIComponent(message.uploadId)}&project=${encodeURIComponent(message.projectId)}`,
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
  if (message.type === "open-home-web") {
    if (!__WEB_BASE_URL__) throw new Error("WEB_UNAVAILABLE");
    figma.openExternal(`${__WEB_BASE_URL__}/test-sets`);
    send({ type: "home-web-opened", requestId: message.requestId });
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
  // 지난번 고른 프로젝트를 다음 업로드의 기본값으로 쓴다
  if (message.type === "load-project") {
    const projectId: unknown = await figma.clientStorage.getAsync(PROJECT_KEY);
    send({
      type: "project-loaded",
      requestId: message.requestId,
      projectId: isResourceId(projectId) ? projectId : null,
    });
    return;
  }
  if (message.type === "save-project") {
    if (message.projectId)
      await figma.clientStorage.setAsync(PROJECT_KEY, message.projectId);
    else await figma.clientStorage.deleteAsync(PROJECT_KEY);
    send({ type: "project-saved", requestId: message.requestId });
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
  // 누른 순간의 선택을 그대로 쓴다. 프레임이 아닌 레이어와 빈 Section은 건너뛰고 프레임만 올린다.
  if (message.type === "prepare-upload") {
    const selected = selection();
    if (!selected.frames.length) throw new Error("INVALID_SELECTION");
    if (selected.unsupportedCount || selected.emptySectionCount)
      note("프레임이 아닌 레이어와 빈 Section은 빼고 올립니다", {
        unsupported: selected.unsupportedCount,
        emptySections: selected.emptySectionCount,
      });
    session = { id: message.requestId, frames: selected.frames };
    send({
      type: "upload-prepared",
      requestId: message.requestId,
      sessionId: session.id,
      fileKey: selected.fileKey,
      frames: session.frames,
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
  // 지워진 프레임만 빼고 나머지는 올린다. 이름과 크기가 바뀌었으면 지금 모습으로 올린다.
  if (node?.type !== "FRAME" || node.removed) {
    note("업로드 중 지워진 프레임은 뺍니다", { nodeId: message.nodeId });
    throw new Error("FRAME_REMOVED");
  }
  const { source, image } = await snapshot(node);
  send({
    type: "frame-exported",
    requestId: message.requestId,
    sessionId: current.id,
    // 지금 모습으로 올리되 메시지 계약(이름 1~255자)에 맞춘다
    frame: {
      ...metadata(node),
      name: (node.name || expected.name).slice(0, 255),
    },
    image,
    source,
  });
}
figma.on("selectionchange", publishSelection);
figma.on("stylechange", publishSelection);
figma.on("close", () => {
  if (!observedPage.removed) observedPage.off("nodechange", publishSelection);
  release();
});
figma.ui.onmessage = (message: unknown) => {
  if (!isUiToMainMessage(message)) return;
  if (message.type === "ui-ready") {
    send({ type: "main-ready", protocolVersion: PROTOCOL_VERSION });
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
      "FRAME_REMOVED",
      "IMAGE_TOO_LARGE",
      "SESSION_EXPIRED",
      "WEB_UNAVAILABLE",
    ];
    const code =
      error instanceof Error && known.includes(error.message as ExportErrorCode)
        ? (error.message as ExportErrorCode)
        : "EXPORT_FAILED";
    if (code === "EXPORT_FAILED")
      note("프레임을 읽지 못했습니다", { error: String(error) });
    send({ type: "export-error", requestId: message.requestId, code });
  });
};
