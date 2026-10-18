import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { withClassName } from "./utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverTitle = PopoverPrimitive.Title;
export function PopoverContent({
  className,
  children,
  collisionAvoidance,
  side,
  align = "end",
  ...props
}: PopoverPrimitive.Popup.Props & {
  collisionAvoidance?: PopoverPrimitive.Positioner.Props["collisionAvoidance"];
  side?: PopoverPrimitive.Positioner.Props["side"];
  align?: PopoverPrimitive.Positioner.Props["align"];
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={8}
        collisionAvoidance={collisionAvoidance}
        side={side}
        align={align}
        className="cd-popover-positioner"
      >
        <PopoverPrimitive.Popup
          className={withClassName("cd-popover-content", className)}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
