import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useRef,
  useState,
} from "react";
import { Checkbox } from "./checkbox";
import { ContextMenu } from "./context-menu";
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
  /**
   * 있으면 이어진 행 중 같은 값을 돌려주는 셀을 하나로 병합해 그린다.
   * 앞선 병합 열이 끊기는 행에서는 함께 끊긴다(상위 열의 경계를 넘지 않는다).
   */
  mergeKey?: (row: Row) => string;
  /** 맨 앞에 고정. 끌어서 옮길 수 없고 그 앞에 놓을 수도 없다. */
  fixed?: boolean;
  /** 머리글 오른쪽에 두는 요소(예: 작업 메뉴). 머리글에 올리면 보인다. */
  headerAction?: ReactNode;
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
  /** "none"이면 셀을 고르지 않는 읽기 전용 목록 */
  selection?: "cell" | "none";
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
  /** 활성 셀에서 방향키가 아닌 키를 눌렀을 때(편집 시작, 지우기, 복사 등). 입력 칸 안의 키는 보내지 않는다. */
  onCellKeyDown?: (
    cell: CellPosition,
    event: KeyboardEvent<HTMLElement>,
  ) => void;
  /** 셀을 두 번 눌렀을 때(편집 시작). 크기 조절 경계에서는 보내지 않는다. */
  onCellDoubleClick?: (cell: CellPosition) => void;
  /** 표 바깥 틀. 편집을 마친 뒤 표로 포커스를 돌릴 때 쓴다. */
  ref?: Ref<HTMLDivElement>;
  className?: string;
  /** 있으면 머리글을 끌어 열 순서를 바꾼다. 바뀐 순서의 열 ID 전체를 돌려준다. */
  onColumnReorder?: (columnIds: string[]) => void;
  /** 머리글 줄 맨 끝 칸(예: 열 추가 버튼) */
  headerEnd?: ReactNode;
  /** 셀에서 오른쪽 클릭으로 여는 메뉴 항목. 눌린 셀이 활성 셀이 된 뒤 열린다. */
  cellMenu?: ReactNode;
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
  selection = "cell",
  presence = [],
  selectedRowIds,
  onSelectedRowIdsChange,
  columnWidths,
  rowHeights,
  onColumnWidthsChange,
  onRowHeightsChange,
  isRowHighlighted,
  footer,
  onCellKeyDown,
  onCellDoubleClick,
  ref,
  className,
  onColumnReorder,
  headerEnd,
  cellMenu,
}: DataGridProps<Row>) {
  const [innerActive, setInnerActive] = useState(defaultActiveCell);
  const activeCell =
    activeCellProp === undefined ? innerActive : activeCellProp;
  const setActive = (cell: CellPosition) => {
    if (selection === "none") return;
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
    if (!mode) {
      if (columnId && rowId && selection !== "none")
        onCellDoubleClick?.({ rowId, columnId });
      return;
    }
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
    if (!activeCell) return;
    const target = event.target as HTMLElement;
    // 셀에 미리 두는 입력 칸(data-grid-input="idle")은 편집 전이라 표 키 조작을 그대로 받는다
    if (
      target.closest(
        "input, textarea, button, [role=menu], [role=listbox], [contenteditable=true], [role=separator]",
      ) &&
      !target.closest("[data-grid-input=idle]")
    )
      return;
    if (
      !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
    ) {
      onCellKeyDown?.(activeCell, event);
      return;
    }
    event.preventDefault();
    const r = rowIds.indexOf(activeCell.rowId);
    const c = columns.findIndex((col) => col.id === activeCell.columnId);
    const nextCol = Math.min(
      columns.length - 1,
      Math.max(
        0,
        c +
          (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0),
      ),
    );
    const columnId = (columns[nextCol] as DataGridColumn<Row>).id;
    // 병합된 셀은 첫 행이 대표한다. 아래로는 묶음 다음 행, 위로는 위 묶음의 첫 행으로 간다.
    const headOf = (row: number) => {
      let i = row;
      while (i > 0 && spanOf(i, columnId) === 0) i--;
      return i;
    };
    let nextRow = r;
    if (event.key === "ArrowDown")
      nextRow = headOf(r) + spanOf(headOf(r), columnId);
    else if (event.key === "ArrowUp") nextRow = headOf(headOf(r) - 1);
    nextRow = headOf(Math.min(rowIds.length - 1, Math.max(0, nextRow)));
    setActive({ rowId: rowIds[nextRow] as string, columnId });
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

  // 병합: 열 순서대로 보면서, 앞선 병합 열이 끊긴 행이나 값이 달라진 행에서 새 묶음을 시작한다.
  // spans[rowIndex][columnId] = 이 셀이 시작하는 묶음의 행 수(0이면 위 셀에 덮여 그리지 않는다)
  const spans: Record<string, number>[] = rows.map(() => ({}));
  const mergeColumns = columns.filter((c) => c.mergeKey);
  if (mergeColumns.length > 0 && rows.length > 0) {
    const starts: Record<string, number> = {};
    const breakAt = rows.map(() => false);
    for (const column of mergeColumns) {
      const key = column.mergeKey as (row: Row) => string;
      for (let i = 0; i < rows.length; i++) {
        const fresh =
          i === 0 ||
          breakAt[i] ||
          key(rows[i] as Row) !== key(rows[i - 1] as Row);
        if (fresh) {
          starts[column.id] = i;
          breakAt[i] = true;
          (spans[i] as Record<string, number>)[column.id] = 1;
        } else {
          const start = starts[column.id] as number;
          (spans[start] as Record<string, number>)[column.id] += 1;
          (spans[i] as Record<string, number>)[column.id] = 0;
        }
      }
    }
  }
  const spanOf = (rowIndex: number, columnId: string) =>
    (spans[rowIndex] as Record<string, number>)[columnId] ?? 1;

  const [dragColumn, setDragColumn] = useState<string | null>(null);
  const [dropColumn, setDropColumn] = useState<string | null>(null);
  const canDropOn = (column: DataGridColumn<Row>) =>
    Boolean(dragColumn) && dragColumn !== column.id && !column.fixed;
  const onHeaderDragStart = (
    event: DragEvent<HTMLElement>,
    column: DataGridColumn<Row>,
  ) => {
    if (!onColumnReorder || column.fixed) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    setDragColumn(column.id);
  };
  const onHeaderDragOver = (
    event: DragEvent<HTMLElement>,
    column: DataGridColumn<Row>,
  ) => {
    if (!canDropOn(column)) return;
    event.preventDefault();
    if (dropColumn !== column.id) setDropColumn(column.id);
  };
  const onHeaderDrop = (
    event: DragEvent<HTMLElement>,
    column: DataGridColumn<Row>,
  ) => {
    if (!canDropOn(column) || !dragColumn) return;
    event.preventDefault();
    const ids = columns.map((c) => c.id);
    const from = ids.indexOf(dragColumn);
    const to = ids.indexOf(column.id);
    ids.splice(from, 1);
    ids.splice(to, 0, dragColumn);
    setDragColumn(null);
    setDropColumn(null);
    onColumnReorder?.(ids);
  };
  const onHeaderDragEnd = () => {
    setDragColumn(null);
    setDropColumn(null);
  };
  const moveColumn = (columnId: string, delta: 1 | -1) => {
    const ids = columns.map((c) => c.id);
    const from = ids.indexOf(columnId);
    const to = from + delta;
    const target = columns[to];
    if (!target || target.fixed || columns[from]?.fixed) return;
    ids.splice(from, 1);
    ids.splice(to, 0, columnId);
    onColumnReorder?.(ids);
  };

  const table = (
    <table
      tabIndex={selection === "none" ? undefined : 0}
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
        {headerEnd && <col style={{ width: 40 }} />}
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
              draggable={Boolean(onColumnReorder) && !column.fixed}
              onDragStart={(event) => onHeaderDragStart(event, column)}
              onDragOver={(event) => onHeaderDragOver(event, column)}
              onDrop={(event) => onHeaderDrop(event, column)}
              onDragEnd={onHeaderDragEnd}
              className={cn(
                cellBase,
                "group/head sticky top-0 z-10 h-8 bg-subtle px-2 py-1.5 text-left text-overline text-fg-muted",
                onColumnReorder && !column.fixed && "cursor-grab",
                dragColumn === column.id && "text-fg-faint",
                dropColumn === column.id &&
                  "shadow-[inset_2px_0_0_var(--color-accent)]",
              )}
            >
              <span className="flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate">{column.header}</span>
                {column.headerAction && (
                  <span className="shrink-0 opacity-0 transition-opacity duration-fast group-hover/head:opacity-100 focus-within:opacity-100">
                    {column.headerAction}
                  </span>
                )}
              </span>
              <ColumnResizeHandle
                onMove={
                  onColumnReorder && !column.fixed
                    ? (delta) => moveColumn(column.id, delta)
                    : undefined
                }
                label={
                  typeof column.header === "string" && column.header
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
          {headerEnd && (
            <th
              className={cn(
                cellBase,
                "sticky top-0 z-10 h-8 w-10 bg-subtle p-0 text-center",
              )}
            >
              {headerEnd}
            </th>
          )}
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
                const span = spanOf(rowIndex, column.id);
                if (span === 0) return null;
                const active =
                  activeCell?.rowId === rowId &&
                  activeCell.columnId === column.id;
                const who = presenceAt.get(`${rowId}:${column.id}`);
                return (
                  <td
                    key={column.id}
                    data-col={column.id}
                    data-row={rowId}
                    rowSpan={span > 1 ? span : undefined}
                    aria-current={active ? "true" : undefined}
                    onPointerDown={() =>
                      setActive({ rowId, columnId: column.id })
                    }
                    style={{ height: span > 1 ? undefined : heightOf(rowId) }}
                    className={cn(
                      cellBase,
                      "whitespace-pre-wrap break-words px-2 py-1.5",
                      column.mono && "font-mono text-mono text-fg-muted",
                      span > 1 && "bg-surface",
                      dragColumn === column.id && "opacity-35",
                      dropColumn === column.id &&
                        "shadow-[inset_2px_0_0_var(--color-accent)]",
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
              {headerEnd && <td className={cellBase} />}
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div
      ref={(node) => {
        scrollRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      }}
      className={cn(
        "w-fit max-w-full overflow-auto rounded-lg border border-line bg-surface",
        className,
      )}
    >
      {cellMenu ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger render={<div className="contents" />}>
            {table}
          </ContextMenu.Trigger>
          <ContextMenu.Popup aria-label="셀 작업">{cellMenu}</ContextMenu.Popup>
        </ContextMenu.Root>
      ) : (
        table
      )}
      {footer && <div className="sticky left-0 px-2 py-1.5">{footer}</div>}
    </div>
  );
}

/** 키보드로 열 너비를 바꾸는 손잡이. 포인터로는 표의 세로선을 끈다. Alt+방향키로 열 순서를 옮긴다. */
function ColumnResizeHandle({
  label,
  width,
  onStep,
  onMove,
}: {
  label: string;
  width: number;
  onStep: (delta: number) => void;
  onMove?: (delta: 1 | -1) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 크기 조절 손잡이는 focusable separator 역할이 표준이다
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-keyshortcuts={onMove ? "Alt+ArrowLeft Alt+ArrowRight" : undefined}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        if (event.altKey) onMove?.(event.key === "ArrowRight" ? 1 : -1);
        else onStep(event.key === "ArrowRight" ? KEY_STEP : -KEY_STEP);
      }}
      className="absolute top-0 right-0 bottom-0 w-1 focus-visible:bg-accent"
    />
  );
}
