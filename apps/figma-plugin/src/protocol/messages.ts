export type UiToMainMessage = { type: "ui-ready" };
export type MainToUiMessage = { type: "plugin-ready" };

export function isUiToMainMessage(value: unknown): value is UiToMainMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "ui-ready"
  );
}

export function isMainToUiMessage(value: unknown): value is MainToUiMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "plugin-ready"
  );
}
