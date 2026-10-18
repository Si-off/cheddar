import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import type { ComponentProps, ReactNode } from "react";
import { DrawnCheck } from "./icon";
import { cn } from "./utils";

export interface CheckboxProps
  extends Omit<
    ComponentProps<typeof BaseCheckbox.Root>,
    "children" | "className"
  > {
  label?: ReactNode;
  description?: ReactNode;
  className?: string;
}

/** 체크 표시는 왼쪽 끝부터 그려지고, 해제하면 거꾸로 지워진다. */
export function Checkbox({
  label,
  description,
  className,
  ...rest
}: CheckboxProps) {
  const box = (
    <BaseCheckbox.Root
      {...rest}
      className={cn(
        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-sm border border-line-strong bg-surface text-on-accent transition-colors duration-fast",
        "data-checked:border-accent data-checked:bg-accent data-indeterminate:border-accent data-indeterminate:bg-accent data-disabled:opacity-50",
        !label && className,
      )}
      render={(props, state) => (
        <span {...props}>
          <DrawnCheck
            drawn={state.checked || state.indeterminate}
            indeterminate={state.indeterminate}
            size="sm"
          />
        </span>
      )}
    />
  );
  if (!label) return box;
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI Checkbox가 label 안의 버튼과 숨은 input을 연결한다
    <label
      className={cn(
        "inline-flex cursor-pointer items-start gap-2 text-body text-fg",
        className,
      )}
    >
      {box}
      <span className="flex flex-col">
        <span>{label}</span>
        {description && (
          <span className="text-caption text-fg-muted">{description}</span>
        )}
      </span>
    </label>
  );
}
