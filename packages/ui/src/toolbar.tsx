import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "./icon";
import { Menu } from "./menu";
import { cn } from "./utils";

/** 테두리 있는 도구 상자 한 줄. 그룹은 ToolbarSeparator로 나눈다. */
export function Toolbar({
  "aria-label": ariaLabel,
  className,
  children,
}: {
  "aria-label": string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-lg border border-line bg-surface p-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarSeparator() {
  return <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line" />;
}

/** 지금 열린 도구 메뉴. 셀 도구는 포털로 도구 상자에 들어오므로 React 컨텍스트 대신 모듈에 둔다. */
let openMenu: {
  id: string;
  toolbar: Element | null;
  close: () => void;
} | null = null;

/**
 * 아이콘으로 여는 도구 메뉴. 아이콘에 글자가 없으므로 메뉴 맨 위에 그룹 이름을 보여준다.
 * 스프레드시트 메뉴 막대처럼, 한 메뉴가 열린 동안 같은 도구 상자의 다른 아이콘에 포인터를 올리면 그 메뉴로 바뀐다.
 * 항목은 Menu.Item(shortcut 포함)이나 Menu.CheckboxItem을 넣는다.
 */
export function ToolbarMenu({
  icon,
  label,
  disabled,
  children,
}: {
  icon: LucideIcon;
  label: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  // 메뉴끼리 옮겨 갈 때는 닫히는 메뉴와 열리는 메뉴가 겹쳐 글자가 깜빡이지 않게 움직임 없이 바꾼다
  const [instant, setInstant] = useState(false);
  const change = (next: boolean, switching = false) => {
    setOpen(next);
    if (next) {
      setInstant(switching);
      if (openMenu && openMenu.id !== id) openMenu.close();
      openMenu = {
        id,
        toolbar: trigger.current?.closest("[role=toolbar]") ?? null,
        close: () => {
          setInstant(true);
          setOpen(false);
        },
      };
    } else if (openMenu?.id === id) openMenu = null;
  };
  useEffect(
    () => () => {
      if (openMenu?.id === id) openMenu = null;
    },
    [id],
  );
  return (
    // 다른 아이콘에 포인터가 닿아야 하므로 바깥을 막지 않는다
    <BaseMenu.Root
      open={open}
      onOpenChange={(next) => change(next)}
      modal={false}
    >
      <BaseMenu.Trigger
        ref={trigger}
        aria-label={label}
        disabled={disabled}
        onPointerEnter={(event) => {
          // 터치는 탭 직전에도 진입 이벤트가 오므로 실제로 올려 둘 수 있는 포인터만 전환한다
          if (
            event.pointerType === "touch" ||
            disabled ||
            !openMenu ||
            openMenu.id === id ||
            openMenu.toolbar !== trigger.current?.closest("[role=toolbar]")
          )
            return;
          change(true, true);
        }}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg disabled:opacity-50 data-popup-open:bg-subtle data-popup-open:text-fg"
      >
        <Icon icon={icon} />
      </BaseMenu.Trigger>
      <Menu.Popup fit className={cn("min-w-56", instant && "transition-none")}>
        <Menu.Group>
          <Menu.GroupLabel>{label}</Menu.GroupLabel>
          {children}
        </Menu.Group>
      </Menu.Popup>
    </BaseMenu.Root>
  );
}
