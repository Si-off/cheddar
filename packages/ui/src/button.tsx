import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { withClassName } from "./utils";

const buttonVariants = cva("cd-button", {
  variants: {
    variant: {
      default: "cd-button-primary",
      secondary: "cd-button-secondary",
      outline: "cd-button-outline",
      ghost: "cd-button-ghost",
      destructive: "cd-button-destructive",
      link: "cd-button-link",
    },
    size: {
      default: "cd-button-md",
      sm: "cd-button-sm",
      lg: "cd-button-lg",
      icon: "cd-button-icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});

function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      type={type}
      className={withClassName(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
