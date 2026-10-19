import { CircleAlert, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { DrawnCheck, Icon } from "./icon";
import { cn } from "./utils";

/** unknown: 응답을 받지 못해 저장됐는지 알 수 없다 */
export type SaveState = "saved" | "dirty" | "saving" | "error" | "unknown";

const saveLabel: Record<SaveState, string> = {
  saved: "저장됨",
  dirty: "저장 전",
  saving: "저장 중",
  error: "저장 실패",
  unknown: "저장 확인 필요",
};

export interface SaveStatusProps {
  state: SaveState;
  /** 예: "방금", "2분 전" */
  meta?: ReactNode;
  className?: string;
}

/** 입력이 저장됐는지 늘 보여준다. */
export function SaveStatus({ state, meta, className }: SaveStatusProps) {
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-caption text-fg-muted",
        className,
      )}
    >
      {state === "saved" && (
        <DrawnCheck drawn size="sm" className="text-success" />
      )}
      {state === "saving" && <Icon icon={Loader2} size="sm" spin />}
      {state === "dirty" && (
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
      )}
      {(state === "error" || state === "unknown") && (
        <Icon
          icon={CircleAlert}
          size="sm"
          className={state === "error" ? "text-danger" : "text-warning"}
        />
      )}
      <span className={cn(state === "error" && "text-danger")}>
        {saveLabel[state]}
      </span>
      {meta && state === "saved" && <span>{meta}</span>}
    </span>
  );
}

export type StepState = "done" | "active" | "pending";

export interface StepListProps {
  steps: Array<{ key: string; label: ReactNode; state: StepState }>;
  "aria-label"?: string;
  className?: string;
}

/** 진행 단계 목록. 끝난 단계는 체크가 그려지고, 진행 중인 단계만 강조한다. */
export function StepList({ steps, className, ...rest }: StepListProps) {
  return (
    <ol {...rest} className={cn("flex flex-col", className)}>
      {steps.map((step, index) => (
        <li
          key={step.key}
          aria-current={step.state === "active" ? "step" : undefined}
          className="relative flex items-center gap-3 pb-5 last:pb-0"
        >
          {index < steps.length - 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute top-7 bottom-0.5 left-2.75 w-0.5 rounded-full",
                step.state === "done" ? "bg-success" : "bg-line",
              )}
            />
          )}
          <span
            className={cn(
              "grid size-6 place-items-center rounded-full",
              step.state === "done" && "bg-success-soft text-success",
              step.state === "active" && "bg-accent-soft text-accent-text",
              step.state === "pending" && "border border-line-strong",
            )}
          >
            {step.state === "done" && <DrawnCheck drawn size="sm" />}
            {step.state === "active" && <Icon icon={Loader2} size="sm" spin />}
          </span>
          <span
            className={cn(
              "text-body",
              step.state === "active" && "font-semibold text-accent-text",
              step.state === "pending" && "text-fg-muted",
              step.state === "done" && "font-medium",
            )}
          >
            {step.label}
            {step.state === "done" && <span className="sr-only"> 완료</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
