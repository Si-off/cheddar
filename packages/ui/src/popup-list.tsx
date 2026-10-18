import { motion } from "motion/react";
import { motionTokens } from "./utils";

/** Select와 Menu가 함께 쓰는 떠 있는 목록의 틀. 위에서 아래로 미끄러지며 나타난다. */
export const popupFrame =
  "max-h-72 overflow-auto rounded-lg border border-line bg-surface p-1 shadow-popover outline-none transition duration-base ease-emphasized data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0";

export const popupItem =
  "relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-body-sm text-fg outline-none data-disabled:text-fg-faint";

/** 강조된 항목 뒤의 배경. 같은 layoutId끼리 항목 사이를 미끄러진다. */
export function PopupHighlight({
  active,
  layoutId,
}: {
  active: boolean;
  layoutId: string;
}) {
  if (!active) return null;
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden
      className="absolute inset-0 rounded-md bg-subtle"
      transition={{
        duration: motionTokens.fast,
        ease: motionTokens.emphasized,
      }}
    />
  );
}
