import type { ComponentProps } from "react";

export function Surface({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={`rounded-control border border-border bg-surface p-6 ${className}`}
      {...props}
    />
  );
}
