import type { ReactNode } from "react";
import { Badge } from "./badge";
import { cn } from "./utils";

const statusBadge = {
  pending: { tone: "warning", label: "확인 필요" },
  added: { tone: "success", label: "추가됨" },
  excluded: { tone: "neutral", label: "제외됨" },
} as const;

export interface ReviewCardProps {
  title: ReactNode;
  /** 사람이 확인해야 하는 이유 */
  reason?: ReactNode;
  status?: keyof typeof statusBadge;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
}

/** 확인 필요 항목 하나. 본문(질문, 답변, 항목 입력)은 children으로 받는다. */
export function ReviewCard({
  title,
  reason,
  status = "pending",
  actions,
  className,
  children,
}: ReviewCardProps) {
  const badge = statusBadge[status];
  return (
    <article
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-line bg-surface p-4",
        status === "excluded" && "opacity-70",
        className,
      )}
    >
      <header className="flex items-start gap-2">
        <h3 className="m-0 min-w-0 flex-1 text-title-sm text-fg">{title}</h3>
        <Badge tone={badge.tone} dot>
          {badge.label}
        </Badge>
      </header>
      {reason && (
        <p className="m-0 rounded-md bg-warning-soft px-3 py-2 text-body-sm text-fg">
          {reason}
        </p>
      )}
      {children}
      {actions && (
        <footer className="flex flex-wrap justify-end gap-2">{actions}</footer>
      )}
    </article>
  );
}
