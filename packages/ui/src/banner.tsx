import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

const tones = {
  info: {
    frame: "border-info bg-info-soft",
    icon: Info,
    iconClass: "text-info",
  },
  warning: {
    frame: "border-warning bg-warning-soft",
    icon: TriangleAlert,
    iconClass: "text-warning",
  },
  danger: {
    frame: "border-danger bg-danger-soft",
    icon: CircleAlert,
    iconClass: "text-danger",
  },
  success: {
    frame: "border-success bg-success-soft",
    icon: CircleCheck,
    iconClass: "text-success",
  },
  accent: {
    frame: "border-accent bg-accent-soft",
    icon: Sparkles,
    iconClass: "text-accent-text",
  },
} satisfies Record<
  string,
  { frame: string; icon: LucideIcon; iconClass: string }
>;

export interface BannerProps {
  tone?: keyof typeof tones;
  title?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  /** 있으면 닫기 버튼을 보여준다 */
  onClose?: () => void;
  className?: string;
  children?: ReactNode;
}

/** 화면 안에 머무는 안내. 짧은 오류는 Toast를 쓴다. */
export function Banner({
  tone = "info",
  title,
  icon,
  actions,
  onClose,
  className,
  children,
}: BannerProps) {
  const t = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3",
        t.frame,
        className,
      )}
    >
      <Icon icon={icon ?? t.icon} className={cn("mt-0.5", t.iconClass)} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-body text-fg">
        {title && <span className="font-semibold">{title}</span>}
        {children && <div className="text-body-sm">{children}</div>}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid size-6 place-items-center rounded-md text-fg-muted hover:bg-subtle"
        >
          <Icon icon={X} size="sm" />
        </button>
      )}
    </div>
  );
}
