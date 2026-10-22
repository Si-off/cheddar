/**
 * main과 UI 사이 메시지 계약의 버전. UI가 main의 새 기능을 쓰기 시작하면 올린다.
 * 원격 UI는 main보다 먼저 바뀔 수 있으므로 main은 이전 UI의 메시지를 계속 받아야 하고,
 * UI는 main의 버전이 이 값보다 낮으면 업로드를 막는다.
 */
export const PROTOCOL_VERSION = 2;
export const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
export const isResourceId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

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
  sectionCount: number;
  emptySectionCount: number;
};
export type ExportErrorCode =
  | "INVALID_SELECTION"
  /** 업로드 중 지워진 프레임. 그 프레임만 빼고 나머지를 올린다. */
  | "FRAME_REMOVED"
  | "FILE_KEY_UNAVAILABLE"
  | "FRAME_CHANGED"
  | "EXPORT_FAILED"
  | "IMAGE_TOO_LARGE"
  | "DATA_TOO_LARGE"
  | "SESSION_EXPIRED"
  | "WEB_UNAVAILABLE";

export type UiToMainMessage =
  | { type: "ui-ready" }
  | {
      type: "thumbnail-frame";
      requestId: string;
      selectionVersion: number;
      nodeId: string;
      size: "thumbnail" | "preview";
    }
  | {
      type: "open-upload-web";
      requestId: string;
      uploadId: string;
      projectId: string;
    }
  | { type: "open-connect-web"; requestId: string; requestToken: string }
  | { type: "open-home-web"; requestId: string }
  | { type: "load-auth"; requestId: string }
  | { type: "save-auth"; requestId: string; token: string | null }
  | { type: "load-project"; requestId: string }
  | { type: "save-project"; requestId: string; projectId: string | null }
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
  | { type: "main-ready"; protocolVersion: number }
  | { type: "selection-changed"; selection: FrameSelection }
  | {
      type: "frame-thumbnail";
      requestId: string;
      selectionVersion: number;
      nodeId: string;
      image: Uint8Array;
    }
  | { type: "upload-web-opened"; requestId: string }
  | { type: "connect-web-opened"; requestId: string }
  | { type: "home-web-opened"; requestId: string }
  | { type: "auth-loaded"; requestId: string; token: string | null }
  | { type: "auth-saved"; requestId: string }
  | { type: "project-loaded"; requestId: string; projectId: string | null }
  | { type: "project-saved"; requestId: string }
  | {
      type: "upload-prepared";
      requestId: string;
      sessionId: string;
      /** 개인 플러그인 API가 없으면 없다. 업로드에는 쓰지 않는다. */
      fileKey: string | null;
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

// 플러그인 연결 요청 토큰과 계정 토큰은 base64url 32바이트(43자)다
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
export const isToken = (value: unknown): value is string =>
  typeof value === "string" && TOKEN.test(value);

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
  if (value.type === "open-upload-web")
    return isResourceId(value.uploadId) && isResourceId(value.projectId);
  if (value.type === "open-connect-web") return isToken(value.requestToken);
  if (value.type === "open-home-web") return true;
  if (value.type === "load-auth") return true;
  if (value.type === "save-auth")
    return value.token === null || isToken(value.token);
  if (value.type === "load-project") return true;
  if (value.type === "save-project")
    return value.projectId === null || isResourceId(value.projectId);
  if (value.type === "thumbnail-frame")
    return (
      Number.isSafeInteger(value.selectionVersion) &&
      Number(value.selectionVersion) >= 0 &&
      text(value.nodeId, 200) &&
      ["thumbnail", "preview"].includes(String(value.size))
    );
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
  if (value.type === "main-ready")
    return (
      Number.isSafeInteger(value.protocolVersion) &&
      Number(value.protocolVersion) >= 1
    );
  if (value.type === "selection-changed") {
    const selected = value.selection;
    return (
      object(selected) &&
      Number.isSafeInteger(selected.version) &&
      Number(selected.version) >= 0 &&
      (selected.fileKey === null || text(selected.fileKey, 200)) &&
      frames(selected.frames) &&
      Number.isSafeInteger(selected.unsupportedCount) &&
      Number(selected.unsupportedCount) >= 0 &&
      Number.isSafeInteger(selected.sectionCount) &&
      Number(selected.sectionCount) >= 0 &&
      Number.isSafeInteger(selected.emptySectionCount) &&
      Number(selected.emptySectionCount) >= 0 &&
      Number(selected.emptySectionCount) <= Number(selected.sectionCount)
    );
  }
  if (!text(value.requestId, 100)) return false;
  if (value.type === "export-error")
    return [
      "INVALID_SELECTION",
      "FRAME_REMOVED",
      "FILE_KEY_UNAVAILABLE",
      "FRAME_CHANGED",
      "EXPORT_FAILED",
      "IMAGE_TOO_LARGE",
      "DATA_TOO_LARGE",
      "SESSION_EXPIRED",
      "WEB_UNAVAILABLE",
    ].includes(String(value.code));
  if (
    value.type === "upload-web-opened" ||
    value.type === "connect-web-opened" ||
    value.type === "home-web-opened" ||
    value.type === "auth-saved" ||
    value.type === "project-saved"
  )
    return true;
  if (value.type === "auth-loaded")
    return value.token === null || isToken(value.token);
  if (value.type === "project-loaded")
    return value.projectId === null || isResourceId(value.projectId);
  if (value.type === "frame-thumbnail")
    return (
      Number.isSafeInteger(value.selectionVersion) &&
      Number(value.selectionVersion) >= 0 &&
      text(value.nodeId, 200) &&
      value.image instanceof Uint8Array &&
      value.image.length > 0 &&
      value.image.length <= MAX_THUMBNAIL_BYTES
    );
  if (!text(value.sessionId, 100)) return false;
  if (value.type === "upload-prepared")
    return (
      (value.fileKey === null || text(value.fileKey, 200)) &&
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
