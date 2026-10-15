import { isUiToMainMessage, type MainToUiMessage } from "../protocol/messages";

figma.showUI(__html__, { width: 360, height: 420, themeColors: true });

figma.ui.onmessage = (message: unknown) => {
  if (!isUiToMainMessage(message)) return;
  figma.ui.postMessage({ type: "plugin-ready" } satisfies MainToUiMessage);
};
