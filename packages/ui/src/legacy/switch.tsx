import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { withClassName } from "./utils";

export function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={withClassName("cd-switch", className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="cd-switch-thumb"
      />
    </SwitchPrimitive.Root>
  );
}
