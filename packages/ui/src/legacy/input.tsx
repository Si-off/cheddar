import { Input as InputPrimitive } from "@base-ui/react/input";
import { withClassName } from "./utils";

export function Input({
  className,
  density = "form",
  ...props
}: InputPrimitive.Props & { density?: "toolbar" | "form" }) {
  return (
    <InputPrimitive
      data-slot="input"
      data-density={density}
      className={withClassName("cd-input", className)}
      {...props}
    />
  );
}
