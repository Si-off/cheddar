import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** 좁은 곳(패널, 플러그인)용 */
  compact?: boolean;
  className?: string;
}

/** 비어 있거나 볼 수 없는 상태. 제목은 현재 상태를 업무 용어로 쓴다. */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  compact,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center text-center",
        compact ? "gap-2 py-6" : "gap-3 py-12",
        className,
      )}
    >
      {icon && (
        <span className="grid size-10 place-items-center rounded-full bg-subtle text-fg-muted">
          <Icon icon={icon} size="lg" />
        </span>
      )}
      <span className={cn("text-fg", compact ? "text-title-sm" : "text-title")}>
        {title}
      </span>
      {description && (
        <p className="m-0 max-w-sm text-body-sm text-fg-muted">{description}</p>
      )}
      {actions && (
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {actions}
        </div>
      )}
    </div>
  );
}
