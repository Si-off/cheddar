import { create } from "zustand";
import manifest from "../../../../manifest.json";
import {
  type ExportErrorCode,
  type FrameSelection,
  isMainToUiMessage,
  isResourceId,
  isToken,
  type MainToUiMessage,
  PROTOCOL_VERSION,
  type UiToMainMessage,
} from "../../../protocol/messages";
import { env } from "../config/env";

const FIGMA_ORIGIN = "https://www.figma.com";
// 토큰 값은 남기지 않도록 메시지 종류와 키 이름만 적는다
export function debugRemoteUi(label: string, detail: Record<string, unknown>) {
  if (!env.pluginUiDebug) return;
  console.info(`[cheddar:bridge] ${label}`, detail);
  // 시험 중 Figma 콘솔을 열지 않아도 개발 서버에서 읽을 수 있게 보낸다
  void fetch("/__cheddar/log", {
    method: "POST",
    body: JSON.stringify({ label, ...detail }),
    keepalive: true,
  }).catch(() => undefined);
}

export class FigmaExportError extends Error {
  constructor(
    public readonly code: ExportErrorCode | "DISCONNECTED" | "TIMEOUT",
  ) {
    super(code);
  }
}
// randomUUID is unavailable in Figma's opaque-origin UI; getRandomValues works.
export function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}
type FigmaConnection = {
  /** main이 응답해 프로토콜 버전을 알려준 뒤 true */
  connected: boolean;
  mainProtocol: number | null;
  selection: FrameSelection | null;
};
export const useFigmaConnection = create<FigmaConnection>(() => ({
  connected: false,
  mainProtocol: null,
  selection: null,
}));
/** 원격 UI가 main보다 먼저 배포돼 main에 필요한 기능이 없는 상태 */
export const isMainOutdated = (connection: FigmaConnection) =>
  connection.mainProtocol !== null &&
  connection.mainProtocol < PROTOCOL_VERSION;
type Reply = Exclude<
  MainToUiMessage,
  | { type: "main-ready" }
  | { type: "selection-changed" }
  | { type: "export-error" }
>;
const pending = new Map<
  string,
  {
    resolve: (message: Reply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
function post(message: UiToMainMessage) {
  debugRemoteUi("send", { type: message.type });
  // 원격 UI는 Figma 편집기 창에, 이 플러그인 ID로만 보낸다
  if (env.pluginUiHosted)
    window.parent.postMessage(
      { pluginMessage: message, pluginId: manifest.id },
      FIGMA_ORIGIN,
    );
  else window.parent.postMessage({ pluginMessage: message }, "*");
}
async function request<T extends Reply["type"]>(
  message: Extract<UiToMainMessage, { requestId: string }>,
  expected: T,
): Promise<Extract<Reply, { type: T }>> {
  if (!useFigmaConnection.getState().connected)
    throw new FigmaExportError("DISCONNECTED");
  const reply = await new Promise<Reply>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(message.requestId);
      reject(new FigmaExportError("TIMEOUT"));
    }, 120_000);
    pending.set(message.requestId, { resolve, reject, timer });
    post(message);
  });
  if (reply.type !== expected) throw new FigmaExportError("DISCONNECTED");
  return reply as Extract<Reply, { type: T }>;
}
export function requestFrameThumbnail(
  selectionVersion: number,
  nodeId: string,
  size: "thumbnail" | "preview" = "thumbnail",
) {
  return request(
    {
      type: "thumbnail-frame",
      requestId: createRequestId(),
      selectionVersion,
      nodeId,
      size,
    },
    "frame-thumbnail",
  );
}
export function openUploadInWeb(uploadId: string, projectId: string) {
  if (!isResourceId(uploadId) || !isResourceId(projectId))
    return Promise.reject(new FigmaExportError("WEB_UNAVAILABLE"));
  return request(
    {
      type: "open-upload-web",
      requestId: createRequestId(),
      uploadId,
      projectId,
    },
    "upload-web-opened",
  );
}
export function openHomeInWeb() {
  return request(
    { type: "open-home-web", requestId: createRequestId() },
    "home-web-opened",
  );
}
export function openConnectInWeb(requestToken: string) {
  if (!isToken(requestToken))
    return Promise.reject(new FigmaExportError("WEB_UNAVAILABLE"));
  return request(
    { type: "open-connect-web", requestId: createRequestId(), requestToken },
    "connect-web-opened",
  );
}
export async function loadAuthToken() {
  return (
    await request(
      { type: "load-auth", requestId: createRequestId() },
      "auth-loaded",
    )
  ).token;
}
export async function saveAuthToken(token: string | null) {
  await request(
    { type: "save-auth", requestId: createRequestId(), token },
    "auth-saved",
  );
}
export async function loadLastProject() {
  return (
    await request(
      { type: "load-project", requestId: createRequestId() },
      "project-loaded",
    )
  ).projectId;
}
export async function saveLastProject(projectId: string | null) {
  await request(
    { type: "save-project", requestId: createRequestId(), projectId },
    "project-saved",
  );
}
export function prepareFrameUpload(selectionVersion: number) {
  return request(
    {
      type: "prepare-upload",
      requestId: createRequestId(),
      selectionVersion,
    },
    "upload-prepared",
  );
}
export function exportSelectedFrame(sessionId: string, nodeId: string) {
  return request(
    { type: "export-frame", requestId: createRequestId(), sessionId, nodeId },
    "frame-exported",
  );
}
export function validateFrameUpload(sessionId: string) {
  return request(
    { type: "validate-upload", requestId: createRequestId(), sessionId },
    "upload-validated",
  );
}
export function releaseFrameUpload(sessionId: string) {
  post({ type: "release-upload", sessionId });
}

// 번들 UI는 Figma가 만든 부모 iframe이나 편집기 창이 보낸다.
// 원격 UI는 아무 사이트나 이 페이지를 iframe으로 띄울 수 있으므로 편집기 창이 이 플러그인 ID로 보낸 것만 믿는다.
function fromMain(event: MessageEvent<unknown>, data: object) {
  const relayed =
    event.origin === FIGMA_ORIGIN &&
    "pluginId" in data &&
    data.pluginId === manifest.id;
  return env.pluginUiHosted
    ? relayed
    : event.source === window.parent || relayed;
}

export function connectToFigma() {
  if (window.parent === window) return;

  const onMessage = (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (
      typeof data !== "object" ||
      data === null ||
      !("pluginMessage" in data) ||
      !isMainToUiMessage(data.pluginMessage)
    )
      return;
    const message = data.pluginMessage;
    if (!fromMain(event, data)) {
      debugRemoteUi("rejected", { type: message.type, origin: event.origin });
      return;
    }
    debugRemoteUi("receive", { type: message.type });
    if (message.type === "main-ready") {
      useFigmaConnection.setState({
        connected: true,
        mainProtocol: message.protocolVersion,
      });
      return;
    }
    if (message.type === "selection-changed") {
      useFigmaConnection.setState({ selection: message.selection });
      return;
    }
    const waiting = pending.get(message.requestId);
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.delete(message.requestId);
    if (message.type === "export-error")
      waiting.reject(new FigmaExportError(message.code));
    else waiting.resolve(message);
  };
  window.addEventListener("message", onMessage);
  const onViolation = (event: SecurityPolicyViolationEvent) =>
    debugRemoteUi("csp violation", {
      directive: event.effectiveDirective,
      blocked: event.blockedURI,
    });
  const onError = (event: ErrorEvent) =>
    debugRemoteUi("error", { message: event.message, source: event.filename });
  const onRejection = (event: PromiseRejectionEvent) =>
    debugRemoteUi("rejection", { reason: String(event.reason) });
  if (env.pluginUiDebug) {
    debugRemoteUi("start", { origin: window.location.origin });
    document.addEventListener("securitypolicyviolation", onViolation);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
  }
  post({ type: "ui-ready" });
  return () => {
    window.removeEventListener("message", onMessage);
    if (env.pluginUiDebug) {
      document.removeEventListener("securitypolicyviolation", onViolation);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    }
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new FigmaExportError("DISCONNECTED"));
    }
    pending.clear();
    useFigmaConnection.setState({
      connected: false,
      mainProtocol: null,
      selection: null,
    });
  };
}
