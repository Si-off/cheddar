import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "./button";
import { cn, withClassName } from "./utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;
const DialogPortal = DialogPrimitive.Portal;

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={withClassName("cd-dialog-overlay", className)}
      {...props}
    />
  );
}
function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "닫기",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  closeLabel?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={withClassName("cd-dialog-content", className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogClose
            render={
              <Button variant="ghost" size="icon" className="cd-dialog-close" />
            }
            aria-label={closeLabel}
          >
            <XIcon aria-hidden="true" />
          </DialogClose>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  );
}
function DialogHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("cd-dialog-header", className)}
      {...props}
    />
  );
}
function DialogFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("cd-dialog-footer", className)}
      {...props}
    />
  );
}
function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={withClassName("cd-dialog-title", className)}
      {...props}
    />
  );
}
function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={withClassName("cd-dialog-description", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
