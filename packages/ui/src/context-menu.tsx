import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import { createContext, type ReactNode, useId } from "react";
import { Menu } from "./menu";
import { popupFrame } from "./popup-list";
import { cn } from "./utils";

const HighlightContext = createContext("");

interface ContextMenuPopupProps {
  children: ReactNode;
  /** 화면 읽기 프로그램이 읽는 이름 */
  "aria-label"?: string;
  className?: string;
}

function ContextMenuPopup({
  children,
  "aria-label": ariaLabel,
  className,
}: ContextMenuPopupProps) {
  const highlightId = useId();
  return (
    <BaseContextMenu.Portal>
      <BaseContextMenu.Positioner className="z-50">
        <BaseContextMenu.Popup
          aria-label={ariaLabel}
          className={cn(popupFrame, "min-w-44", className)}
        >
          <HighlightContext value={highlightId}>{children}</HighlightContext>
        </BaseContextMenu.Popup>
      </BaseContextMenu.Positioner>
    </BaseContextMenu.Portal>
  );
}

/**
 * 오른쪽 클릭으로 여는 메뉴. 항목과 구분선은 Menu와 같다.
 * <ContextMenu.Root><ContextMenu.Trigger render={<div />}>…</ContextMenu.Trigger><ContextMenu.Popup><ContextMenu.Item>…</ContextMenu.Item></ContextMenu.Popup></ContextMenu.Root>
 */
export const ContextMenu = {
  Root: BaseContextMenu.Root,
  Trigger: BaseContextMenu.Trigger,
  Popup: ContextMenuPopup,
  Item: Menu.Item,
  Separator: Menu.Separator,
  Group: BaseContextMenu.Group,
  GroupLabel: Menu.GroupLabel,
};
