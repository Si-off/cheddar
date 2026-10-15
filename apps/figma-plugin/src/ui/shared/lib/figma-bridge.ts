import { create } from "zustand";
import manifest from "../../../../manifest.json";
import {
  type ExportErrorCode,
  type FrameSelection,
  isMainToUiMessage,
  type MainToUiMessage,
  type UiToMainMessage,
} from "../../../protocol/messages";

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
type FigmaConnection = { connected: boolean; selection: FrameSelection | null };
export const useFigmaConnection = create<FigmaConnection>(() => ({
  connected: false,
  selection: null,
}));
type Reply = Exclude<
  MainToUiMessage,
  { type: "selection-changed" } | { type: "export-error" }
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
  window.parent.postMessage({ pluginMessage: message }, "*");
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
    // Figma relays main messages from its editor window, across sandbox frames.
    if (
      event.source !== window.parent &&
      (event.origin !== "https://www.figma.com" ||
        !("pluginId" in data) ||
        data.pluginId !== manifest.id)
    )
      return;
    const message = data.pluginMessage;
    if (message.type === "selection-changed") {
      useFigmaConnection.setState({
        connected: true,
        selection: message.selection,
      });
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
  post({ type: "ui-ready" });
  return () => {
    window.removeEventListener("message", onMessage);
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new FigmaExportError("DISCONNECTED"));
    }
    pending.clear();
    useFigmaConnection.setState({ connected: false, selection: null });
  };
}
