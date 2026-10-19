import { Menu as BaseMenu } from "@base-ui/react/menu";
import type { LucideIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  use,
  useId,
} from "react";
import { DrawnCheck, Icon } from "./icon";
import { PopupHighlight, popupFrame, popupItem } from "./popup-list";
import { cn } from "./utils";

const HighlightContext = createContext("");

interface MenuPopupProps {
  children: ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

function MenuPopup({ children, align = "start", className }: MenuPopupProps) {
  const highlightId = useId();
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner sideOffset={4} align={align} className="z-50">
        <BaseMenu.Popup className={cn(popupFrame, "min-w-44", className)}>
          <HighlightContext value={highlightId}>{children}</HighlightContext>
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

interface MenuItemProps
  extends Omit<ComponentProps<typeof BaseMenu.Item>, "render"> {
  icon?: LucideIcon;
  tone?: "default" | "danger";
}

function MenuItem({
  icon,
  tone = "default",
  className,
  children,
  ...rest
}: MenuItemProps) {
  const highlightId = use(HighlightContext);
  return (
    <BaseMenu.Item
      {...rest}
      className={cn(popupItem, tone === "danger" && "text-danger", className)}
      render={(props, state) => (
        <div {...props}>
          <PopupHighlight active={state.highlighted} layoutId={highlightId} />
          <span className="relative flex min-w-0 flex-1 items-center gap-2">
            {icon && (
              <Icon
                icon={icon}
                className={tone === "danger" ? "text-danger" : "text-fg-muted"}
              />
            )}
            {children as ReactNode}
          </span>
        </div>
      )}
    />
  );
}

interface MenuCheckboxItemProps
  extends Omit<
    ComponentProps<typeof BaseMenu.CheckboxItem>,
    "render" | "children"
  > {
  children: ReactNode;
}

/** 여러 개를 고르는 항목. 고르는 동안 메뉴를 닫지 않는다. */
function MenuCheckboxItem({
  className,
  children,
  closeOnClick = false,
  ...rest
}: MenuCheckboxItemProps) {
  const highlightId = use(HighlightContext);
  return (
    <BaseMenu.CheckboxItem
      {...rest}
      closeOnClick={closeOnClick}
      className={cn(popupItem, className)}
      render={(props, state) => (
        <div {...props}>
          <PopupHighlight active={state.highlighted} layoutId={highlightId} />
          <span className="relative flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1">{children}</span>
            <DrawnCheck
              drawn={state.checked}
              size="sm"
              className="text-accent-text"
            />
          </span>
        </div>
      )}
    />
  );
}

function MenuSeparator({ className }: { className?: string }) {
  return (
    <BaseMenu.Separator className={cn("-mx-1 my-1 h-px bg-line", className)} />
  );
}

function MenuGroupLabel({
  className,
  ...rest
}: ComponentProps<typeof BaseMenu.GroupLabel>) {
  return (
    <BaseMenu.GroupLabel
      {...rest}
      className={cn("px-2 py-1 text-overline text-fg-muted", className)}
    />
  );
}

/**
 * 행동 목록 메뉴. 조각으로 조합한다.
 * <Menu.Root><Menu.Trigger render={<IconButton icon={MoreHorizontal} label="작업" />} /><Menu.Popup><Menu.Item>…</Menu.Item></Menu.Popup></Menu.Root>
 */
export const Menu = {
  Root: BaseMenu.Root,
  Trigger: BaseMenu.Trigger,
  Popup: MenuPopup,
  Item: MenuItem,
  CheckboxItem: MenuCheckboxItem,
  Separator: MenuSeparator,
  Group: BaseMenu.Group,
  GroupLabel: MenuGroupLabel,
};
