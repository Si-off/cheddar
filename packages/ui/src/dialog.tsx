import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Button } from "./button";
import { Icon } from "./icon";
import { cn } from "./utils";

const widthClass = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl" };

interface DialogContentProps {
  size?: keyof typeof widthClass;
  className?: string;
  children: ReactNode;
}

/** 바탕을 가리고 위에서 조금 내려오며 나타난다. 크기 변화 없이 미끄러짐과 투명도만 쓴다. */
function DialogContent({
  size = "md",
  className,
  children,
}: DialogContentProps) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-overlay transition-opacity duration-base data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <BaseDialog.Viewport className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 pt-24 pb-4">
        <BaseDialog.Popup
          className={cn(
            "flex max-h-full w-full flex-col rounded-lg border border-line bg-surface shadow-dialog outline-none transition duration-base ease-emphasized",
            "data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0",
            widthClass[size],
            className,
          )}
        >
          {children}
        </BaseDialog.Popup>
      </BaseDialog.Viewport>
    </BaseDialog.Portal>
  );
}

interface DialogHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** 오른쪽 위 닫기 버튼. 기본으로 보인다. */
  closable?: boolean;
}

function DialogHeader({
  title,
  description,
  closable = true,
}: DialogHeaderProps) {
  return (
    <header className="flex items-start gap-3 px-5 pt-5 pb-1">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <BaseDialog.Title className="m-0 text-title text-fg">
          {title}
        </BaseDialog.Title>
        {description && (
          <BaseDialog.Description className="m-0 text-body-sm text-fg-muted">
            {description}
          </BaseDialog.Description>
        )}
      </div>
      {closable && (
        <BaseDialog.Close
          aria-label="닫기"
          className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-subtle hover:text-fg"
        >
          <Icon icon={X} size="sm" />
        </BaseDialog.Close>
      )}
    </header>
  );
}

function DialogBody({ className, ...rest }: ComponentProps<"div">) {
  return (
    <div
      {...rest}
      className={cn(
        "flex min-h-0 flex-col gap-4 overflow-auto px-5 py-4",
        className,
      )}
    />
  );
}

function DialogFooter({ className, ...rest }: ComponentProps<"footer">) {
  return (
    <footer
      {...rest}
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3",
        className,
      )}
    />
  );
}

/**
 * 다이얼로그. <Dialog.Root><Dialog.Trigger render={<Button />}>공유</Dialog.Trigger><Dialog.Content><Dialog.Header title="공유" /><Dialog.Body>…</Dialog.Body><Dialog.Footer>…</Dialog.Footer></Dialog.Content></Dialog.Root>
 */
export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Close: BaseDialog.Close,
  Content: DialogContent,
  Header: DialogHeader,
  Body: DialogBody,
  Footer: DialogFooter,
};

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 확인 버튼 문구. 예: "삭제" */
  confirmLabel: string;
  tone?: "primary" | "danger";
  pending?: boolean;
  onConfirm: () => void;
}

/** 되돌릴 수 없는 행동 전에 한 번 묻는다. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = "primary",
  pending,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          title={title}
          description={description}
          closable={false}
        />
        <DialogFooter className="mt-2">
          <BaseDialog.Close render={<Button variant="ghost" />}>
            취소
          </BaseDialog.Close>
          <Button variant={tone} loading={pending} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </BaseDialog.Root>
  );
}
