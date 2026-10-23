import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { useRender } from "@base-ui/react/use-render";
import type { LucideIcon } from "lucide-react";
import {
  type ComponentProps,
  createContext,
  type ReactElement,
  type ReactNode,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

type TabsVariant = "line" | "pill";
const VariantContext = createContext<TabsVariant>("line");

interface TabsListProps
  extends Omit<ComponentProps<typeof BaseTabs.List>, "children"> {
  variant?: TabsVariant;
  children: ReactNode;
}

/** 탭 목록. 선택 표시(밑줄 또는 배경)는 새 탭으로 미끄러진다. */
function TabsList({
  variant = "line",
  className,
  children,
  ...rest
}: TabsListProps) {
  return (
    <VariantContext value={variant}>
      <BaseTabs.List
        {...rest}
        className={cn(
          "relative flex items-center",
          variant === "line"
            ? "gap-0 border-b border-line"
            : "gap-0.5 rounded-md bg-subtle p-0.5",
          className,
        )}
      >
        {children}
        <BaseTabs.Indicator
          className={cn(
            "absolute transition-all duration-base ease-emphasized",
            variant === "line"
              ? "bottom-0 h-0.5 bg-accent"
              : "top-0.5 bottom-0.5 z-0 rounded-sm bg-surface shadow-raised",
          )}
          style={{
            left: "var(--active-tab-left)",
            width: "var(--active-tab-width)",
          }}
        />
      </BaseTabs.List>
    </VariantContext>
  );
}

interface TabsTabProps extends ComponentProps<typeof BaseTabs.Tab> {
  icon?: LucideIcon;
  /** 개수 표시 */
  count?: number;
  /** 개수를 주의 색으로 */
  attention?: boolean;
}

function TabsTab({
  icon,
  count,
  attention,
  className,
  children,
  ...rest
}: TabsTabProps) {
  const variant = use(VariantContext);
  return (
    <BaseTabs.Tab
      {...rest}
      className={cn(
        "relative z-10 inline-flex items-center gap-1.5 whitespace-nowrap text-label text-fg-muted transition-colors duration-fast hover:text-fg data-selected:text-fg",
        variant === "line" ? "h-11 px-3" : "h-8 rounded-sm px-3",
        className,
      )}
    >
      {icon && <Icon icon={icon} size="sm" />}
      {children as ReactNode}
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 text-caption tabular-nums",
            attention
              ? "bg-warning-soft text-warning"
              : "bg-subtle text-fg-muted",
          )}
        >
          {count}
        </span>
      )}
    </BaseTabs.Tab>
  );
}

function TabsPanel({
  className,
  ...rest
}: ComponentProps<typeof BaseTabs.Panel>) {
  return <BaseTabs.Panel {...rest} className={cn("outline-none", className)} />;
}

/**
 * 탭. <Tabs.Root defaultValue="a"><Tabs.List><Tabs.Tab value="a">…</Tabs.Tab></Tabs.List><Tabs.Panel value="a">…</Tabs.Panel></Tabs.Root>
 * 화면 이동용 탭이면 Tabs.Tab에 render로 링크를 넘긴다.
 */
export const Tabs = {
  Root: BaseTabs.Root,
  List: TabsList,
  Tab: TabsTab,
  Panel: TabsPanel,
};

export interface NavTabsProps extends ComponentProps<"nav"> {
  variant?: "line" | "pill";
}

/**
 * 화면 이동용 탭 목록. 탭 안의 상태 전환이 아니라 다른 화면으로 가는 링크를 담는다.
 * line 변형은 선택 표시줄이 현재 링크(aria-current)의 패딩을 포함한 너비로 미끄러진다.
 */
export function NavTabs({
  variant = "line",
  className,
  children,
  ...rest
}: NavTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav || variant !== "line") return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>("[aria-current=page]");
      setBar(
        active ? { left: active.offsetLeft, width: active.offsetWidth } : null,
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(nav);
    const mutate = new MutationObserver(measure);
    mutate.observe(nav, {
      subtree: true,
      childList: true,
      attributeFilter: ["aria-current"],
    });
    return () => {
      resize.disconnect();
      mutate.disconnect();
    };
  }, [variant]);
  return (
    <VariantContext value={variant}>
      <nav
        {...rest}
        ref={navRef}
        className={cn(
          "relative flex items-center overflow-x-auto",
          variant === "line" ? "gap-0 border-b border-line" : "gap-1",
          className,
        )}
      >
        {children}
        {variant === "line" && bar && (
          <span
            aria-hidden
            className="absolute -bottom-px h-0.5 bg-accent transition-all duration-base ease-emphasized motion-reduce:transition-none"
            style={{ left: bar.left, width: bar.width }}
          />
        )}
      </nav>
    </VariantContext>
  );
}

export interface NavTabProps extends ComponentProps<"a"> {
  /** 라우터 링크 요소. 예: <Link to="/admin/accounts" /> */
  render: ReactElement;
  active?: boolean;
  icon?: LucideIcon;
}

export function NavTab({
  render,
  active,
  icon,
  className,
  children,
  ...rest
}: NavTabProps) {
  const variant = use(VariantContext);
  return useRender({
    render,
    props: {
      ...rest,
      "aria-current": active ? "page" : undefined,
      className: cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-label no-underline transition-colors duration-fast",
        variant === "line"
          ? cn("h-11 px-3 hover:text-fg", active ? "text-fg" : "text-fg-muted")
          : cn(
              "h-9 rounded-md px-3 hover:bg-subtle hover:text-fg",
              active ? "bg-selected text-accent-text" : "text-fg-muted",
            ),
        className,
      ),
      children: (
        <>
          {icon && <Icon icon={icon} size="sm" />}
          {children}
        </>
      ),
    },
  });
}
