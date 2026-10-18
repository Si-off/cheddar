import type { ComponentProps } from "react";

export function Surface({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-panel border border-border bg-surface p-panel ${className}`}
      {...props}
    />
  );
}
