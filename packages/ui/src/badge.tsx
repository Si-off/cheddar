import { cva, type VariantProps } from "class-variance-authority";
import { type LucideIcon, X } from "lucide-react";
import type { ComponentProps } from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

const toneClass = {
  neutral: "bg-subtle text-fg-muted",
  accent: "bg-accent-soft text-accent-text",
  figma: "bg-secondary-soft text-secondary-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};
const dotClass = {
  neutral: "bg-fg-muted",
  accent: "bg-accent",
  figma: "bg-secondary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
};

export type Tone = keyof typeof toneClass;

const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 font-medium text-caption",
  {
    variants: { tone: toneClass },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /** 앞에 작은 색 점 */
  dot?: boolean;
  icon?: LucideIcon;
}

/** 상태와 분류를 짧게 표시한다. 색만으로 뜻을 전하지 않도록 항상 글자를 함께 쓴다. */
export function Badge({
  tone,
  dot,
  icon,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span {...rest} className={cn(badgeVariants({ tone }), className)}>
      {dot && (
        <span
          aria-hidden
          className={cn("size-1.5 rounded-full", dotClass[tone ?? "neutral"])}
        />
      )}
      {icon && <Icon icon={icon} size="sm" />}
      {children}
    </span>
  );
}

export interface TagProps extends ComponentProps<"span"> {
  tone?: Tone;
  /** 있으면 지우기 버튼을 보여준다 */
  onRemove?: () => void;
  removeLabel?: string;
}

/** 표 셀 안의 값 조각(영역, 태그 값) */
export function Tag({
  tone = "neutral",
  onRemove,
  removeLabel = "지우기",
  className,
  children,
  ...rest
}: TagProps) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-0.5 rounded-xs px-1.5 text-caption",
        toneClass[tone],
        className,
      )}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel}
          className="-mr-1 grid size-4 place-items-center rounded-xs hover:bg-line"
        >
          <Icon icon={X} size="sm" />
        </button>
      )}
    </span>
  );
}
