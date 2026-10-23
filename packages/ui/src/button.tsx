import { Button as BaseButton } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md border text-label transition-colors duration-fast disabled:opacity-50 data-disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "border-transparent bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active",
        secondary: "border-line bg-surface text-fg hover:bg-subtle",
        ghost: "border-transparent bg-transparent text-fg hover:bg-subtle",
        ai: "border-transparent bg-accent-soft text-accent-text hover:bg-selected",
        danger: "border-transparent bg-danger text-on-danger hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-3.5",
        lg: "h-11 px-5 text-body",
      },
      block: { true: "w-full" },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends ComponentProps<typeof BaseButton>,
    Omit<VariantProps<typeof buttonVariants>, "block"> {
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  /** 진행 중이면 아이콘 자리에 회전 표시를 두고 누를 수 없게 한다 */
  loading?: boolean;
  block?: boolean;
}

/** 다른 요소(링크 등)로 그려야 하면 render에 요소를 넘기고 nativeButton={false}를 준다. */
export function Button({
  variant,
  size,
  block,
  icon,
  iconEnd,
  loading,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const iconSize = size === "lg" ? "md" : size === "sm" ? "sm" : "md";
  return (
    <BaseButton
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, block }), className)}
    >
      {loading ? (
        <Icon icon={Loader2} size={iconSize} spin />
      ) : (
        icon && <Icon icon={icon} size={iconSize} />
      )}
      {children}
      {iconEnd && <Icon icon={iconEnd} size={iconSize} />}
    </BaseButton>
  );
}

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-md border border-transparent text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg disabled:opacity-50 aria-pressed:bg-selected aria-pressed:text-accent-text",
  {
    variants: {
      // xs: 다른 조작 위에 겹쳐 놓는 작은 버튼(예: 부분 칸 모서리 메뉴). 누르는 영역 최소 24px
      size: { xs: "size-6 rounded-sm", sm: "size-8", md: "size-9" },
      variant: { ghost: "", solid: "border-line bg-surface" },
    },
    defaultVariants: { size: "md", variant: "ghost" },
  },
);

export interface IconButtonProps
  extends Omit<ComponentProps<typeof BaseButton>, "children">,
    VariantProps<typeof iconButtonVariants> {
  icon: LucideIcon;
  /** 접근성 이름. 아이콘만 보이므로 필수 */
  label: string;
  /** 켜고 끄는 버튼이면 현재 상태 */
  pressed?: boolean;
}

export function IconButton({
  icon,
  label,
  pressed,
  size,
  variant,
  className,
  ...rest
}: IconButtonProps) {
  return (
    <BaseButton
      {...rest}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(iconButtonVariants({ size, variant }), className)}
    >
      <Icon icon={icon} size={size === "sm" || size === "xs" ? "sm" : "md"} />
    </BaseButton>
  );
}
