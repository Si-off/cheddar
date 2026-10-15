import { create } from "zustand";
import {
  isMainToUiMessage,
  type UiToMainMessage,
} from "../../../protocol/messages";

type FigmaConnection = { connected: boolean };
export const useFigmaConnection = create<FigmaConnection>(() => ({
  connected: false,
}));

export function connectToFigma() {
  if (window.parent === window) return;

  const onMessage = (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (typeof data !== "object" || data === null || !("pluginMessage" in data))
      return;
    if (isMainToUiMessage(data.pluginMessage))
      useFigmaConnection.setState({ connected: true });
  };
  window.addEventListener("message", onMessage);
  window.parent.postMessage(
    { pluginMessage: { type: "ui-ready" } satisfies UiToMainMessage },
    "*",
  );
  return () => {
    window.removeEventListener("message", onMessage);
    useFigmaConnection.setState({ connected: false });
  };
}
