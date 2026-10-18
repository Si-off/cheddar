import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from "react";
import { Checkbox } from "./checkbox";
import { cn, type PresenceColor, presenceClass } from "./utils";

export interface DataGridColumn<Row> {
  id: string;
  header: ReactNode;
  /** 처음 너비(px). 사용자가 끌어서 바꿀 수 있다. */
  width?: number;
  minWidth?: number;
  cell: (row: Row, context: { active: boolean }) => ReactNode;
  /** 식별값 열이면 고정폭 글꼴 */
  mono?: boolean;
}

export interface CellPosition {
  rowId: string;
  columnId: string;
}

/** 다른 사람이 선택한 셀 */
export interface GridPresence extends CellPosition {
  name: string;
  color: PresenceColor;
  guest?: boolean;
}

export interface DataGridProps<Row> {
  columns: DataGridColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  "aria-label": string;
  activeCell?: CellPosition | null;
  defaultActiveCell?: CellPosition | null;
  onActiveCellChange?: (cell: CellPosition) => void;
  presence?: GridPresence[];
  /** 있으면 행 선택 체크박스 열을 앞에 둔다 */
  selectedRowIds?: ReadonlySet<string>;
  onSelectedRowIdsChange?: (ids: Set<string>) => void;
  /** 열 너비와 행 높이(사람별 보기 설정). 없으면 내부에서 기억한다. */
  columnWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  onRowHeightsChange?: (heights: Record<string, number>) => void;
  /** 강조할 행(예: 방금 생성한 행) */
  isRowHighlighted?: (row: Row) => boolean;
  /** 표 아래(예: 케이스 추가 버튼) */
  footer?: ReactNode;
  className?: string;
}

const DEFAULT_WIDTH = 160;
const MIN_WIDTH = 48;
const ROW_HEIGHT = 32;
const EDGE = 4;
const KEY_STEP = 8;

type ResizeMode = "col" | "row" | "both" | null;

/**
 * 도메인을 모르는 편집 표. 열 정의와 셀 렌더러를 받는다.
 * 표 안의 세로선, 가로선, 교차점을 끌어 크기를 바꾸고, 더블클릭하면 기본 크기로 돌아간다.
 */
export function DataGrid<Row>({
  columns,
  rows,
  getRowId,
  "aria-label": ariaLabel,
  activeCell: activeCellProp,
  defaultActiveCell = null,
  onActiveCellChange,
  presence = [],
  selectedRowIds,
  onSelectedRowIdsChange,
  columnWidths,
  rowHeights,
  onColumnWidthsChange,
  onRowHeightsChange,
  isRowHighlighted,
  footer,
  className,
}: DataGridProps<Row>) {
  const [innerActive, setInnerActive] = useState(defaultActiveCell);
  const activeCell =
    activeCellProp === undefined ? innerActive : activeCellProp;
  const setActive = (cell: CellPosition) => {
    setInnerActive(cell);
    onActiveCellChange?.(cell);
  };

  const [innerWidths, setInnerWidths] = useState<Record<string, number>>({});
  const [innerHeights, setInnerHeights] = useState<Record<string, number>>({});
  const widths = columnWidths ?? innerWidths;
  const heights = rowHeights ?? innerHeights;
  const widthOf = (column: DataGridColumn<Row>) =>
    widths[column.id] ?? column.width ?? DEFAULT_WIDTH;
  const heightOf = (rowId: string) => heights[rowId] ?? ROW_HEIGHT;

  const commitWidths = useCallback(
    (next: Record<string, number>) => {
      setInnerWidths(next);
      onColumnWidthsChange?.(next);
    },
    [onColumnWidthsChange],
  );
  const commitHeights = useCallback(
    (next: Record<string, number>) => {
      setInnerHeights(next);
      onRowHeightsChange?.(next);
    },
    [onRowHeightsChange],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    mode: Exclude<ResizeMode, null>;
    x: number;
    y: number;
    columnId?: string;
    rowId?: string;
    width: number;
    height: number;
    widths: Record<string, number>;
    heights: Record<string, number>;
  } | null>(null);

  const presenceAt = new Map(
    presence.map((p) => [`${p.rowId}:${p.columnId}`, p]),
  );
  const selectable = selectedRowIds !== undefined;
  const rowIds = rows.map(getRowId);

  // 포인터가 셀 경계 근처인지 판단한다. 표 머리글은 세로선만 끈다.
  const hitTest = (event: {
    target: EventTarget;
    clientX: number;
    clientY: number;
  }): { mode: ResizeMode; columnId?: string; rowId?: string } => {
    const cell = (event.target as Element).closest<HTMLElement>("[data-col]");
    if (!cell) return { mode: null };
    const rect = cell.getBoundingClientRect();
    const nearRight = rect.right - event.clientX <= EDGE;
    const nearBottom =
      cell.dataset.row !== undefined && rect.bottom - event.clientY <= EDGE;
    const mode: ResizeMode =
      nearRight && nearBottom
        ? "both"
        : nearRight
          ? "col"
          : nearBottom
            ? "row"
            : null;
    return { mode, columnId: cell.dataset.col, rowId: cell.dataset.row };
  };

  const cursorFor: Record<Exclude<ResizeMode, null>, string> = {
    col: "col-resize",
    row: "row-resize",
    both: "nwse-resize",
  };

  const onPointerMove = (event: PointerEvent<HTMLTableElement>) => {
    const d = drag.current;
    if (!d) {
      const { mode } = hitTest(event);
      event.currentTarget.style.cursor = mode ? cursorFor[mode] : "";
      return;
    }
    if (d.mode !== "row" && d.columnId) {
      const column = columns.find((c) => c.id === d.columnId);
      const width = Math.max(
        column?.minWidth ?? MIN_WIDTH,
        Math.round(d.width + event.clientX - d.x),
      );
      commitWidths({ ...d.widths, [d.columnId]: width });
    }
    if (d.mode !== "col" && d.rowId) {
      const height = Math.max(
        ROW_HEIGHT,
        Math.round(d.height + event.clientY - d.y),
      );
      commitHeights({ ...d.heights, [d.rowId]: height });
    }
  };

  const onPointerDown = (event: PointerEvent<HTMLTableElement>) => {
    const { mode, columnId, rowId } = hitTest(event);
    if (!mode) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const column = columns.find((c) => c.id === columnId);
    drag.current = {
      mode,
      x: event.clientX,
      y: event.clientY,
      columnId: mode === "row" ? undefined : columnId,
      rowId: mode === "col" ? undefined : rowId,
      width: column ? widthOf(column) : DEFAULT_WIDTH,
      height: rowId ? heightOf(rowId) : ROW_HEIGHT,
      widths: { ...widths },
      heights: { ...heights },
    };
  };

  const endDrag = (event: PointerEvent<HTMLTableElement>) => {
    if (!drag.current) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onDoubleClick = (event: MouseEvent<HTMLTableElement>) => {
    const { mode, columnId, rowId } = hitTest(event);
    if (!mode) return;
    if (mode !== "row" && columnId) {
      const { [columnId]: _, ...rest } = widths;
      commitWidths(rest);
    }
    if (mode !== "col" && rowId) {
      const { [rowId]: _, ...rest } = heights;
      commitHeights(rest);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    if (
      !activeCell ||
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    )
      return;
    if (
      (event.target as HTMLElement).closest(
        "input, textarea, [contenteditable=true], [role=separator]",
      )
    )
      return;
    event.preventDefault();
    const r = rowIds.indexOf(activeCell.rowId);
    const c = columns.findIndex((col) => col.id === activeCell.columnId);
    const nextRow = Math.min(
      rowIds.length - 1,
      Math.max(
        0,
        r + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0),
      ),
    );
    const nextCol = Math.min(
      columns.length - 1,
      Math.max(
        0,
        c +
          (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0),
      ),
    );
    setActive({ rowId: rowIds[nextRow], columnId: columns[nextCol].id });
  };

  const toggleRow = (rowId: string, checked: boolean) => {
    const next = new Set(selectedRowIds);
    if (checked) next.add(rowId);
    else next.delete(rowId);
    onSelectedRowIdsChange?.(next);
  };
  const allSelected =
    selectedRowIds !== undefined &&
    rowIds.length > 0 &&
    rowIds.every((id) => selectedRowIds.has(id));
  const someSelected =
    selectedRowIds !== undefined &&
    !allSelected &&
    rowIds.some((id) => selectedRowIds.has(id));

  const cellBase = "relative border-r border-b border-line align-top";

  return (
    <div
      ref={scrollRef}
      className={cn(
        "overflow-auto rounded-lg border border-line bg-surface",
        className,
      )}
    >
      <table
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 방향키로 셀을 옮기려면 표가 포커스를 받아야 한다
        tabIndex={0}
        onKeyDown={onKeyDown}
        aria-label={ariaLabel}
        aria-rowcount={rows.length + 1}
        className="table-fixed border-separate border-spacing-0 text-body-sm text-fg"
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
      >
        <colgroup>
          {selectable && <col style={{ width: 40 }} />}
          {columns.map((column) => (
            <col key={column.id} style={{ width: widthOf(column) }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {selectable && (
              <th
                className={cn(
                  cellBase,
                  "sticky top-0 z-20 h-8 bg-subtle px-3 py-1.5",
                )}
              >
                <Checkbox
                  aria-label="모두 선택"
                  checked={allSelected}
                  indeterminate={someSelected}
                  onCheckedChange={(checked) =>
                    onSelectedRowIdsChange?.(
                      checked ? new Set(rowIds) : new Set(),
                    )
                  }
                />
              </th>
            )}
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                data-col={column.id}
                className={cn(
                  cellBase,
                  "sticky top-0 z-10 h-8 bg-subtle px-2 py-1.5 text-left text-overline text-fg-muted",
                )}
              >
                <span className="block truncate">{column.header}</span>
                <ColumnResizeHandle
                  label={
                    typeof column.header === "string"
                      ? `${column.header} 너비`
                      : "열 너비"
                  }
                  width={widthOf(column)}
                  onStep={(delta) =>
                    commitWidths({
                      ...widths,
                      [column.id]: Math.max(
                        column.minWidth ?? MIN_WIDTH,
                        widthOf(column) + delta,
                      ),
                    })
                  }
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowId = getRowId(row);
            const highlighted = isRowHighlighted?.(row);
            const rowSelected = selectedRowIds?.has(rowId);
            return (
              <tr
                key={rowId}
                className={cn(
                  rowSelected
                    ? "bg-selected"
                    : highlighted
                      ? "bg-accent-soft"
                      : "hover:bg-canvas",
                )}
              >
                {selectable && (
                  <td
                    className={cn(cellBase, "px-3 py-1.5")}
                    style={{ height: heightOf(rowId) }}
                  >
                    <Checkbox
                      aria-label="행 선택"
                      checked={rowSelected}
                      onCheckedChange={(checked) => toggleRow(rowId, checked)}
                    />
                  </td>
                )}
                {columns.map((column) => {
                  const active =
                    activeCell?.rowId === rowId &&
                    activeCell.columnId === column.id;
                  const who = presenceAt.get(`${rowId}:${column.id}`);
                  return (
                    <td
                      key={column.id}
                      data-col={column.id}
                      data-row={rowId}
                      aria-current={active ? "true" : undefined}
                      onPointerDown={() =>
                        setActive({ rowId, columnId: column.id })
                      }
                      style={{ height: heightOf(rowId) }}
                      className={cn(
                        cellBase,
                        "whitespace-pre-wrap break-words px-2 py-1.5",
                        column.mono && "font-mono text-mono text-fg-muted",
                        active && "outline-2 -outline-offset-2 outline-accent",
                        !active &&
                          who &&
                          cn(
                            "outline-2 -outline-offset-2",
                            presenceClass[who.color].outline,
                          ),
                      )}
                    >
                      {column.cell(row, { active })}
                      {who && (
                        <span
                          className={cn(
                            "pointer-events-none absolute right-0 z-10 max-w-40 truncate rounded-xs px-1.5 text-caption font-medium text-on-presence",
                            rowIndex === 0 ? "-bottom-2.5" : "-top-2.5",
                            presenceClass[who.color].bg,
                          )}
                        >
                          {who.name}
                          {who.guest && (
                            <span className="ml-1 opacity-80">방문자</span>
                          )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer && <div className="sticky left-0 px-2 py-1.5">{footer}</div>}
    </div>
  );
}

/** 키보드로 열 너비를 바꾸는 손잡이. 포인터로는 표의 세로선을 끈다. */
function ColumnResizeHandle({
  label,
  width,
  onStep,
}: {
  label: string;
  width: number;
  onStep: (delta: number) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 크기 조절 손잡이는 focusable separator 역할이 표준이다
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onStep(event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP);
        }
      }}
      className="absolute top-0 right-0 bottom-0 w-1 focus-visible:bg-accent"
    />
  );
}
