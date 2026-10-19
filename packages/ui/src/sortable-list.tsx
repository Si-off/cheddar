import { GripVertical } from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";
import { Icon } from "./icon";
import { cn } from "./utils";

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** 손잡이의 접근성 이름. 예: (item) => `${item.name} 순서 이동` */
  getHandleLabel: (item: T) => string;
  /** 바뀐 순서 전체를 돌려준다 */
  onReorder: (items: T[]) => void;
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  /** 순서를 바꿀 수 없으면 손잡이를 숨긴다 */
  disabled?: boolean;
  /** 항목 사이에 가로선을 둔다 */
  divided?: boolean;
  "aria-label"?: string;
  className?: string;
  itemClassName?: string;
}

function move<T>(items: readonly T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * 손잡이를 끌어 순서를 바꾸는 목록. 손잡이에 포커스를 두고 위·아래 화살표로도 옮긴다.
 * 놓을 자리는 선 색으로만 보여주고 항목을 움직이지 않는다.
 */
export function SortableList<T>({
  items,
  getId,
  getHandleLabel,
  onReorder,
  renderItem,
  disabled,
  divided,
  "aria-label": ariaLabel,
  className,
  itemClassName,
}: SortableListProps<T>) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const drop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragging !== null && dragging !== index)
      onReorder(move(items, dragging, index));
    setDragging(null);
    setOver(null);
  };

  return (
    <ul aria-label={ariaLabel} className={cn("m-0 list-none p-0", className)}>
      {items.map((item, index) => {
        const handle = disabled ? null : (
          <button
            type="button"
            draggable
            aria-label={getHandleLabel(item)}
            aria-keyshortcuts="ArrowUp ArrowDown"
            className="grid size-6 shrink-0 cursor-grab place-items-center rounded-sm border-0 bg-transparent p-0 text-fg-faint outline-none transition-colors duration-fast hover:bg-subtle hover:text-fg-muted focus-visible:bg-selected focus-visible:text-accent-text"
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDragging(index);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onKeyDown={(event) => {
              const to =
                event.key === "ArrowUp"
                  ? index - 1
                  : event.key === "ArrowDown"
                    ? index + 1
                    : null;
              if (to === null || to < 0 || to >= items.length) return;
              event.preventDefault();
              onReorder(move(items, index, to));
              // 옮긴 항목의 손잡이에 포커스를 유지한다
              const list = event.currentTarget.closest("ul");
              requestAnimationFrame(() =>
                list
                  ?.querySelectorAll<HTMLButtonElement>("button[draggable]")
                  [to]?.focus(),
              );
            }}
          >
            <Icon icon={GripVertical} size="sm" />
          </button>
        );
        return (
          <li
            key={getId(item)}
            onDragOver={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              setOver(index);
            }}
            onDrop={(event) => drop(event, index)}
            className={cn(
              "border-transparent border-y-2 transition-colors duration-fast",
              over === index &&
                dragging !== null &&
                dragging !== index &&
                (dragging < index ? "border-b-accent" : "border-t-accent"),
              dragging === index && "text-fg-faint",
              itemClassName,
            )}
          >
            <div className={cn(divided && index > 0 && "border-line border-t")}>
              {renderItem(item, handle)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
