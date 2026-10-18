import { useRender } from "@base-ui/react/use-render";
import { ChevronRight } from "lucide-react";
import {
  Children,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

export interface BreadcrumbProps extends ComponentProps<"nav"> {
  children: ReactNode;
}

/** 위치 표시. 항목 사이에 구분 아이콘을 넣는다. */
export function Breadcrumb({
  className,
  children,
  "aria-label": ariaLabel = "위치",
  ...rest
}: BreadcrumbProps) {
  const items = Children.toArray(children);
  return (
    <nav {...rest} aria-label={ariaLabel} className={className}>
      <ol className="flex flex-wrap items-center gap-1 text-body-sm text-fg-muted">
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 항목 순서가 곧 위치다
          <li key={index} className="inline-flex items-center gap-1">
            {index > 0 && (
              <Icon icon={ChevronRight} size="sm" className="text-fg-faint" />
            )}
            {item}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface BreadcrumbItemProps extends ComponentProps<"span"> {
  /** 링크로 그릴 요소. 예: <Link to="/test-sets" /> */
  render?: ReactElement;
  /** 현재 위치 */
  current?: boolean;
}

export function BreadcrumbItem({
  render,
  current,
  className,
  ...rest
}: BreadcrumbItemProps) {
  return useRender({
    render: render ?? <span />,
    props: {
      ...rest,
      "aria-current": current ? "page" : undefined,
      className: cn(
        current ? "text-fg" : "text-fg-muted hover:text-fg",
        className,
      ),
    },
  });
}
