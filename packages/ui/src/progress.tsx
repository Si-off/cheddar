import { cn } from "./utils";

export interface ProgressProps {
  /** 진행 중인 일. 예: 업로드 중 */
  label: string;
  /** 0~100 */
  value: number;
  className?: string;
}

/** 끝까지 얼마나 남았는지 알 수 있는 작업의 진행 막대 */
export function Progress({ label, value, className }: ProgressProps) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-label text-fg">{label}</span>
        <span className="text-caption text-fg-muted tabular-nums">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 overflow-hidden rounded-full bg-subtle"
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-base ease-standard"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
