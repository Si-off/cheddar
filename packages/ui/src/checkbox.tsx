import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { withClassName } from "./utils";

export function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={withClassName("cd-choice cd-checkbox", className)}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        keepMounted
        className="cd-checkbox-indicator"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path className="cd-check-line" pathLength="1" d="m5 12 4 4L19 6" />
          <path className="cd-mixed-line" pathLength="1" d="M5 12h14" />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
