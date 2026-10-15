export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_FRAME_DATA_BYTES = 5 * 1024 * 1024;

export type SelectedFrame = {
  nodeId: string;
  name: string;
  width: number;
  height: number;
};
export type FrameSelection = {
  version: number;
  fileKey: string | null;
  frames: SelectedFrame[];
  unsupportedCount: number;
};
export type ExportErrorCode =
  | "INVALID_SELECTION"
  | "FILE_KEY_UNAVAILABLE"
  | "FRAME_CHANGED"
  | "EXPORT_FAILED"
  | "IMAGE_TOO_LARGE"
  | "DATA_TOO_LARGE"
  | "SESSION_EXPIRED";

export type UiToMainMessage =
  | { type: "ui-ready" }
  | { type: "prepare-upload"; requestId: string; selectionVersion: number }
  | {
      type: "export-frame";
      requestId: string;
      sessionId: string;
      nodeId: string;
    }
  | { type: "validate-upload"; requestId: string; sessionId: string }
  | { type: "release-upload"; sessionId: string };

export type MainToUiMessage =
  | { type: "selection-changed"; selection: FrameSelection }
  | {
      type: "upload-prepared";
      requestId: string;
      sessionId: string;
      fileKey: string;
      frames: SelectedFrame[];
    }
  | {
      type: "frame-exported";
      requestId: string;
      sessionId: string;
      frame: SelectedFrame;
      image: Uint8Array;
      data: string;
    }
  | { type: "upload-validated"; requestId: string; sessionId: string }
  | { type: "export-error"; requestId: string; code: ExportErrorCode };

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown, max = 255): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0.01;
}
function frame(value: unknown): value is SelectedFrame {
  return (
    object(value) &&
    text(value.nodeId, 200) &&
    text(value.name) &&
    positive(value.width) &&
    positive(value.height)
  );
}
function frames(value: unknown): value is SelectedFrame[] {
  return (
    Array.isArray(value) &&
    value.every(frame) &&
    new Set(value.map((item) => item.nodeId)).size === value.length
  );
}
export function isUiToMainMessage(value: unknown): value is UiToMainMessage {
  if (!object(value)) return false;
  if (value.type === "ui-ready") return true;
  if (value.type === "release-upload") return text(value.sessionId, 100);
  if (!text(value.requestId, 100)) return false;
  if (value.type === "prepare-upload")
    return (
      Number.isSafeInteger(value.selectionVersion) &&
      Number(value.selectionVersion) >= 0
    );
  if (!text(value.sessionId, 100)) return false;
  if (value.type === "validate-upload") return true;
  return value.type === "export-frame" && text(value.nodeId, 200);
}
export function isMainToUiMessage(value: unknown): value is MainToUiMessage {
  if (!object(value)) return false;
  if (value.type === "selection-changed") {
    const selected = value.selection;
    return (
      object(selected) &&
      Number.isSafeInteger(selected.version) &&
      Number(selected.version) >= 0 &&
      (selected.fileKey === null || text(selected.fileKey, 200)) &&
      frames(selected.frames) &&
      Number.isSafeInteger(selected.unsupportedCount) &&
      Number(selected.unsupportedCount) >= 0
    );
  }
  if (!text(value.requestId, 100)) return false;
  if (value.type === "export-error")
    return [
      "INVALID_SELECTION",
      "FILE_KEY_UNAVAILABLE",
      "FRAME_CHANGED",
      "EXPORT_FAILED",
      "IMAGE_TOO_LARGE",
      "DATA_TOO_LARGE",
      "SESSION_EXPIRED",
    ].includes(String(value.code));
  if (!text(value.sessionId, 100)) return false;
  if (value.type === "upload-prepared")
    return (
      text(value.fileKey, 200) &&
      frames(value.frames) &&
      value.frames.length > 0
    );
  if (value.type === "upload-validated") return true;
  return (
    value.type === "frame-exported" &&
    frame(value.frame) &&
    value.image instanceof Uint8Array &&
    value.image.length > 0 &&
    value.image.length <= MAX_IMAGE_BYTES &&
    typeof value.data === "string" &&
    value.data.length > 0 &&
    value.data.length <= MAX_FRAME_DATA_BYTES
  );
}
