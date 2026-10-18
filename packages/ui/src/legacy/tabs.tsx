import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { withClassName } from "./utils";

export function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={withClassName("cd-tabs", className)}
      {...props}
    />
  );
}
export function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={withClassName("cd-tabs-list", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={withClassName("cd-tabs-trigger", className)}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={withClassName("cd-tabs-content", className)}
      {...props}
    />
  );
}
