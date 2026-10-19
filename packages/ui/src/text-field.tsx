import { Field as BaseField } from "@base-ui/react/field";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import {
  type ControlSize,
  controlFrame,
  controlHeight,
  Field,
  type FieldOwnProps,
} from "./field";
import { Icon } from "./icon";
import { cn } from "./utils";

export interface TextFieldProps
  extends FieldOwnProps,
    Omit<ComponentProps<"input">, "size"> {
  size?: ControlSize;
  /** 입력 앞에 두는 아이콘(예: 검색) */
  icon?: LucideIcon;
  /** 입력 뒤에 두는 단위나 버튼 */
  trailing?: ReactNode;
}

export function TextField({
  label,
  description,
  error,
  counter,
  required,
  disabled,
  size = "md",
  icon,
  trailing,
  className,
  ...inputProps
}: TextFieldProps) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      counter={counter}
      required={required}
      disabled={disabled}
      className={className}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3",
          controlFrame,
          controlHeight[size],
        )}
      >
        {icon && (
          <Icon
            icon={icon}
            size={size === "sm" ? "sm" : "md"}
            className="text-fg-muted"
          />
        )}
        <BaseField.Control
          {...inputProps}
          required={required}
          className="h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-fg-faint read-only:text-fg-muted"
        />
        {trailing && (
          <span className="shrink-0 text-body-sm text-fg-muted">
            {trailing}
          </span>
        )}
      </div>
    </Field>
  );
}

export interface TextAreaProps
  extends FieldOwnProps,
    ComponentProps<"textarea"> {}

export function TextArea({
  label,
  description,
  error,
  counter,
  required,
  disabled,
  className,
  rows = 4,
  ...rest
}: TextAreaProps) {
  return (
    <Field
      label={label}
      description={description}
      error={error}
      counter={counter}
      required={required}
      disabled={disabled}
      className={className}
    >
      <BaseField.Control
        render={<textarea {...rest} rows={rows} required={required} />}
        className={cn(
          controlFrame,
          "min-h-20 resize-y px-3 py-2 text-body outline-none placeholder:text-fg-faint focus:border-accent data-invalid:border-danger",
        )}
      />
    </Field>
  );
}
