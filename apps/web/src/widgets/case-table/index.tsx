import {
  Badge,
  Button,
  ConfirmDialog,
  ContextMenu,
  cn,
  DataGrid,
  type DataGridColumn,
  DrawnCheck,
  type GridPresence,
  IconButton,
  Menu,
  useToast,
} from "@cheddar/ui";
import {
  ArrowDownToLine,
  ArrowUpToLine,
  ClipboardPaste,
  Copy,
  MoreHorizontal,
  Plus,
  SquareSplitVertical,
  Trash2,
} from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  mergeable,
  parseCell,
  readCell,
  type TestCase,
} from "@/entities/test-set";
import { AddColumnDialog, RenameColumnDialog } from "./column-dialogs";

export interface CaseTableProps {
  "aria-label": string;
  columns: Column[];
  /** 보여줄 순서대로 */
  cases: TestCase[];
  readOnly?: boolean;
  /** 열 추가·삭제·순서·이름 변경까지 할 수 있는지. 기본은 readOnly의 반대(링크 방문자는 셀만 고친다). */
  canEditColumns?: boolean;
  onOps: (ops: CaseOp[]) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  columnWidths?: Record<string, number>;
  rowHeights?: Record<string, number>;
  onColumnWidthsChange?: (widths: Record<string, number>) => void;
  onRowHeightsChange?: (heights: Record<string, number>) => void;
  /** 표 아래 "케이스 추가". 없으면 버튼을 두지 않는다. 만든 케이스 ID를 돌려주면 그 제목 셀을 고른다. */
  onAddCase?: () => string | undefined;
  /** 셀 메뉴의 위·아래에 케이스 추가. afterCaseId가 null이면 맨 앞. */
  onInsertCase?: (afterCaseId: string | null) => string | undefined;
  /** 열 추가에서 고를 수 있는 프로젝트 양식의 열. 없으면 직접 정의만 된다. */
  presetColumns?: Column[];
  /** 검색이나 묶기로 일부만 보여줄 때 테스트 세트 전체 케이스. 열 삭제 영향은 전체 기준이다. */
  allCases?: TestCase[];
  /** 새 열을 AI로 채운다. 없으면 열 추가에 그 선택지가 없다. */
  onFillColumn?: (columnId: string) => void;
  /** 다른 사람이 선택한 셀 */
  presence?: GridPresence[];
  /** 내가 고른 셀이 바뀌면 알린다(다른 사람에게 보여주기 위해) */
  onActiveCellChange?: (cell: { caseId: string; columnId: string }) => void;
}

interface Editing {
  caseId: string;
  columnId: string;
  /** 글자를 쳐서 시작했으면 그 글자로 바꾼다 */
  initial?: string;
  /** 셀에 미리 둔 입력 칸에 바로 쳐서 시작했다. 친 글자가 이미 칸에 있다. */
  typed?: boolean;
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
  canEditColumns = !readOnly,
  onOps,
  presence,
  onActiveCellChange,
  selectedIds,
  onSelectedIdsChange,
  columnWidths,
  rowHeights,
  onColumnWidthsChange,
  onRowHeightsChange,
  onAddCase,
  onInsertCase,
  presetColumns,
  allCases = cases,
  onFillColumn,
}: CaseTableProps) {
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // 병합을 풀어 따로 보이는 셀("rowId:columnId"). 보기 상태라 저장하지 않는다.
  const [split, setSplit] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<{ afterColumnId: string | null } | null>(
    null,
  );
  const [renaming, setRenaming] = useState<Column | null>(null);
  const [removing, setRemoving] = useState<Column | null>(null);
  // 셀을 눌러 생긴 포커스인지 구분한다
  const pointerFocus = useRef(false);
  // 고른 셀이 바뀔 때 표 안에 포커스가 있었는지
  const restoreFocus = useRef(false);
  // 글자 셀의 입력 칸에서 다른 형식의 셀로 옮기면 그 칸이 사라지므로, 그리자마자 표로 포커스를 돌린다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 고른 셀이 바뀔 때만 확인한다
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    const grid = gridRef.current;
    if (!grid || grid.contains(document.activeElement)) return;
    (
      grid.querySelector<HTMLElement>("[data-grid-input]") ??
      grid.querySelector<HTMLElement>("table")
    )?.focus();
  }, [active]);
  // "케이스 추가"로 만든 케이스가 표에 나타나면 제목 셀을 골라 바로 입력할 수 있게 한다
  const added = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 케이스 목록이 바뀔 때만 확인한다
  useLayoutEffect(() => {
    const caseId = added.current;
    if (!caseId || !cases.some((c) => c.id === caseId)) return;
    added.current = null;
    const column = columns.find((c) => c.systemKey === "title") ?? columns[0];
    if (!column) return;
    setActive({ rowId: caseId, columnId: column.id });
    onActiveCellChange?.({ caseId, columnId: column.id });
    focusGrid();
  }, [cases]);

  const columnOf = (id: string) => columns.find((c) => c.id === id);
  const caseOf = (id: string) => cases.find((c) => c.id === id);
  // 고른 글자 셀에는 입력 칸이 미리 있어 그쪽으로, 없으면 표로 포커스를 돌린다
  const focusGrid = () =>
    requestAnimationFrame(() =>
      (
        gridRef.current?.querySelector<HTMLElement>("[data-grid-input]") ??
        gridRef.current?.querySelector<HTMLElement>("table")
      )?.focus(),
    );
  const mergeKeyOf = (column: Column) => (row: TestCase) => {
    const text = cellText(column, row.values[column.id]);
    return text && !split.has(`${row.id}:${column.id}`) ? text : `\0${row.id}`;
  };
  const mergeColumns = columns.filter(mergeable);
  // 이 셀과 한 칸으로 병합된 케이스들(DataGrid와 같은 규칙). 병합되지 않았으면 자기 자신만.
  const mergedCases = (caseId: string, columnId: string): TestCase[] => {
    const column = columns.find((c) => c.id === columnId);
    if (!column || !mergeable(column))
      return cases.filter((c) => c.id === caseId);
    const index = cases.findIndex((c) => c.id === caseId);
    if (index < 0) return [];
    const upTo = mergeColumns.slice(0, mergeColumns.indexOf(column) + 1);
    const keys = upTo.map(mergeKeyOf);
    const same = (a: TestCase, b: TestCase) => keys.every((k) => k(a) === k(b));
    let start = index;
    while (
      start > 0 &&
      same(cases[start - 1] as TestCase, cases[start] as TestCase)
    )
      start--;
    let end = index;
    while (
      end + 1 < cases.length &&
      same(cases[end] as TestCase, cases[end + 1] as TestCase)
    )
      end++;
    return cases.slice(start, end + 1);
  };
  // 병합된 셀을 고치면 묶인 케이스가 모두 같은 값을 받는다
  const set = (caseId: string, columnId: string, value: CellValue) =>
    onOps(
      mergedCases(caseId, columnId).map((c) => ({
        type: "set_cell",
        caseId: c.id,
        columnId,
        value,
      })),
    );
  const splitCell = (caseId: string, columnId: string) =>
    setSplit((prev) => {
      const next = new Set(prev);
      for (const c of mergedCases(caseId, columnId))
        next.add(`${c.id}:${columnId}`);
      return next;
    });
  const reorder = (columnIds: string[]) => {
    const before = columns.map((c) => c.id);
    onOps([{ type: "reorder_columns", columnIds }]);
    toast.show({
      message: "열 순서를 바꿨습니다",
      action: {
        label: "되돌리기",
        onClick: () => onOps([{ type: "reorder_columns", columnIds: before }]),
      },
    });
  };
  const addColumn = (
    afterColumnId: string | null,
    column: Omit<Column, "id" | "systemKey">,
    fill: boolean,
  ) => {
    const columnId = crypto.randomUUID();
    onOps([{ type: "add_column", columnId, column, afterColumnId }]);
    if (fill) onFillColumn?.(columnId);
  };
  const removeColumn = (column: Column) =>
    onOps([{ type: "remove_column", columnId: column.id }]);
  const filledCount = (column: Column) =>
    allCases.filter((c) => cellText(column, c.values[column.id]) !== "").length;
  const insertCase = (afterCaseId: string | null) => {
    added.current = onInsertCase?.(afterCaseId) ?? null;
  };
  const activeColumn = active ? columnOf(active.columnId) : undefined;
  const activeIndex = active
    ? cases.findIndex((c) => c.id === active.rowId)
    : -1;
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
      (event.target as HTMLElement).dataset.gridInput === "idle" &&
      column.type === "text"
    ) {
      // 미리 둔 입력 칸이 글자를 그대로 받는다. 한글 조합도 끊기지 않는다.
    } else if (
      event.key.length === 1 &&
      !event.altKey &&
      column.type === "text"
    ) {
      event.preventDefault();
      setEditing({ caseId: row.id, columnId: column.id, initial: event.key });
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
    pasteAt(active, text);
  };
  const pasteAt = (at: { rowId: string; columnId: string }, text: string) => {
    const grid = text
      .replace(/\r\n/g, "\n")
      .replace(/\n$/, "")
      .split("\n")
      .map((line) => line.split("\t"));
    const r0 = cases.findIndex((c) => c.id === at.rowId);
    const c0 = columns.findIndex((c) => c.id === at.columnId);
    const ops: CaseOp[] = [];
    const total = grid.reduce((n, line) => n + line.length, 0);
    // 값 하나를 병합된 셀에 넣으면 셀 편집과 같이 묶인 케이스 전체가 받는다
    const single = grid.length === 1 && grid[0]?.length === 1;
    grid.forEach((line, dr) => {
      const row = cases[r0 + dr];
      if (!row) return;
      line.forEach((cellTextValue, dc) => {
        const column = columns[c0 + dc];
        if (!column) return;
        const value = parseCell(column, cellTextValue);
        if (value === undefined) return;
        const targets = single ? mergedCases(row.id, column.id) : [row];
        for (const target of targets)
          ops.push({
            type: "set_cell",
            caseId: target.id,
            columnId: column.id,
            value,
          });
      });
    });
    if (ops.length > 0) onOps(ops);
    const skipped = single ? (ops.length > 0 ? 0 : 1) : total - ops.length;
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
    fixed: column.systemKey === "test_id",
    mergeKey: mergeable(column) ? mergeKeyOf(column) : undefined,
    headerAction: !canEditColumns ? undefined : (
      <Menu.Root>
        <Menu.Trigger
          render={
            <IconButton
              icon={MoreHorizontal}
              label={`${column.name} 열 작업`}
              size="sm"
            />
          }
        />
        <Menu.Popup align="end">
          {column.presetKey === null && (
            <>
              <Menu.Item onClick={() => setRenaming(column)}>
                이름 변경
              </Menu.Item>
              <Menu.Separator />
            </>
          )}
          {column.systemKey !== "test_id" && (
            <Menu.Item
              onClick={() =>
                setAdding({
                  afterColumnId:
                    columns[columns.findIndex((c) => c.id === column.id) - 1]
                      ?.id ?? null,
                })
              }
            >
              왼쪽에 열 추가
            </Menu.Item>
          )}
          <Menu.Item onClick={() => setAdding({ afterColumnId: column.id })}>
            오른쪽에 열 추가
          </Menu.Item>
          {column.systemKey === null && (
            <>
              <Menu.Separator />
              <Menu.Item
                icon={Trash2}
                tone="danger"
                onClick={() =>
                  filledCount(column) > 0
                    ? setRemoving(column)
                    : removeColumn(column)
                }
              >
                삭제
              </Menu.Item>
            </>
          )}
        </Menu.Popup>
      </Menu.Root>
    ),
    cell: (row) => {
      const value = row.values[column.id];
      const isEditing =
        editing?.caseId === row.id && editing.columnId === column.id;
      const isActive =
        active?.rowId === row.id && active.columnId === column.id;
      // 고른 글자 셀에는 보이지 않는 입력 칸을 미리 두고, 치기 시작하면 같은 칸이 편집 칸이 된다.
      // 한글처럼 조합하는 입력이 첫 키부터 이 칸에서 시작해야 글자가 빠지지 않는다.
      if (column.type === "text" && !readOnly && (isEditing || isActive))
        return (
          <>
            {!isEditing && <CellDisplay column={column} value={value} />}
            <TextEditor
              label={column.name}
              dormant={!isEditing}
              seed={
                !isEditing || editing.typed
                  ? undefined
                  : (editing.initial ?? cellText(column, value))
              }
              onStart={() =>
                setEditing({ caseId: row.id, columnId: column.id, typed: true })
              }
              onCommit={(next) => {
                if (next !== cellText(column, value))
                  set(row.id, column.id, next);
                finish();
              }}
              onCancel={finish}
            />
          </>
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
        if ((event.target as HTMLElement).tagName !== "TABLE") return;
        // 셀을 누르면 브라우저가 표에 포커스를 주므로 고른 셀의 입력 칸으로 되돌린다.
        // 키보드로 빠져나가는 포커스(Shift+Tab)는 그대로 둔다.
        const idle = gridRef.current?.querySelector<HTMLElement>(
          "[data-grid-input=idle]",
        );
        const byPointer = pointerFocus.current;
        pointerFocus.current = false;
        if (idle && byPointer) {
          idle.focus();
          return;
        }
        const first = cases[0];
        const column = columns[0];
        if (!active && first && column)
          setActive({ rowId: first.id, columnId: column.id });
      }}
      onPointerDownCapture={() => {
        pointerFocus.current = true;
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
          restoreFocus.current = Boolean(
            gridRef.current?.contains(document.activeElement),
          );
          if (
            editing &&
            (editing.caseId !== cell.rowId ||
              editing.columnId !== cell.columnId)
          )
            setEditing(null);
          setActive(cell);
          onActiveCellChange?.({ caseId: cell.rowId, columnId: cell.columnId });
        }}
        presence={presence}
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
        onColumnReorder={canEditColumns ? reorder : undefined}
        headerEnd={
          !canEditColumns ? undefined : (
            <IconButton
              icon={Plus}
              label="열 추가"
              size="sm"
              onClick={() =>
                setAdding({ afterColumnId: columns.at(-1)?.id ?? null })
              }
            />
          )
        }
        // 오른쪽 클릭이 먼저 셀을 고르므로 메뉴는 늘 고른 셀 기준이다. 틀을 늘 둬야 표가 다시 만들어지지 않는다.
        cellMenu={
          active && activeColumn ? (
            <>
              <ContextMenu.Item
                icon={Copy}
                onClick={() => {
                  const row = caseOf(active.rowId);
                  if (row)
                    void navigator.clipboard.writeText(
                      cellText(activeColumn, row.values[activeColumn.id]),
                    );
                }}
              >
                복사
              </ContextMenu.Item>
              {!readOnly && (
                <ContextMenu.Item
                  icon={ClipboardPaste}
                  onClick={() =>
                    navigator.clipboard
                      .readText()
                      .then((text) => text && pasteAt(active, text))
                      .catch(() =>
                        toast.show({
                          message: "붙여넣기는 Ctrl+V(⌘V)로 할 수 있습니다",
                          tone: "info",
                        }),
                      )
                  }
                >
                  붙여넣기
                </ContextMenu.Item>
              )}
              {!readOnly && onInsertCase && (
                <>
                  <ContextMenu.Separator />
                  <ContextMenu.Item
                    icon={ArrowUpToLine}
                    onClick={() =>
                      insertCase(cases[activeIndex - 1]?.id ?? null)
                    }
                  >
                    위에 케이스 추가
                  </ContextMenu.Item>
                  <ContextMenu.Item
                    icon={ArrowDownToLine}
                    onClick={() => insertCase(active.rowId)}
                  >
                    아래에 케이스 추가
                  </ContextMenu.Item>
                </>
              )}
              {mergeable(activeColumn) &&
                mergedCases(active.rowId, activeColumn.id).length > 1 && (
                  <>
                    <ContextMenu.Separator />
                    <ContextMenu.Item
                      icon={SquareSplitVertical}
                      onClick={() => splitCell(active.rowId, activeColumn.id)}
                    >
                      셀 나누기
                    </ContextMenu.Item>
                  </>
                )}
              {!readOnly && (
                <>
                  <ContextMenu.Separator />
                  <ContextMenu.Item
                    icon={Trash2}
                    tone="danger"
                    onClick={() =>
                      onOps([{ type: "delete_cases", caseIds: [active.rowId] }])
                    }
                  >
                    케이스 삭제
                  </ContextMenu.Item>
                </>
              )}
            </>
          ) : (
            // 고른 셀이 없을 때. 메뉴는 고른 셀에서만 열리므로 틀만 유지한다.
            <span hidden />
          )
        }
        footer={
          onAddCase && !readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              onClick={() => {
                added.current = onAddCase() ?? null;
              }}
            >
              케이스 추가
            </Button>
          ) : undefined
        }
      />
      <AddColumnDialog
        open={adding !== null}
        onOpenChange={(open) => !open && setAdding(null)}
        columns={columns}
        presets={presetColumns}
        fillableCount={onFillColumn ? allCases.length : 0}
        onAdd={(column, fill) =>
          adding && addColumn(adding.afterColumnId, column, fill)
        }
      />
      <RenameColumnDialog
        column={renaming}
        others={columns}
        onOpenChange={(open) => !open && setRenaming(null)}
        onSave={(name, description) => {
          if (renaming)
            onOps([
              {
                type: "update_column",
                columnId: renaming.id,
                name,
                description,
              },
            ]);
          setRenaming(null);
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`${removing?.name ?? ""} 삭제`}
        description={
          removing ? `케이스 ${filledCount(removing)}개의 값도 지워집니다.` : ""
        }
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => {
          if (removing) removeColumn(removing);
          setRemoving(null);
        }}
      />
    </div>
  );
}

const isInput = (target: EventTarget) =>
  target instanceof HTMLElement &&
  target.dataset.gridInput !== "idle" &&
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

/**
 * 셀을 덮는 글자 입력. Enter로 마치고 Shift+Enter로 줄을 바꾼다.
 * dormant이면 보이지 않게 셀에 미리 있다가, 글자를 치면 같은 칸 그대로 편집을 시작한다.
 */
function TextEditor({
  label,
  dormant,
  seed,
  onStart,
  onCommit,
  onCancel,
}: {
  label: string;
  dormant: boolean;
  /** 편집을 시작할 때 채울 값. 없으면 친 글자를 그대로 둔다. */
  seed: string | undefined;
  onStart: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const seedRef = useRef(seed);
  seedRef.current = seed;
  // 편집이 시작되거나 끝날 때만 칸의 값을 맞춘다. 편집 중 다른 사람의 변경이 와도 입력을 덮지 않는다.
  // 같은 칸을 쓰므로 조합 중인 글자도 이어진다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const start = seedRef.current;
    if (dormant) {
      done.current = false;
      el.value = "";
    } else if (start !== undefined) {
      el.value = start;
      el.setSelectionRange(start.length, start.length);
    }
    el.focus();
  }, [dormant]);
  const commit = (value: string) => {
    if (dormant || done.current) return;
    done.current = true;
    onCommit(value);
  };
  return (
    <textarea
      ref={ref}
      aria-label={label}
      data-grid-input={dormant ? "idle" : "editing"}
      onInput={() => dormant && onStart()}
      onCompositionStart={() => dormant && onStart()}
      onKeyDown={(e) => {
        if (dormant) return;
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
      className={cn(
        "absolute inset-0 z-10 m-0 h-full min-h-full w-full resize-none border-0 bg-surface px-2 py-1.5 font-sans text-body-sm text-fg outline-2 -outline-offset-2 outline-accent",
        dormant && "pointer-events-none opacity-0",
      )}
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
