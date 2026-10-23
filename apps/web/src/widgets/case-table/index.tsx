import {
  Button,
  ConfirmDialog,
  cn,
  DataGrid,
  type DataGridColumn,
  Dialog,
  DrawnCheck,
  type GridPresence,
  Icon,
  IconButton,
  Menu,
  Popover,
  useToast,
} from "@cheddar/ui";
import {
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  type ClipboardEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  type CaseOp,
  CellImageThumb,
  type CellValue,
  type Column,
  cellImage,
  cellText,
  emptyValue,
  hasValue,
  mergeable,
  OptionChip,
  type OptionColor,
  parseCell,
  readCell,
  type TestCase,
  UploadRejected,
  useCellImages,
} from "@/entities/test-set";
import { isMac, shortcut } from "@/shared/lib/shortcut";
import { type CellActions, CellContextItems, CellToolbar } from "./cell-tools";
import { AddColumnDialog, RenameColumnDialog } from "./column-dialogs";
import {
  type CellRef,
  type FindOptions,
  FindReplaceDialog,
  findMatches,
  replaceOps,
} from "./find-replace";
import { type OptionsChange, OptionsPanel } from "./options-panel";

export { CellToolbar } from "./cell-tools";

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
  /** 셀 도구(실행취소, 수정, 삽입, 셀 병합)를 그려 넣을 곳. 페이지의 도구 상자 안에 둔다. */
  toolsTarget?: HTMLElement | null;
  /** 실행취소와 재실행. 없으면 셀 도구에 두지 않는다. */
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  /** 행을 위아래로 옮길 수 있는지. 기본은 열 편집 권한과 같다(링크 방문자는 옮기지 못한다). */
  canMoveRows?: boolean;
}

interface Editing {
  caseId: string;
  columnId: string;
  /** 글자를 쳐서 시작했으면 그 글자로 바꾼다 */
  initial?: string;
  /** 셀에 미리 둔 입력 칸에 바로 쳐서 시작했다. 친 글자가 이미 칸에 있다. */
  typed?: boolean;
  /** 선택 열을 막 만들어 항목 편집부터 연다 */
  options?: boolean;
}

// 글자를 쳐서 값을 넣을 수 있는 형식. 선택과 태그도 스프레드시트처럼 목록 밖 값을 칠 수 있다.
/** 서버가 받는 셀 이미지 형식과 크기 */
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

const typable = (column: Column) =>
  column.type === "text" || column.type === "select" || column.type === "tags";

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
  toolsTarget,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  canMoveRows = canEditColumns,
}: CaseTableProps) {
  const toast = useToast();
  const gridRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  // 범위 선택의 반대쪽 끝(활성 셀이 한쪽 끝)
  const [rangeEnd, setRangeEnd] = useState<{
    rowId: string;
    columnId: string;
  } | null>(null);
  const [finding, setFinding] = useState(false);
  // 막 드롭다운으로 바꾼 셀. 열이 선택 형식으로 반영된 뒤에 항목 편집을 연다.
  // 글자 열인 채로 편집을 열면 글자 입력 칸이 열렸다가 닫히며 편집이 끝난다.
  // 이미지가 든 열을 드롭다운으로 바꾸기 전에 묻는다(이미지는 선택 값이 될 수 없어 지워진다)
  const [confirmDropdown, setConfirmDropdown] = useState<Column | null>(null);
  const [dropdownAt, setDropdownAt] = useState<{
    caseId: string;
    columnId: string;
  } | null>(null);
  // 크게 보는 셀 이미지
  const [preview, setPreview] = useState<{
    imageId: string;
    label: string;
  } | null>(null);
  const images = useCellImages();
  const imageInput = useRef<HTMLInputElement>(null);
  const imageTarget = useRef<{ caseId: string; columnId: string } | null>(null);
  // 값이 다른 셀을 병합하기 전에 묻는다(스프레드시트와 같다)
  const [confirmMerge, setConfirmMerge] = useState(false);
  // 병합을 풀어 따로 보이는 셀("rowId:columnId"). 보기 상태라 저장하지 않는다.
  const [split, setSplit] = useState<ReadonlySet<string>>(new Set());
  const [adding, setAdding] = useState<{ afterColumnId: string | null } | null>(
    null,
  );
  const [renaming, setRenaming] = useState<Column | null>(null);
  const [removing, setRemoving] = useState<Column | null>(null);
  // 머리글 메뉴에서 연 항목 편집. 머리글 아래에 같은 편집 패널을 띄운다.
  const [optionsColumnId, setOptionsColumnId] = useState<string | null>(null);
  const headerAnchors = useRef(new Map<string, HTMLElement>());
  const editsOptions = (column: Column) =>
    canEditColumns &&
    column.presetKey === null &&
    (column.type === "select" || column.type === "tags");
  const saveOptions = (
    column: Column,
    {
      options,
      colors,
    }: { options?: string[]; colors?: Record<string, OptionColor> },
  ) =>
    onOps([
      {
        type: "update_column",
        columnId: column.id,
        name: column.name,
        description: column.description,
        ...(options && { options }),
        ...(colors && { colors }),
      },
    ]);
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
    allCases.filter((c) => hasValue(column, c.values[column.id])).length;
  useEffect(() => {
    if (!dropdownAt) return;
    const column = columns.find((c) => c.id === dropdownAt.columnId);
    if (column?.type !== "select") return;
    setDropdownAt(null);
    setEditing({ ...dropdownAt, options: true });
  }, [columns, dropdownAt]);
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
  const activeRow = active ? caseOf(active.rowId) : undefined;
  // 검색으로 고른 셀의 행이 숨으면 셀 도구가 그 행에 작용하지 않게 한다
  const current = active && activeRow && activeColumn ? active : null;
  // 선택 범위. 범위가 없으면 고른 셀 하나다.
  const bounds = (() => {
    if (!current) return null;
    const ra = activeIndex;
    const ca = columns.findIndex((c) => c.id === current.columnId);
    const endRow = rangeEnd
      ? cases.findIndex((c) => c.id === rangeEnd.rowId)
      : -1;
    const endCol = rangeEnd
      ? columns.findIndex((c) => c.id === rangeEnd.columnId)
      : -1;
    const rb = endRow < 0 ? ra : endRow;
    const cb = endCol < 0 ? ca : endCol;
    return {
      r0: Math.min(ra, rb),
      r1: Math.max(ra, rb),
      c0: Math.min(ca, cb),
      c1: Math.max(ca, cb),
    };
  })();
  const rangeRows = bounds ? cases.slice(bounds.r0, bounds.r1 + 1) : [];
  const rangeColumns = bounds ? columns.slice(bounds.c0, bounds.c1 + 1) : [];
  const isRange = rangeRows.length > 1 || rangeColumns.length > 1;
  // 범위를 스프레드시트 형식(탭과 줄바꿈, 여러 줄 셀은 따옴표) 글자로
  const rangeText = () =>
    rangeRows
      .map((row) =>
        rangeColumns
          .map((column) => quoteCell(cellText(column, row.values[column.id])))
          .join("\t"),
      )
      .join("\n");
  // 범위의 값을 지운다. 셀 하나면 병합된 묶음 전체를 지운다.
  const clearRange = () => {
    if (!current || !activeColumn) return;
    if (!isRange) {
      set(current.rowId, activeColumn.id, emptyValue(activeColumn));
      return;
    }
    const ops: CaseOp[] = rangeRows.flatMap((row) =>
      rangeColumns.map((column) => ({
        type: "set_cell" as const,
        caseId: row.id,
        columnId: column.id,
        value: emptyValue(column),
      })),
    );
    onOps(ops);
  };
  // 아래로 채우기: 범위의 첫 행 값으로 나머지 행을 채운다. 한 행이면 바로 위 행 값을 가져온다.
  const fillDown = () => {
    if (!bounds) return;
    const source = rangeRows.length > 1 ? rangeRows[0] : cases[bounds.r0 - 1];
    const targets = rangeRows.length > 1 ? rangeRows.slice(1) : rangeRows;
    if (!source) return;
    const ops: CaseOp[] = [];
    for (const column of rangeColumns) {
      if (column.systemKey === "test_id") continue;
      const value = source.values[column.id] ?? emptyValue(column);
      for (const row of targets)
        if (cellText(column, row.values[column.id]) !== cellText(column, value))
          ops.push({
            type: "set_cell",
            caseId: row.id,
            columnId: column.id,
            value,
          });
    }
    if (ops.length > 0) onOps(ops);
  };
  // 범위 행들을 한 칸 위나 아래로 옮긴다. 이웃 행을 범위 반대편으로 옮기는 한 번의 이동이다.
  const moveRows = (direction: -1 | 1) => {
    if (!bounds) return;
    if (direction === -1) {
      const above = cases[bounds.r0 - 1];
      const last = cases[bounds.r1];
      if (above && last)
        onOps([{ type: "move_case", caseId: above.id, afterCaseId: last.id }]);
    } else {
      const below = cases[bounds.r1 + 1];
      if (below)
        onOps([
          {
            type: "move_case",
            caseId: below.id,
            afterCaseId: cases[bounds.r0 - 1]?.id ?? null,
          },
        ]);
    }
  };
  // 세로로 병합: 한 열의 여러 행을 맨 위 값으로 맞춰 한 칸으로 보이게 한다
  const mergeColumn =
    rangeColumns.length === 1 &&
    rangeRows.length > 1 &&
    rangeColumns[0] &&
    mergeable(rangeColumns[0])
      ? rangeColumns[0]
      : null;
  const topValue =
    mergeColumn && rangeRows[0]
      ? rangeRows[0].values[mergeColumn.id]
      : undefined;
  const mergeVertical = () => {
    if (!mergeColumn || topValue === undefined) return;
    setSplit((prev) => {
      const next = new Set(prev);
      for (const row of rangeRows) next.delete(`${row.id}:${mergeColumn.id}`);
      return next;
    });
    const ops: CaseOp[] = rangeRows
      .slice(1)
      .filter(
        (row) =>
          cellText(mergeColumn, row.values[mergeColumn.id]) !==
          cellText(mergeColumn, topValue),
      )
      .map((row) => ({
        type: "set_cell" as const,
        caseId: row.id,
        columnId: mergeColumn.id,
        value: topValue,
      }));
    if (ops.length > 0) onOps(ops);
  };
  // 붙여넣기는 범위의 왼쪽 위부터 채운다
  const pasteOrigin = () => {
    const row = bounds ? cases[bounds.r0] : undefined;
    const column = bounds ? columns[bounds.c0] : undefined;
    return row && column ? { rowId: row.id, columnId: column.id } : null;
  };
  const pasteFromClipboard = (at: { rowId: string; columnId: string }) =>
    navigator.clipboard
      .readText()
      .then((text) => text && pasteAt(at, text))
      .catch(() =>
        toast.show({
          message: `붙여넣기는 ${shortcut("paste")}로 할 수 있습니다`,
          tone: "info",
        }),
      );
  // 스프레드시트의 삽입 > 드롭다운처럼 열에 있던 값으로 항목을 채우고 바로 항목 편집을 연다.
  // 항목 규칙(100자, 50개)을 넘는 값은 목록에 넣지 않고 목록 밖 값으로 남긴다.
  const imageCount = (column: Column) =>
    allCases.filter((c) => cellImage(column, c.values[column.id])).length;
  const makeDropdown = (column: Column) => {
    const found = [
      ...new Set(
        allCases
          .map((c) => c.values[column.id])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter((v) => v && v.length <= 100),
      ),
    ].slice(0, 50);
    onOps([
      {
        type: "update_column",
        columnId: column.id,
        name: column.name,
        description: column.description,
        columnType: "select",
        options: found.length > 0 ? found : ["항목 1"],
        colors: {},
      },
    ]);
    if (current) setDropdownAt({ caseId: current.rowId, columnId: column.id });
  };
  const putImage = (file: File) => {
    const target = imageTarget.current;
    imageTarget.current = null;
    if (!target || !images?.upload) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.show({
        message: "PNG, JPG, GIF, WebP 이미지만 넣을 수 있습니다",
        tone: "danger",
      });
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      toast.show({
        message: "10MB 이하 이미지만 넣을 수 있습니다",
        tone: "danger",
      });
      return;
    }
    images
      .upload(file)
      .then((id) => set(target.caseId, target.columnId, { image: id }))
      .catch((error: unknown) =>
        toast.show({
          message:
            error instanceof UploadRejected
              ? error.message
              : "이미지를 넣지 못했습니다. 잠시 후 다시 선택해주세요",
          tone: "danger",
        }),
      );
  };
  // 쓸 수 없는 작업은 null(흐리게), 이 표에 없는 작업은 undefined(메뉴에서 뺀다)
  const when = (ok: boolean, run: () => void) => (ok ? run : null);
  const editable = !readOnly;
  const movable = editable && canMoveRows;
  const actions: CellActions = {
    undo: onUndo && editable ? when(Boolean(canUndo), onUndo) : undefined,
    redo: onRedo && editable ? when(Boolean(canRedo), onRedo) : undefined,
    cut: !editable
      ? undefined
      : when(Boolean(current), () => {
          // 클립보드에 옮겨진 뒤에만 지운다. 옮기지 못하면 원본을 둔다.
          navigator.clipboard
            .writeText(rangeText())
            .then(clearRange)
            .catch(() =>
              toast.show({
                message: `잘라내기는 ${shortcut("cut")}로 할 수 있습니다`,
                tone: "info",
              }),
            );
        }),
    copy: when(Boolean(current), () => {
      void navigator.clipboard.writeText(rangeText());
    }),
    paste: !editable
      ? undefined
      : when(Boolean(current), () => {
          const origin = pasteOrigin();
          if (origin) pasteFromClipboard(origin);
        }),
    fillDown: !editable
      ? undefined
      : when(
          Boolean(bounds && (rangeRows.length > 1 || bounds.r0 > 0)),
          fillDown,
        ),
    moveUp: !movable
      ? undefined
      : when(Boolean(bounds && bounds.r0 > 0), () => moveRows(-1)),
    moveDown: !movable
      ? undefined
      : when(Boolean(bounds && bounds.r1 < cases.length - 1), () =>
          moveRows(1),
        ),
    clear: !editable ? undefined : when(Boolean(current), clearRange),
    deleteRow: !editable
      ? undefined
      : when(Boolean(current), () =>
          onOps([
            { type: "delete_cases", caseIds: rangeRows.map((row) => row.id) },
          ]),
        ),
    findReplace: () => setFinding(true),
    insertAbove:
      !editable || !onInsertCase
        ? undefined
        : when(Boolean(current), () =>
            insertCase(cases[(bounds?.r0 ?? activeIndex) - 1]?.id ?? null),
          ),
    insertBelow:
      !editable || !onInsertCase
        ? undefined
        : when(Boolean(current), () => {
            const last = bounds ? cases[bounds.r1] : undefined;
            if (last) insertCase(last.id);
          }),
    mergeVertical: !editable
      ? undefined
      : when(
          Boolean(
            mergeColumn &&
              topValue !== undefined &&
              cellText(mergeColumn, topValue),
          ),
          () => {
            const top = mergeColumn ? cellText(mergeColumn, topValue) : "";
            const differs =
              mergeColumn &&
              rangeRows.some((row) => {
                const text = cellText(mergeColumn, row.values[mergeColumn.id]);
                return text !== "" && text !== top;
              });
            if (differs) setConfirmMerge(true);
            else mergeVertical();
          },
        ),
    insertDropdown:
      !editable || !canEditColumns
        ? undefined
        : when(
            Boolean(
              current &&
                activeColumn?.type === "text" &&
                activeColumn.presetKey === null,
            ),
            () => {
              if (!activeColumn) return;
              if (imageCount(activeColumn) > 0)
                setConfirmDropdown(activeColumn);
              else makeDropdown(activeColumn);
            },
          ),
    insertImage:
      !editable || !images?.upload
        ? undefined
        : when(Boolean(current && activeColumn?.type === "text"), () => {
            if (!current) return;
            imageTarget.current = {
              caseId: current.rowId,
              columnId: current.columnId,
            };
            imageInput.current?.click();
          }),
    unmerge: when(
      Boolean(
        current &&
          activeColumn &&
          mergeable(activeColumn) &&
          mergedCases(current.rowId, activeColumn.id).length > 1,
      ),
      () => current && splitCell(current.rowId, current.columnId),
    ),
  };
  // 셀 도구의 단축키. 스프레드시트처럼 Mac은 ⌘, 그 밖은 Ctrl을 쓴다.
  const onShortcut = (event: KeyboardEvent<HTMLElement>) => {
    const mod = isMac() ? event.metaKey : event.ctrlKey;
    if (!mod) return false;
    const key = event.key.toLowerCase();
    const run = (action: (() => void) | null | undefined) => {
      event.preventDefault();
      action?.();
      return true;
    };
    if (key === "z") return run(event.shiftKey ? actions.redo : actions.undo);
    if (key === "y") return run(actions.redo);
    if (key === "d") return run(actions.fillDown);
    // 행 삽입과 삭제는 ⌘⌥(Ctrl+Alt)와 =, -. Option을 누르면 key가 바뀌므로 code로 본다.
    if (event.altKey && event.code === "Equal") return run(actions.insertAbove);
    if (event.altKey && event.code === "Minus") return run(actions.deleteRow);
    if (key === "h" && (event.shiftKey || !isMac()))
      return run(actions.findReplace);
    return false;
  };

  const onCellKeyDown = (
    cell: { rowId: string; columnId: string },
    event: KeyboardEvent<HTMLElement>,
  ) => {
    const column = columnOf(cell.columnId);
    const row = caseOf(cell.rowId);
    if (!column || !row) return;
    if (onShortcut(event)) return;
    const mod = event.ctrlKey || event.metaKey;
    const image = cellImage(column, row.values[column.id]);
    if (image && event.key === "Enter" && !mod) {
      event.preventDefault();
      setPreview({ imageId: image.image, label: column.name });
      return;
    }
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
      clearRange();
    } else if (
      (event.target as HTMLElement).dataset.gridInput === "idle" &&
      typable(column)
    ) {
      // 미리 둔 입력 칸이 글자를 그대로 받는다. 한글 조합도 끊기지 않는다.
    } else if (event.key.length === 1 && !event.altKey && typable(column)) {
      event.preventDefault();
      setEditing({ caseId: row.id, columnId: column.id, initial: event.key });
    }
  };

  const onCopy = (event: ClipboardEvent) => {
    if (!current || editing || isInput(event.target)) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", rangeText());
  };
  const onCut = (event: ClipboardEvent) => {
    if (readOnly || !current || editing || isInput(event.target)) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", rangeText());
    clearRange();
  };

  // 고른 셀부터 오른쪽과 아래로 채운다. 형식에 맞지 않는 값과 표 밖은 건너뛴다.
  const onPaste = (event: ClipboardEvent) => {
    if (readOnly || !current || editing || isInput(event.target)) return;
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    const origin = pasteOrigin();
    if (origin) pasteAt(origin, text);
  };
  const pasteAt = (at: { rowId: string; columnId: string }, text: string) => {
    const grid = parseTsv(text);
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

  // 찾기 및 바꾸기. 고른 셀 다음부터 표 순서대로 찾는다.
  const goTo = (cell: { rowId: string; columnId: string }) => {
    setActive(cell);
    setRangeEnd(null);
    onActiveCellChange?.({ caseId: cell.rowId, columnId: cell.columnId });
  };
  const findNext = (options: FindOptions) => {
    const matches = findMatches(columns, cases, options);
    if (matches.length === 0) return false;
    const order = (cell: { rowId: string; columnId: string }) =>
      cases.findIndex((c) => c.id === cell.rowId) * columns.length +
      columns.findIndex((c) => c.id === cell.columnId);
    const here = current ? order(current) : -1;
    goTo(matches.find((m) => order(m) > here) ?? (matches[0] as CellRef));
    return true;
  };
  const gridColumns: DataGridColumn<TestCase>[] = columns.map((column) => ({
    id: column.id,
    header: column.name,
    width: widthFor(column),
    mono: column.systemKey === "test_id",
    fixed: column.systemKey === "test_id",
    mergeKey: mergeable(column) ? mergeKeyOf(column) : undefined,
    headerAction: !canEditColumns ? undefined : (
      <span
        className="inline-flex"
        ref={(el) => {
          if (el) headerAnchors.current.set(column.id, el);
          else headerAnchors.current.delete(column.id);
        }}
      >
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
                {editsOptions(column) && (
                  <Menu.Item onClick={() => setOptionsColumnId(column.id)}>
                    선택 항목 편집
                  </Menu.Item>
                )}
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
        {optionsColumnId === column.id && (
          <Popover.Root
            open
            onOpenChange={(open) => !open && setOptionsColumnId(null)}
          >
            <Popover.Popup
              align="end"
              anchor={headerAnchors.current.get(column.id) ?? null}
              aria-label={`${column.name} 항목 편집`}
            >
              <OptionsPanel
                column={column}
                onDone={(change) => {
                  if (change) saveOptions(column, change);
                  setOptionsColumnId(null);
                }}
              />
            </Popover.Popup>
          </Popover.Root>
        )}
      </span>
    ),
    cell: (row) => {
      const value = row.values[column.id];
      const isEditing =
        editing?.caseId === row.id && editing.columnId === column.id;
      const isActive =
        active?.rowId === row.id && active.columnId === column.id;
      // 글자로 고치는 중인지. 선택과 태그는 Enter나 두 번 누르기면 목록을, 글자를 치면 입력 칸을 연다.
      const typing =
        isEditing &&
        (column.type === "text" ||
          editing.typed === true ||
          editing.initial !== undefined);
      // 고른 셀에는 보이지 않는 입력 칸을 미리 두고, 치기 시작하면 같은 칸이 편집 칸이 된다.
      // 한글처럼 조합하는 입력이 첫 키부터 이 칸에서 시작해야 글자가 빠지지 않는다.
      if (typable(column) && !readOnly && (typing || (isActive && !isEditing)))
        return (
          <>
            {!isEditing && (
              <CellDisplay
                column={column}
                value={value}
                markId={`outside-${row.id}-${column.id}`}
                onOpen={() =>
                  setEditing({ caseId: row.id, columnId: column.id })
                }
              />
            )}
            <TextEditor
              label={column.name}
              describedBy={
                !isEditing && isOutside(column, value)
                  ? `outside-${row.id}-${column.id}`
                  : undefined
              }
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
                if (next !== cellText(column, value)) {
                  const parsed = parseCell(column, next);
                  if (parsed !== undefined) set(row.id, column.id, parsed);
                }
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
            startWithOptions={editing.options}
            onChange={(next) => set(row.id, column.id, next)}
            onSaveOptions={
              editsOptions(column)
                ? (change) => saveOptions(column, change)
                : undefined
            }
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
      // 고른 셀(위의 입력 칸이 붙은 모양)과 같은 틀로 그려야 누르는 사이 칩이 다시 만들어지지 않아 click이 이어진다
      return (
        // biome-ignore lint/complexity/noUselessFragments: 고른 셀과 같은 React 트리 모양을 유지한다
        <>
          <CellDisplay
            column={column}
            value={value}
            onOpen={
              readOnly
                ? undefined
                : () => setEditing({ caseId: row.id, columnId: column.id })
            }
          />
        </>
      );
    },
  }));

  return (
    // 복사, 붙여넣기, 포커스는 안쪽 표에서 올라오는 이벤트로 받는다. 키보드 조작은 표가 맡는다.
    // biome-ignore lint/a11y/noStaticElementInteractions: 이벤트 위임용 틀이다
    <div
      onCopy={onCopy}
      onCut={onCut}
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
      className="flex min-h-0 min-w-0 flex-col"
    >
      <DataGrid
        ref={gridRef}
        aria-label={ariaLabel}
        columns={gridColumns}
        rows={cases}
        getRowId={(c) => c.id}
        activeCell={active}
        rangeEnd={rangeEnd}
        onRangeEndChange={setRangeEnd}
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
          const image =
            column && cellImage(column, caseOf(cell.rowId)?.values[column.id]);
          if (image && column)
            setPreview({ imageId: image.image, label: column.name });
          else if (!readOnly && column && column.type !== "checkbox")
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
            <CellContextItems actions={actions} />
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
      {toolsTarget &&
        createPortal(<CellToolbar actions={actions} />, toolsTarget)}
      {images?.upload && (
        <input
          ref={imageInput}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) putImage(file);
          }}
        />
      )}
      <Dialog.Root
        open={preview !== null}
        onOpenChange={(open) => !open && setPreview(null)}
      >
        <Dialog.Content size="lg">
          <Dialog.Header title={preview?.label ?? ""} />
          <Dialog.Body className="grid place-items-center">
            {preview && images && (
              <img
                src={images.url(preview.imageId)}
                alt={`${preview.label} 이미지`}
                className="max-h-160 max-w-full rounded-md object-contain"
              />
            )}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog.Root>
      <FindReplaceDialog
        open={finding}
        onOpenChange={(open) => {
          setFinding(open);
          if (!open) focusGrid();
        }}
        readOnly={readOnly}
        onFind={findNext}
        onReplace={(options, replacement) => {
          if (
            current &&
            findMatches(columns, cases, options).some(
              (m) =>
                m.rowId === current.rowId && m.columnId === current.columnId,
            )
          ) {
            const ops = replaceOps(
              columns,
              cases,
              [current],
              options,
              replacement,
            );
            if (ops.length > 0) onOps(ops);
          }
          findNext(options);
        }}
        onReplaceAll={(options, replacement) => {
          const found = findMatches(columns, cases, options);
          const ops = replaceOps(columns, cases, found, options, replacement);
          if (ops.length > 0) onOps(ops);
          return { found: found.length, replaced: ops.length };
        }}
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
        open={confirmDropdown !== null}
        onOpenChange={(open) => !open && setConfirmDropdown(null)}
        title="드롭다운"
        description={
          confirmDropdown
            ? `이 열의 이미지 ${imageCount(confirmDropdown)}개가 지워집니다. 실행취소로 되돌릴 수 없습니다.`
            : ""
        }
        confirmLabel="드롭다운으로 바꾸기"
        tone="danger"
        onConfirm={() => {
          if (confirmDropdown) makeDropdown(confirmDropdown);
          setConfirmDropdown(null);
        }}
      />
      <ConfirmDialog
        open={confirmMerge}
        onOpenChange={setConfirmMerge}
        title="셀 병합"
        description="병합하면 맨 위 셀의 값만 남고 나머지 값은 사라집니다."
        confirmLabel="병합"
        onConfirm={() => {
          mergeVertical();
          setConfirmMerge(false);
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

/** 탭이나 줄바꿈, 따옴표가 든 셀은 스프레드시트처럼 따옴표로 감싼다 */
const quoteCell = (text: string) =>
  /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/** 스프레드시트에서 복사한 글자(탭과 줄바꿈, 따옴표로 감싼 여러 줄 셀)를 칸으로 나눈다 */
function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const input = text.replace(/\r\n/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

const isInput = (target: EventTarget) =>
  target instanceof HTMLElement &&
  target.dataset.gridInput !== "idle" &&
  Boolean(target.closest("input, textarea, [contenteditable=true]"));

// 선택과 태그 셀에 목록에 없는 값이 들었는지
const isOutside = (column: Column, value: CellValue | undefined) => {
  const v = readCell(column, value);
  if (Array.isArray(v)) return v.some((tag) => !column.options.includes(tag));
  return (
    column.type === "select" && !!v && !column.options.includes(v as string)
  );
};

function CellDisplay({
  column,
  value,
  markId,
  onOpen,
}: {
  column: Column;
  value: CellValue | undefined;
  /** 목록 밖 표시의 id. 셀의 입력 칸이 이 상태를 설명으로 읽게 한다. */
  markId?: string;
  /** 있으면 선택과 태그 칩을 한 번 눌러 목록을 연다(스프레드시트의 드롭다운 칩과 같다) */
  onOpen?: () => void;
}) {
  const image = cellImage(column, value);
  if (image) return <CellImageThumb imageId={image.image} />;
  const v = readCell(column, value);
  if (column.type === "checkbox")
    return (
      <span className="grid place-items-center text-accent-text">
        <DrawnCheck drawn={v === true} size="sm" />
        <span className="sr-only">{v ? "예" : "아니오"}</span>
      </span>
    );
  // 칩을 누르면 셀을 고르는 동작에 이어 바로 목록을 연다. 키보드는 Enter로 같은 목록을 연다.
  const shown = cellText(column, value);
  const opener = (children: React.ReactNode, className?: string) =>
    onOpen ? (
      <button
        type="button"
        tabIndex={-1}
        aria-label={`${column.name} 고르기${shown ? `: ${shown}` : ""}`}
        onClick={(event) => {
          if (!event.shiftKey) onOpen();
        }}
        className={cn(
          "inline-flex max-w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left",
          className,
        )}
      >
        {children}
      </button>
    ) : (
      children
    );
  // 목록에 없는 값은 스프레드시트처럼 그대로 두고 칩 없이 글자로 보여주며, 셀 모서리에 빨간 표시를 단다.
  if (Array.isArray(v)) {
    const outside = v.filter((tag) => !column.options.includes(tag));
    return (
      <span className="flex flex-wrap items-center gap-1">
        {v
          .filter((tag) => column.options.includes(tag))
          .map((tag) => (
            <span key={tag} className="contents">
              {opener(<OptionChip column={column} option={tag} />)}
            </span>
          ))}
        {outside.length > 0 && (
          <>
            <span>{outside.join(", ")}</span>
            <OutsideMark id={markId} />
          </>
        )}
      </span>
    );
  }
  if (column.type === "select") {
    if (!v)
      // 빈 드롭다운 셀도 ▾를 눌러 바로 고른다
      return opener(
        <Icon icon={ChevronDown} size="sm" className="text-fg-faint" />,
        "float-right",
      );
    return column.options.includes(v as string) ? (
      opener(
        <OptionChip
          column={column}
          option={v as string}
          caret={Boolean(onOpen)}
        />,
      )
    ) : (
      <>
        {v}
        <OutsideMark id={markId} />
      </>
    );
  }
  return <>{v}</>;
}

/** 목록에 없는 값이 든 셀의 오른쪽 위 빨간 삼각형 */
function OutsideMark({ id }: { id?: string }) {
  return (
    <>
      <span
        aria-hidden
        className="absolute top-0 right-0 border-t-8 border-l-8 border-t-danger border-l-transparent"
      />
      <span id={id} className="sr-only">
        목록에 없는 값
      </span>
    </>
  );
}

/**
 * 셀을 덮는 글자 입력. Enter로 마치고 Shift+Enter로 줄을 바꾼다.
 * 스프레드시트처럼 다른 셀을 고르거나 밖을 눌러 편집이 끝나도 입력한 값을 반영한다. Escape만 취소한다.
 * dormant이면 보이지 않게 셀에 미리 있다가, 글자를 치면 같은 칸 그대로 편집을 시작한다.
 */
function TextEditor({
  label,
  describedBy,
  dormant,
  seed,
  onStart,
  onCommit,
  onCancel,
}: {
  label: string;
  /** 셀 상태를 설명하는 요소의 id(목록 밖 값 등) */
  describedBy?: string;
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
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
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
    // 다른 셀을 누르면 포커스가 빠지기 전에 편집이 끝나 이 칸이 사라지므로, 끝날 때 남은 입력을 반영한다
    return () => {
      if (dormant || done.current) return;
      done.current = true;
      onCommitRef.current(el.value);
    };
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
      aria-describedby={describedBy}
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

/**
 * 선택 항목에서 고른다. 태그는 여러 개를 고르고, 단일 선택은 하나를 고르면 닫힌다.
 * 비우기는 스프레드시트처럼 Delete 키나 셀 메뉴의 값 삭제로 한다.
 * onSaveOptions가 있으면 목록 아래 연필로 같은 자리에서 항목을 고친다.
 */
function OptionEditor({
  column,
  value,
  startWithOptions,
  onChange,
  onSaveOptions,
  onClose,
  children,
}: {
  column: Column;
  value: CellValue | undefined;
  /** 항목 편집부터 연다(드롭다운을 막 만들었을 때) */
  startWithOptions?: boolean;
  onChange: (value: CellValue) => void;
  onSaveOptions?: (change: OptionsChange) => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const [editingOptions, setEditingOptions] = useState(
    Boolean(startWithOptions && onSaveOptions),
  );
  // 연필로 편집 상태로 바꿀 때 메뉴가 닫혀도 셀 편집은 끝내지 않는다
  const switching = useRef(false);
  const current = readCell(column, value);
  const tags = Array.isArray(current) ? current : [];
  const trigger = <span className="block min-h-5 w-full" />;
  if (editingOptions)
    return (
      <Popover.Root defaultOpen onOpenChange={(open) => !open && onClose()}>
        <Popover.Trigger render={trigger}>{children}</Popover.Trigger>
        <Popover.Popup align="center" aria-label={`${column.name} 항목 편집`}>
          <OptionsPanel
            column={column}
            onDone={(change) => {
              if (change) onSaveOptions?.(change);
              onClose();
            }}
          />
        </Popover.Popup>
      </Popover.Root>
    );
  return (
    <Menu.Root
      defaultOpen
      onOpenChange={(open) => {
        if (open) return;
        if (switching.current) switching.current = false;
        else onClose();
      }}
    >
      <Menu.Trigger render={trigger} aria-label={`${column.name} 고르기`}>
        {children}
      </Menu.Trigger>
      <Menu.Popup
        align="center"
        footer={
          onSaveOptions && (
            <Menu.Item
              icon={Pencil}
              aria-label={`${column.name} 항목 편집`}
              className="w-9 justify-center px-0"
              onClick={() => {
                switching.current = true;
                setEditingOptions(true);
              }}
            />
          )
        }
      >
        {column.type === "tags"
          ? column.options.map((option) => (
              <Menu.CheckboxItem
                key={option}
                checked={tags.includes(option)}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [
                          ...column.options.filter(
                            (o) => o === option || tags.includes(o),
                          ),
                          // 목록에 없는 기존 태그는 그대로 둔다
                          ...tags.filter((t) => !column.options.includes(t)),
                        ]
                      : tags.filter((t) => t !== option),
                  )
                }
              >
                <OptionChip column={column} option={option} />
              </Menu.CheckboxItem>
            ))
          : column.options.map((option) => (
              <Menu.CheckboxItem
                key={option}
                closeOnClick
                checked={current === option}
                onCheckedChange={() => onChange(option)}
              >
                <OptionChip column={column} option={option} />
              </Menu.CheckboxItem>
            ))}
      </Menu.Popup>
    </Menu.Root>
  );
}
