import { Popover as BasePopover } from "@base-ui/react/popover";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./utils";

interface PopoverPopupProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  /** 트리거 대신 이 요소 아래에 띄운다. 메뉴에서 연 패널을 대상 옆에 둘 때 쓴다. */
  anchor?: ComponentProps<typeof BasePopover.Positioner>["anchor"];
  /** 화면 읽기 프로그램이 읽는 이름 */
  "aria-label"?: string;
  className?: string;
}

/** 트리거 아래에 뜨는 작은 패널. Select·Menu와 같은 틀과 움직임을 쓴다. */
function PopoverPopup({
  children,
  align = "start",
  anchor,
  "aria-label": ariaLabel,
  className,
}: PopoverPopupProps) {
  return (
    <BasePopover.Portal>
      <BasePopover.Positioner
        sideOffset={4}
        align={align}
        anchor={anchor}
        className="z-50"
      >
        <BasePopover.Popup
          aria-label={ariaLabel}
          className={cn(
            "flex max-h-96 flex-col rounded-lg border border-line bg-surface shadow-popover outline-none transition duration-base ease-emphasized data-ending-style:-translate-y-1 data-ending-style:opacity-0 data-starting-style:-translate-y-1 data-starting-style:opacity-0",
            className,
          )}
        >
          {children}
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  );
}

/**
 * 고르는 내용이 목록 하나로 끝나지 않을 때(검색, 여러 개 선택, 완료 버튼) 쓰는 떠 있는 패널.
 * <Popover.Root><Popover.Trigger render={...} /><Popover.Popup>…</Popover.Popup></Popover.Root>
 */
export const Popover = {
  Root: BasePopover.Root,
  Trigger: BasePopover.Trigger,
  Popup: PopoverPopup,
  Close: BasePopover.Close,
};
