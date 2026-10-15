import { Input as InputPrimitive } from "@base-ui/react/input";
import { withClassName } from "./utils";

export function Input({ className, ...props }: InputPrimitive.Props) {
  return (
    <InputPrimitive
      data-slot="input"
      className={withClassName("cd-input", className)}
      {...props}
    />
  );
}
