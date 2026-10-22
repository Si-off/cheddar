/** 표 편집 단축키. Google 스프레드시트와 같은 키를 쓰고, 표시는 사용자의 OS에 맞춘다. */
export type ShortcutName =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "fillDown"
  | "findReplace"
  | "clear";

const keys: Record<ShortcutName, { mac: string; other: string }> = {
  undo: { mac: "⌘Z", other: "Ctrl+Z" },
  redo: { mac: "⌘Y", other: "Ctrl+Y" },
  cut: { mac: "⌘X", other: "Ctrl+X" },
  copy: { mac: "⌘C", other: "Ctrl+C" },
  paste: { mac: "⌘V", other: "Ctrl+V" },
  fillDown: { mac: "⌘D", other: "Ctrl+D" },
  // ⌘H는 macOS의 창 가리기라서 Sheets도 Mac에서는 Shift를 더한다
  findReplace: { mac: "⇧⌘H", other: "Ctrl+H" },
  clear: { mac: "Delete", other: "Delete" },
};

export const isMac = () => {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  return /mac|iphone|ipad/i.test(
    nav.userAgentData?.platform ?? navigator.platform,
  );
};

export const shortcut = (name: ShortcutName) =>
  isMac() ? keys[name].mac : keys[name].other;
