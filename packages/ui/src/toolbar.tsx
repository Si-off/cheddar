import { Menu as BaseMenu } from "@base-ui/react/menu";
import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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

/**
 * 아이콘과 ▾로 여는 도구 메뉴. 아이콘에 글자가 없으므로 메뉴 맨 위에 그룹 이름을 보여준다.
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
  return (
    <BaseMenu.Root>
      <BaseMenu.Trigger
        aria-label={label}
        disabled={disabled}
        className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-md border-0 bg-transparent pr-1 pl-1.5 text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg disabled:opacity-50 data-popup-open:bg-subtle data-popup-open:text-fg"
      >
        <Icon icon={icon} />
        <Icon icon={ChevronDown} size="sm" />
      </BaseMenu.Trigger>
      <Menu.Popup fit className="min-w-56">
        <Menu.Group>
          <Menu.GroupLabel>{label}</Menu.GroupLabel>
          {children}
        </Menu.Group>
      </Menu.Popup>
    </BaseMenu.Root>
  );
}
