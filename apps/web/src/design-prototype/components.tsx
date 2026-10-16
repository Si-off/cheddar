import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Icon, type IconName } from "./art";
export function IconButton({
  name,
  label,
  onClick,
  disabled = false,
  active = false,
}: {
  name: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "active" : ""}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  onBack,
  side = false,
  wide = false,
  popover = false,
  anchor,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  onBack?: () => void;
  side?: boolean;
  wide?: boolean;
  popover?: boolean;
  anchor?: { left: number; bottom: number };
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (popover) dialog?.show();
    else dialog?.showModal();
    const outside = (e: PointerEvent) => {
      if (popover && !dialog?.contains(e.target as Node)) close.current();
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (popover && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
    };
    document.addEventListener("pointerdown", outside);
    dialog?.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      dialog?.removeEventListener("keydown", handleEscape);
      dialog?.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [popover]);
  const top = Math.min(anchor?.bottom ?? 80, window.innerHeight - 160) + 8;
  const left = Math.max(
    12,
    Math.min(anchor?.left ?? window.innerWidth - 380, window.innerWidth - 372),
  );
  return (
    <dialog
      ref={ref}
      className={`dialog ${popover ? "dropdown" : side ? "side-testScenario" : ""} ${wide && !popover ? "wide-dialog" : ""}`}
      style={
        popover
          ? { top, left, maxHeight: window.innerHeight - top - 16 }
          : undefined
      }
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
    >
      <header className="dialog-header">
        {onBack && (
          <IconButton name="back" label="이전 설정" onClick={onBack} />
        )}
        <h2>{title}</h2>
        <IconButton name="close" label="닫기" onClick={onClose} />
      </header>
      <div className="dialog-content" key={title}>
        {children}
      </div>
    </dialog>
  );
}
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <Icon name="file" />
      </span>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
export function MenuItem({
  icon,
  children,
  onClick,
  detail,
  danger = false,
  disabled = false,
}: {
  icon: IconName;
  children: ReactNode;
  onClick: () => void;
  detail?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`menu-item ${danger ? "danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
      <span>{children}</span>
      {detail && <small>{detail}</small>}
      <Icon name="chevron" />
    </button>
  );
}
export function Skeleton({ cards = false }: { cards?: boolean }) {
  return (
    <div
      className={cards ? "skeleton-grid" : "skeleton-table"}
      role="status"
      aria-label="불러오는 중"
    >
      {(cards
        ? ["first", "second", "third", "fourth"]
        : ["header", "first", "second", "third", "fourth", "fifth", "sixth"]
      ).map((key) => (
        <div
          className={cards ? "skeleton-block" : "skeleton-table-row"}
          key={key}
        >
          {(cards
            ? ["a", "b", "c"]
            : ["a", "b", "c", "d", "e", "f", "g", "h"]
          ).map((cell) => (
            <i key={cell} />
          ))}
        </div>
      ))}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </label>
  );
}
