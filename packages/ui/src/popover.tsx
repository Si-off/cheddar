import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { withClassName } from "./utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverTitle = PopoverPrimitive.Title;
export function PopoverContent({
  className,
  children,
  ...props
}: PopoverPrimitive.Popup.Props) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        sideOffset={8}
        align="end"
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
