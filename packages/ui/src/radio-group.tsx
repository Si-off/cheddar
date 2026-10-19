import { Radio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn, motionTokens } from "./utils";

export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  orientation?: "vertical" | "horizontal";
  disabled?: boolean;
  "aria-label"?: string;
  className?: string;
}

/** 고른 원은 가운데에서 바깥으로 색이 차오르고, 점은 이동하지 않는다. */
export function RadioGroup({
  options,
  onValueChange,
  orientation = "vertical",
  className,
  ...rest
}: RadioGroupProps) {
  return (
    <BaseRadioGroup
      {...rest}
      onValueChange={(next) => onValueChange?.(next as string)}
      className={cn(
        "flex gap-3",
        orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
        className,
      )}
    >
      {options.map((option) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: Base UI Radio가 label 안의 버튼과 숨은 input을 연결한다
        <label
          key={option.value}
          className="inline-flex cursor-pointer items-start gap-2 text-body text-fg"
        >
          <Radio.Root
            value={option.value}
            disabled={option.disabled}
            className="mt-0.5 size-4 shrink-0 rounded-full data-disabled:opacity-50"
            render={(props, state) => (
              <span {...props}>
                <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
                  <circle
                    cx="8"
                    cy="8"
                    r="7.5"
                    className="fill-surface stroke-line-strong"
                    strokeWidth="1"
                  />
                  <motion.circle
                    cx="8"
                    cy="8"
                    className="fill-accent"
                    initial={false}
                    animate={{ r: state.checked ? 8 : 0 }}
                    transition={{
                      duration: motionTokens.base,
                      ease: motionTokens.emphasized,
                    }}
                  />
                  <motion.circle
                    cx="8"
                    cy="8"
                    r="3"
                    className="fill-surface"
                    initial={false}
                    animate={{ opacity: state.checked ? 1 : 0 }}
                    transition={{
                      duration: motionTokens.fast,
                      delay: state.checked ? 0.12 : 0,
                    }}
                  />
                </svg>
              </span>
            )}
          />
          <span className="flex flex-col">
            <span>{option.label}</span>
            {option.description && (
              <span className="text-caption text-fg-muted">
                {option.description}
              </span>
            )}
          </span>
        </label>
      ))}
    </BaseRadioGroup>
  );
}
