import { CircleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
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

export interface LoadErrorProps {
  /** 예: "계정을 불러오지 못했습니다" */
  title: ReactNode;
  onRetry: () => void;
  compact?: boolean;
  className?: string;
}

/** 조회에 실패했을 때 빈 화면 대신 보여준다. 데이터가 없는 상태와 구분된다. */
export function LoadError({
  title,
  onRetry,
  compact,
  className,
}: LoadErrorProps) {
  return (
    <EmptyState
      icon={CircleAlert}
      title={title}
      compact={compact}
      className={className}
      actions={<Button onClick={onRetry}>다시 시도</Button>}
    />
  );
}
