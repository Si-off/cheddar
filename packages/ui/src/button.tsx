import type { ComponentProps } from "react";

export function Button({
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={`rounded-control border border-primary bg-primary px-control-x py-control-y text-label font-label text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-primary focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
