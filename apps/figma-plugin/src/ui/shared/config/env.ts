const pluginUiHosted = Boolean(import.meta.env.VITE_PLUGIN_UI_URL);

export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || "http://localhost:3101",
  /** UI를 번들 대신 원격 페이지로 띄우는지. main 빌드와 같은 값을 쓴다 */
  pluginUiHosted,
  /** 원격 UI 시험 중 메시지 모양을 콘솔에 남긴다 */
  pluginUiDebug: pluginUiHosted && import.meta.env.DEV,
} as const;
