import { Switch as BaseSwitch } from "@base-ui/react/switch";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./utils";

export interface SwitchProps
  extends Omit<
    ComponentProps<typeof BaseSwitch.Root>,
    "children" | "className"
  > {
  label?: ReactNode;
  className?: string;
}

/** 손잡이가 반대쪽으로 미끄러지고 트랙 색이 바뀐다. */
export function Switch({ label, className, ...rest }: SwitchProps) {
  const control = (
    <BaseSwitch.Root
      {...rest}
      className={cn(
        "relative inline-flex h-5 w-8 shrink-0 items-center rounded-full bg-line-strong transition-colors duration-base data-checked:bg-accent data-disabled:opacity-50",
        !label && className,
      )}
    >
      <BaseSwitch.Thumb className="size-4 translate-x-0.5 rounded-full bg-surface shadow-raised transition-transform duration-base ease-emphasized data-checked:translate-x-3.5" />
    </BaseSwitch.Root>
  );
  if (!label) return control;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI Switch가 label 안의 버튼과 숨은 input을 연결한다
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-2 text-body text-fg",
        className,
      )}
    >
      {control}
      <span>{label}</span>
    </label>
  );
}
