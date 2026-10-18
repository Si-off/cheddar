import type { ComponentProps } from "react";
import { cn } from "./utils";

export function Label({
  className,
  htmlFor,
  children,
  ...props
}: ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      htmlFor={htmlFor}
      className={cn("cd-label", className)}
      {...props}
    >
      {children}
    </label>
  );
}
