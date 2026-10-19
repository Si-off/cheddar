import { Field as BaseField } from "@base-ui/react/field";
import type { ReactNode } from "react";
import { cn } from "./utils";

/** 레이블, 설명, 오류, 글자 수를 가진 입력 칸의 공통 속성 */
export interface FieldOwnProps {
  label?: ReactNode;
  description?: ReactNode;
  /** 있으면 입력 칸을 오류 상태로 표시하고 이 문구를 보여준다 */
  error?: ReactNode;
  /** 예: "12/100" */
  counter?: ReactNode;
  required?: boolean;
  disabled?: boolean;
}

export interface FieldProps extends FieldOwnProps {
  className?: string;
  children: ReactNode;
}

/** 입력 컨트롤을 레이블, 설명, 오류와 묶는다. 컨트롤은 children으로 받는다. */
export function Field({
  label,
  description,
  error,
  counter,
  required,
  disabled,
  className,
  children,
}: FieldProps) {
  return (
    <BaseField.Root
      invalid={Boolean(error)}
      disabled={disabled}
      className={cn("flex min-w-0 flex-col gap-1.5", className)}
    >
      {(label || counter) && (
        <div className="flex items-baseline gap-2">
          {label && (
            <BaseField.Label className="text-label text-fg">
              {label}
              {required && (
                <span className="ml-0.5 text-danger" aria-hidden>
                  *
                </span>
              )}
            </BaseField.Label>
          )}
          {counter && (
            <span className="ml-auto font-mono text-caption text-fg-muted tabular-nums">
              {counter}
            </span>
          )}
        </div>
      )}
      {children}
      {error ? (
        <BaseField.Description className="text-caption text-danger">
          {error}
        </BaseField.Description>
      ) : (
        description && (
          <BaseField.Description className="text-caption text-fg-muted">
            {description}
          </BaseField.Description>
        )
      )}
    </BaseField.Root>
  );
}

/** 입력 칸 테두리와 바탕. TextField, TextArea, Select 트리거가 함께 쓴다. */
export const controlFrame =
  "rounded-md border border-line bg-surface text-fg transition-colors duration-fast hover:border-line-strong focus-within:border-accent data-invalid:border-danger has-data-invalid:border-danger has-disabled:bg-subtle has-disabled:text-fg-muted";

export const controlHeight = {
  sm: "h-8 text-body-sm",
  md: "h-9 text-body",
  lg: "h-11 text-body",
} as const;
export type ControlSize = keyof typeof controlHeight;
