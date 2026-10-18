import { Combobox as Primitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { withClassName } from "./utils";

export const Combobox = Primitive.Root;
export function ComboboxInput({
  className,
  density = "form",
  ...props
}: Primitive.Input.Props & { density?: "toolbar" | "form" }) {
  return (
    <Primitive.Input
      data-density={density}
      className={withClassName("cd-input", className)}
      {...props}
    />
  );
}
export function ComboboxTrigger({
  className,
  children,
  ...props
}: Primitive.Trigger.Props) {
  return (
    <Primitive.Trigger
      className={withClassName(
        "cd-button cd-button-ghost cd-button-icon",
        className,
      )}
      {...props}
    >
      {children ?? <ChevronDownIcon aria-hidden="true" />}
    </Primitive.Trigger>
  );
}
export function ComboboxContent({
  className,
  children,
  ...props
}: Primitive.Popup.Props) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner
        sideOffset={6}
        align="start"
        className="cd-select-positioner"
      >
        <Primitive.Popup
          className={withClassName(
            "cd-select-content cd-combobox-content",
            className,
          )}
          {...props}
        >
          {children}
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}
export function ComboboxList({ className, ...props }: Primitive.List.Props) {
  return (
    <Primitive.List
      className={withClassName("cd-combobox-list", className)}
      {...props}
    />
  );
}
export function ComboboxItem({
  className,
  children,
  ...props
}: Primitive.Item.Props) {
  return (
    <Primitive.Item
      className={withClassName("cd-select-item", className)}
      {...props}
    >
      {children}
      <Primitive.ItemIndicator className="cd-select-indicator">
        <CheckIcon aria-hidden="true" />
      </Primitive.ItemIndicator>
    </Primitive.Item>
  );
}
export function ComboboxEmpty({ className, ...props }: Primitive.Empty.Props) {
  return (
    <Primitive.Empty
      className={withClassName("cd-combobox-empty", className)}
      {...props}
    />
  );
}
