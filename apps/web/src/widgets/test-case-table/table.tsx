import { Checkbox, Textarea } from "@cheddar/ui";
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  type KeyboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type CaseDraft,
  type Column,
  displayValue,
  type Snapshot,
  setValue,
} from "@/entities/test-case";
import {
  bounds,
  type CellPosition,
  type CellRange,
  copyRange,
  pasteRange,
} from "./clipboard";
import "./table.css";

type Props = {
  snapshot: Snapshot;
  query: string;
  disabled?: boolean;
  selected: Set<string>;
  onSelected: (value: Set<string>) => void;
  onChange: (value: Snapshot) => void;
  onComposition: (active: boolean) => void;
  onDetails: (id: string) => void;
  onError: (message: string) => void;
};
type Editing = CellPosition & { original: string };
export function TestCaseTable({
  snapshot,
  query,
  disabled,
  selected,
  onSelected,
  onChange,
  onComposition,
  onDetails,
  onError,
}: Props) {
  const tableRef = useRef<HTMLTableElement>(null);
  const columns = useMemo(
    () =>
      snapshot.view
        .map((v) => snapshot.columns.find((c) => c.id === v.columnId))
        .filter((c): c is Column => !!c),
    [snapshot.columns, snapshot.view],
  );
  const rows = useMemo(
    () =>
      snapshot.cases.filter(
        (item) =>
          !query ||
          columns.some((c) =>
            displayValue(snapshot, item, c)
              .toLocaleLowerCase()
              .includes(query.toLocaleLowerCase()),
          ),
      ),
    [snapshot, columns, query],
  );
  const rowIds = rows.map((c) => c.id),
    columnIds = columns.map((c) => c.id);
  const first =
    rows[0] && columns[0]
      ? { rowId: rows[0].id, columnId: columns[0].id }
      : undefined;
  const [selection, setSelection] = useState<CellRange>();
  const [editing, setEditing] = useState<Editing>();
  const range =
    selection && bounds(selection, rowIds, columnIds)
      ? selection
      : first
        ? { anchor: first, focus: first }
        : undefined;
  const rect = range ? bounds(range, rowIds, columnIds) : undefined;
  const sizes = useMemo(
    () => Object.fromEntries(snapshot.view.map((c) => [c.columnId, c.width])),
    [snapshot.view],
  );
  const definitions = useMemo<ColumnDef<CaseDraft>[]>(
    () =>
      columns.map((c) => ({
        id: c.id,
        header: c.name,
        accessorFn: (row) => displayValue(snapshot, row, c),
      })),
    [columns, snapshot],
  );
  const table = useReactTable({
    data: rows,
    columns: definitions,
    getRowId: (item) => item.id,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onEnd",
    defaultColumn: { minSize: 1, maxSize: 2147483647 },
    state: { columnSizing: sizes },
    onColumnSizingChange: (updater) => {
      const next = typeof updater === "function" ? updater(sizes) : updater;
      onChange({
        ...snapshot,
        view: snapshot.view.map((c) => ({
          ...c,
          width: Math.max(1, Math.round(next[c.columnId] ?? c.width)),
        })),
      });
    },
  });
  const focusEditor = useCallback(
    (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      node?.focus();
    },
    [],
  );
  function focus(position: CellPosition, extend = false) {
    setSelection({
      anchor: extend && range ? range.anchor : position,
      focus: position,
    });
    queueMicrotask(() => {
      const cell = tableRef.current?.querySelector<HTMLElement>(
        `[data-row="${position.rowId}"][data-column="${position.columnId}"]`,
      );
      cell?.focus();
      cell?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }
  function move(row: number, column: number, extend = false) {
    if (rows[row] && columns[column])
      focus({ rowId: rows[row].id, columnId: columns[column].id }, extend);
  }
  function start(position: CellPosition, replacement?: string) {
    const item = snapshot.cases.find((c) => c.id === position.rowId),
      column = columns.find((c) => c.id === position.columnId);
    if (disabled || !item || !column) return;
    if (column.field === "relatedFrames" || column.field === "screens") {
      onDetails(item.id);
      return;
    }
    setEditing({ ...position, original: displayValue(snapshot, item, column) });
    if (replacement !== undefined && column.field !== "priority")
      changeCell(item.id, column, replacement);
  }
  function changeCell(id: string, column: Column, value: string) {
    try {
      onChange({
        ...snapshot,
        cases: snapshot.cases.map((c) =>
          c.id === id ? setValue(c, column, value) : c,
        ),
      });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "입력 내용을 확인해주세요.",
      );
    }
  }
  function keyDown(event: KeyboardEvent) {
    if (event.nativeEvent.isComposing || disabled || !range) return;
    if (editing) {
      if (event.key === "Escape") {
        const column = columns.find((c) => c.id === editing.columnId);
        if (column) changeCell(editing.rowId, column, editing.original);
        setEditing(undefined);
        focus(editing);
        event.preventDefault();
      } else if (event.key === "Enter") {
        const column = columns.find((c) => c.id === editing.columnId);
        const multiline =
          column &&
          ["preconditions", "steps", "expectedResult"].includes(
            column.field ?? "",
          );
        if (multiline && !event.metaKey && !event.ctrlKey) return;
        setEditing(undefined);
        move(
          rowIds.indexOf(editing.rowId) + (event.shiftKey ? -1 : 1),
          columnIds.indexOf(editing.columnId),
        );
        event.preventDefault();
      }
      return;
    }
    const row = rowIds.indexOf(range.focus.rowId),
      column = columnIds.indexOf(range.focus.columnId);
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      move(
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            row +
              (event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : 0),
          ),
        ),
        Math.max(
          0,
          Math.min(
            columns.length - 1,
            column +
              (event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0),
          ),
        ),
        event.shiftKey,
      );
    } else if (event.key === "Tab") {
      const index = row * columns.length + column + (event.shiftKey ? -1 : 1);
      if (index >= 0 && index < rows.length * columns.length) {
        event.preventDefault();
        move(Math.floor(index / columns.length), index % columns.length);
      }
    } else if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      start(range.focus);
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      try {
        onChange(pasteRange(snapshot, rowIds, columns, range, "", !!query));
      } catch (error) {
        onError((error as Error).message);
      }
    } else if (
      event.key.length === 1 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      start(range.focus, event.key);
    }
  }
  return (
    <div className="sheet-table-scroll">
      <table
        ref={tableRef}
        className="sheet-table"
        style={{
          width: `calc(${table.getTotalSize()}px + var(--spacing-control-lg))`,
        }}
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: WAI-ARIA APG data-grids applies grid to a native table.
        role="grid"
        aria-label="테스트 케이스 편집"
        aria-rowcount={rows.length + 1}
        aria-colcount={columns.length + 1}
        aria-multiselectable="true"
        onCopy={(event) => {
          if (editing || !range) return;
          event.preventDefault();
          event.clipboardData.setData(
            "text/plain",
            copyRange(snapshot, rowIds, columns, range),
          );
        }}
        onPaste={(event) => {
          if (editing || !range || disabled) return;
          event.preventDefault();
          try {
            onChange(
              pasteRange(
                snapshot,
                rowIds,
                columns,
                range,
                event.clipboardData.getData("text/plain"),
                !!query,
              ),
            );
          } catch (error) {
            onError((error as Error).message);
          }
        }}
      >
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              <th scope="col">
                <span className="sr-only">행 선택</span>
              </th>
              {group.headers.map((header) => (
                <th
                  scope="col"
                  key={header.id}
                  style={{
                    width: header.getSize(),
                    minWidth: header.getSize(),
                    maxWidth: header.getSize(),
                  }}
                >
                  <div className="sheet-column-header">
                    <span>
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </span>
                    <button
                      type="button"
                      className="sheet-resize"
                      aria-label={`${header.column.columnDef.header} 너비 조절`}
                      disabled={disabled}
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      onKeyDown={(event) => {
                        if (
                          event.key === "ArrowLeft" ||
                          event.key === "ArrowRight"
                        ) {
                          event.stopPropagation();
                          event.preventDefault();
                          const width = Math.max(
                            1,
                            header.getSize() +
                              (event.key === "ArrowLeft" ? -1 : 1) *
                                (event.shiftKey ? 10 : 1),
                          );
                          onChange({
                            ...snapshot,
                            view: snapshot.view.map((v) =>
                              v.columnId === header.id ? { ...v, width } : v,
                            ),
                          });
                        }
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, rowIndex) => (
            <tr key={row.id} aria-rowindex={rowIndex + 2}>
              <td>
                <Checkbox
                  aria-label={`${rowIndex + 1}행 선택`}
                  checked={selected.has(row.id)}
                  disabled={disabled}
                  onCheckedChange={(checked) => {
                    const next = new Set(selected);
                    if (checked) next.add(row.id);
                    else next.delete(row.id);
                    onSelected(next);
                  }}
                />
              </td>
              {row.getVisibleCells().map((cell, columnIndex) => {
                const column = columns[columnIndex],
                  position = { rowId: row.id, columnId: column.id };
                const active =
                  range?.focus.rowId === row.id &&
                  range.focus.columnId === column.id;
                const selected =
                  !!rect &&
                  rowIndex >= rect.firstRow &&
                  rowIndex <= rect.lastRow &&
                  columnIndex >= rect.firstColumn &&
                  columnIndex <= rect.lastColumn;
                const edit =
                  editing?.rowId === row.id && editing.columnId === column.id;
                const value = displayValue(snapshot, row.original, column);
                return (
                  <td
                    key={cell.id}
                    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: Editable native table cell implements the APG grid keyboard pattern.
                    role="gridcell"
                    aria-colindex={columnIndex + 2}
                    onKeyDown={(event) => {
                      event.stopPropagation();
                      keyDown(event);
                    }}
                    tabIndex={active ? 0 : -1}
                    data-row={row.id}
                    data-column={column.id}
                    aria-selected={selected}
                    aria-label={`${rowIndex + 1}행 ${column.name}`}
                    style={{
                      width: sizes[column.id],
                      minWidth: sizes[column.id],
                      maxWidth: sizes[column.id],
                    }}
                    onClick={(event) => {
                      if (!edit) focus(position, event.shiftKey);
                    }}
                    onFocus={(event) => {
                      if (event.target === event.currentTarget && !active)
                        setSelection({ anchor: position, focus: position });
                    }}
                    onDoubleClick={() => start(position)}
                  >
                    <div className="sheet-cell-content" data-editing={edit}>
                      <span
                        className="sheet-cell-text"
                        aria-hidden={edit || undefined}
                      >
                        {value}
                        {"\u200b"}
                      </span>
                      {edit &&
                        (column.field === "priority" ? (
                          <select
                            ref={(node) => node?.focus()}
                            aria-label="우선순위 편집"
                            value={row.original.priority ?? ""}
                            onChange={(e) =>
                              changeCell(row.id, column, e.target.value)
                            }
                            onBlur={() => setEditing(undefined)}
                          >
                            <option value="">미지정</option>
                            <option value="high">높음</option>
                            <option value="medium">보통</option>
                            <option value="low">낮음</option>
                          </select>
                        ) : (
                          <Textarea
                            ref={focusEditor}
                            rows={1}
                            aria-label={`${column.name} 편집`}
                            value={value}
                            onCompositionStart={() => onComposition(true)}
                            onCompositionEnd={() => onComposition(false)}
                            onChange={(e) =>
                              changeCell(row.id, column, e.target.value)
                            }
                            onBlur={() => {
                              onComposition(false);
                              setEditing(undefined);
                            }}
                          />
                        ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-panel text-muted">
          {query ? "검색 결과가 없습니다" : "테스트 케이스가 없습니다"}
        </p>
      )}
    </div>
  );
}
