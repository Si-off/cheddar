import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { withClassName } from "./utils";

export function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      data-slot="radio-group"
      className={withClassName("cd-radio-group", className)}
      {...props}
    />
  );
}
export function RadioGroupItem({
  className,
  ...props
}: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      data-slot="radio-group-item"
      className={withClassName("cd-choice cd-radio", className)}
      {...props}
    >
      <RadioPrimitive.Indicator keepMounted className="cd-radio-indicator" />
    </RadioPrimitive.Root>
  );
}
