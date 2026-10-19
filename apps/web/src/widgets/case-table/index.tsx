import {
  Badge,
  Button,
  DataGrid,
  type DataGridColumn,
  DrawnCheck,
  Menu,
  useToast,
} from "@cheddar/ui";
import { Plus } from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useRef,
  useState,
} from "react";
import {
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  parseCell,
  readCell,
  type TestCase,
} from "@/entities/test-set";

export interface CaseTableProps {
  "aria-label": string;
  columns: Column[];
  /** 보여줄 순서대로 */
  cases: TestCase[];
  readOnly?: boolean;
  onOps: (ops: CaseOp[]) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  columnWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  onRowHeightsChange?: (heights: Record<string, number>) => void;
  /** 표 아래 "케이스 추가". 없으면 버튼을 두지 않는다. */
  onAddCase?: () => void;
}

interface Editing {
  caseId: string;
  columnId: string;
  /** 글자를 쳐서 시작했으면 그 글자로 바꾼다 */
  initial?: string;
}

const empty = (column: Column): CellValue =>
  column.type === "checkbox"
    ? false
    : column.type === "tags"
      ? []
      : column.type === "select"
        ? null
        : "";

const widthFor = (column: Column) =>
  column.systemKey === "test_id"
    ? 96
    : column.systemKey === "title"
      ? 300
      : column.type === "checkbox"
        ? 72
        : column.type === "text"
          ? 200
          : 120;

/**
 * 케이스 표. 셀을 고른 뒤 Enter, 두 번 누르기, 글자 입력으로 고치고 Delete로 비운다.
 * 복사와 붙여넣기는 탭으로 나뉜 글자(스프레드시트 형식)를 쓴다.
 */
export function CaseTable({
  "aria-label": ariaLabel,
  columns,
  cases,
  readOnly,
  onOps,
  selectedIds,
  onSelectedIdsChange,
  columnWidths,
  rowHeights,
  onColumnWidthsChange,
  onRowHeightsChange,
  onAddCase,
}: CaseTableProps) {
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const columnOf = (id: string) => columns.find((c) => c.id === id);
  const caseOf = (id: string) => cases.find((c) => c.id === id);
  const focusGrid = () =>
    requestAnimationFrame(() =>
      gridRef.current?.querySelector<HTMLElement>("table")?.focus(),
    );
  const set = (caseId: string, columnId: string, value: CellValue) =>
    onOps([{ type: "set_cell", caseId, columnId, value }]);
  const finish = () => {
    setEditing(null);
    focusGrid();
  };

  const onCellKeyDown = (
    cell: { rowId: string; columnId: string },
    event: KeyboardEvent<HTMLElement>,
  ) => {
    const column = columnOf(cell.columnId);
    const row = caseOf(cell.rowId);
    if (!column || !row) return;
    const mod = event.ctrlKey || event.metaKey;
    if (readOnly || mod) return;
    if (event.key === "Enter" || event.key === "F2") {
      event.preventDefault();
      if (column.type === "checkbox")
        set(row.id, column.id, !readCell(column, row.values[column.id]));
      else setEditing({ caseId: row.id, columnId: column.id });
    } else if (event.key === " " && column.type === "checkbox") {
      event.preventDefault();
      set(row.id, column.id, !readCell(column, row.values[column.id]));
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      set(row.id, column.id, empty(column));
    } else if (
      event.key.length === 1 &&
      !event.altKey &&
      column.type === "text"
    ) {
      event.preventDefault();
      setEditing({ caseId: row.id, columnId: column.id, initial: event.key });
    } else if (
      (event.key === "Process" || event.nativeEvent.isComposing) &&
      column.type === "text"
    ) {
      // 한글 같은 조합 입력은 키 값을 알 수 없어 빈 편집 칸을 연다
      setEditing({ caseId: row.id, columnId: column.id, initial: "" });
    }
  };

  const onCopy = (event: ClipboardEvent) => {
    if (!active || editing || isInput(event.target)) return;
    const column = columnOf(active.columnId);
    const row = caseOf(active.rowId);
    if (!column || !row) return;
    event.preventDefault();
    event.clipboardData.setData(
      "text/plain",
      cellText(column, row.values[column.id]),
    );
  };

  // 고른 셀부터 오른쪽과 아래로 채운다. 형식에 맞지 않는 값과 표 밖은 건너뛴다.
  const onPaste = (event: ClipboardEvent) => {
    if (readOnly || !active || editing || isInput(event.target)) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const grid = text
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const r0 = cases.findIndex((c) => c.id === active.rowId);
    const c0 = columns.findIndex((c) => c.id === active.columnId);
    const ops: CaseOp[] = [];
    const total = grid.reduce((n, line) => n + line.length, 0);
    grid.forEach((line, dr) => {
      const row = cases[r0 + dr];
      if (!row) return;
      line.forEach((cellTextValue, dc) => {
        const column = columns[c0 + dc];
        if (!column) return;
        const value = parseCell(column, cellTextValue);
        if (value !== undefined)
          ops.push({
            type: "set_cell",
            caseId: row.id,
            columnId: column.id,
            value,
          });
      });
    });
    if (ops.length > 0) onOps(ops);
    const skipped = total - ops.length;
    if (skipped > 0)
      toast.show({
        message: `${skipped}칸은 항목 형식에 맞지 않거나 표 밖이라 넣지 않았습니다`,
        tone: "info",
      });
  };

  const gridColumns: DataGridColumn<TestCase>[] = columns.map((column) => ({
    id: column.id,
    header: column.name,
    width: widthFor(column),
    mono: column.systemKey === "test_id",
    cell: (row) => {
      const value = row.values[column.id];
      const isEditing =
        editing?.caseId === row.id && editing.columnId === column.id;
      if (isEditing && column.type === "text")
        return (
          <TextEditor
            label={column.name}
            initial={editing.initial ?? cellText(column, value)}
            onCommit={(next) => {
              if (next !== cellText(column, value))
                set(row.id, column.id, next);
              finish();
            }}
            onCancel={finish}
          />
        );
      if (isEditing && (column.type === "select" || column.type === "tags"))
        return (
          <OptionEditor
            column={column}
            value={value}
            onChange={(next) => set(row.id, column.id, next)}
            onClose={finish}
          >
            <CellDisplay column={column} value={value} />
          </OptionEditor>
        );
      if (column.type === "checkbox" && !readOnly)
        return (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`${column.name} ${readCell(column, value) ? "해제" : "선택"}`}
            onClick={() => set(row.id, column.id, !readCell(column, value))}
            className="grid h-5 w-full place-items-center border-0 bg-transparent p-0 text-accent-text"
          >
            <CellDisplay column={column} value={value} />
          </button>
        );
      return <CellDisplay column={column} value={value} />;
    },
  }));

  return (
    // 복사, 붙여넣기, 포커스는 안쪽 표에서 올라오는 이벤트로 받는다. 키보드 조작은 표가 맡는다.
    // biome-ignore lint/a11y/noStaticElementInteractions: 이벤트 위임용 틀이다
    <div
      onCopy={onCopy}
      onPaste={onPaste}
      // 키보드로 표에 들어오면 첫 셀을 고른다
      onFocus={(event) => {
        const first = cases[0];
        const column = columns[0];
        if (
          !active &&
          first &&
          column &&
          (event.target as HTMLElement).tagName === "TABLE"
        )
          setActive({ rowId: first.id, columnId: column.id });
      }}
      className="min-w-0"
    >
      <DataGrid
        ref={gridRef}
        aria-label={ariaLabel}
        columns={gridColumns}
        rows={cases}
        getRowId={(c) => c.id}
        activeCell={active}
        onActiveCellChange={(cell) => {
          if (
            editing &&
            (editing.caseId !== cell.rowId ||
              editing.columnId !== cell.columnId)
          )
            setEditing(null);
          setActive(cell);
        }}
        onCellKeyDown={onCellKeyDown}
        onCellDoubleClick={(cell) => {
          const column = columnOf(cell.columnId);
          if (!readOnly && column && column.type !== "checkbox")
            setEditing({ caseId: cell.rowId, columnId: cell.columnId });
        }}
        selectedRowIds={selectedIds}
        onSelectedRowIdsChange={onSelectedIdsChange}
        columnWidths={columnWidths}
        rowHeights={rowHeights}
        onColumnWidthsChange={onColumnWidthsChange}
        onRowHeightsChange={onRowHeightsChange}
        footer={
          onAddCase && !readOnly ? (
            <Button variant="ghost" size="sm" icon={Plus} onClick={onAddCase}>
              케이스 추가
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}

const isInput = (target: EventTarget) =>
  target instanceof HTMLElement &&
  Boolean(target.closest("input, textarea, [contenteditable=true]"));

function CellDisplay({
  column,
  value,
}: {
  column: Column;
  value: CellValue | undefined;
}) {
  const v = readCell(column, value);
  if (column.type === "checkbox")
    return (
      <span className="grid place-items-center text-accent-text">
        <DrawnCheck drawn={v === true} size="sm" />
        <span className="sr-only">{v ? "예" : "아니오"}</span>
      </span>
    );
  if (Array.isArray(v))
    return (
      <span className="flex flex-wrap gap-1">
        {v.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </span>
    );
  if (column.type === "select") return v ? <Badge>{v}</Badge> : null;
  return <>{v}</>;
}

/** 셀을 덮는 글자 입력. Enter로 마치고 Shift+Enter로 줄을 바꾼다. */
function TextEditor({
  label,
  initial,
  onCommit,
  onCancel,
}: {
  label: string;
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const done = useRef(false);
  const commit = (value: string) => {
    if (done.current) return;
    done.current = true;
    onCommit(value);
  };
  return (
    <textarea
      aria-label={label}
      // biome-ignore lint/a11y/noAutofocus: 셀 편집을 시작하면 바로 입력한다
      autoFocus
      defaultValue={initial}
      onFocus={(e) => {
        const end = e.currentTarget.value.length;
        e.currentTarget.setSelectionRange(end, end);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          done.current = true;
          onCancel();
        }
      }}
      onBlur={(e) => commit(e.currentTarget.value)}
      className="absolute inset-0 z-10 m-0 h-full min-h-full w-full resize-none border-0 bg-surface px-2 py-1.5 font-sans text-body-sm text-fg outline-2 -outline-offset-2 outline-accent"
    />
  );
}

/** 선택 항목에서 고른다. 태그는 여러 개를 고르고, 단일 선택은 하나를 고르면 닫힌다. */
function OptionEditor({
  column,
  value,
  onChange,
  onClose,
  children,
}: {
  column: Column;
  value: CellValue | undefined;
  onChange: (value: CellValue) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const current = readCell(column, value);
  const tags = Array.isArray(current) ? current : [];
  return (
    <Menu.Root defaultOpen onOpenChange={(open) => !open && onClose()}>
      <Menu.Trigger
        render={<span className="block min-h-5 w-full" />}
        aria-label={`${column.name} 고르기`}
      >
        {children}
      </Menu.Trigger>
      <Menu.Popup>
        {column.type === "tags" ? (
          column.options.map((option) => (
            <Menu.CheckboxItem
              key={option}
              checked={tags.includes(option)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? column.options.filter(
                        (o) => o === option || tags.includes(o),
                      )
                    : tags.filter((t) => t !== option),
                )
              }
            >
              {option}
            </Menu.CheckboxItem>
          ))
        ) : (
          <>
            {column.options.map((option) => (
              <Menu.CheckboxItem
                key={option}
                closeOnClick
                checked={current === option}
                onCheckedChange={() => onChange(option)}
              >
                {option}
              </Menu.CheckboxItem>
            ))}
            <Menu.Separator />
            <Menu.Item onClick={() => onChange(null)}>비우기</Menu.Item>
          </>
        )}
      </Menu.Popup>
    </Menu.Root>
  );
}
