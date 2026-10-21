import type { CaseOp as SharedCaseOp } from "@cheddar/contracts";
import type { ColumnType, TemplateColumn } from "@/entities/project";

/** 테스트 세트의 항목. 프로젝트 기본 양식에서 복사한 뒤 따로 바뀐다. */
export type Column = Omit<TemplateColumn, "enabled">;

export type CellValue = string | boolean | string[] | null;

export interface TestCase {
  id: string;
  values: Record<string, CellValue>;
}

export interface TestSetAccess {
  canEdit: boolean;
  canRename: boolean;
  canDelete: boolean;
  canExport: boolean;
}

export interface TestSet {
  id: string;
  name: string;
  memo: string;
  project: { id: string; name: string };
  owner: { id: string; name: string };
  isPublic: boolean;
  version: number;
  access: TestSetAccess;
  columns: Column[];
  cases: TestCase[];
}

/** 공개 링크로 연 테스트 세트. 소유자는 이름만, 나는 계정이나 방문자다. */
export interface SharedTestSet extends Omit<TestSet, "owner"> {
  owner: { name: string };
  me: { kind: "account" | "visitor"; id: string; name: string };
}

export interface TestSetSummary {
  id: string;
  name: string;
  owner: { id: string; name: string };
  isPublic: boolean;
  caseCount: number;
  reviewCount: number;
  updatedAt: string;
}

export type TestSetFilter = "all" | "mine" | "shared";

/** 셀과 열 편집 연산. 공동 편집에서도 같은 모양을 쓴다. 같은 셀은 나중 값이 이긴다. */
export type CaseOp = SharedCaseOp;

/** 연산이 바꾸는 테스트 세트 내용. 열과 케이스를 함께 든다. */
export interface SheetState {
  columns: Column[];
  cases: TestCase[];
}

export interface ViewPreference {
  view: "table" | "card";
  groupByColumnId: string | null;
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
}

export const defaultView: ViewPreference = {
  view: "table",
  groupByColumnId: null,
  columnWidths: {},
  rowHeights: {},
};

/** 카드 열과 표 구역으로 묶을 수 있는 형식 */
/** 이어진 케이스에서 값이 같으면 한 칸으로 병합해 보이는 사전 정의 열 */
const MERGE_PRESET_KEYS = new Set([
  "test_env",
  "test_case",
  "title",
  "screen_id",
  "steps",
]);
export const mergeable = (column: Pick<Column, "presetKey">) =>
  column.presetKey !== null && MERGE_PRESET_KEYS.has(column.presetKey);

export const groupable = (type: ColumnType) =>
  type === "select" || type === "tags" || type === "checkbox";

/** 형식에 맞지 않는 값은 빈 값으로 본다 */
export function readCell(column: Column, value: CellValue | undefined) {
  switch (column.type) {
    case "checkbox":
      return value === true;
    case "tags":
      return Array.isArray(value)
        ? value.filter((v) => column.options.includes(v))
        : [];
    case "select":
      return typeof value === "string" && column.options.includes(value)
        ? value
        : null;
    default:
      return typeof value === "string" ? value : "";
  }
}

/** 복사, 검색, 붙여넣기에 쓰는 글자 표현 */
export function cellText(column: Column, value: CellValue | undefined) {
  const v = readCell(column, value);
  if (column.type === "checkbox") return v ? "예" : "";
  if (Array.isArray(v)) return v.join(", ");
  return typeof v === "string" ? v : "";
}

/** 붙여넣은 글자를 형식에 맞는 값으로 바꾼다. 맞지 않으면 undefined. */
export function parseCell(column: Column, text: string): CellValue | undefined {
  const t = text.trim();
  switch (column.type) {
    case "checkbox":
      if (!t || ["아니오", "false", "n", "x"].includes(t.toLowerCase()))
        return false;
      return ["예", "true", "y", "o", "v", "✓"].includes(t.toLowerCase())
        ? true
        : undefined;
    case "select":
      if (!t) return null;
      return column.options.includes(t) ? t : undefined;
    case "tags": {
      if (!t) return [];
      const tags = [...new Set(t.split(/[,\n]/).map((s) => s.trim()))].filter(
        Boolean,
      );
      return tags.every((tag) => column.options.includes(tag))
        ? tags
        : undefined;
    }
    default:
      return text;
  }
}

export const caseTitle = (testSet: Pick<TestSet, "columns">, c: TestCase) => {
  const title = testSet.columns.find((col) => col.systemKey === "title");
  return title ? cellText(title, c.values[title.id]) : "";
};

/** 서버 응답을 기다리지 않고 화면에 먼저 반영한다. 서버 결과가 오면 그것으로 덮는다. */
export function applyOps(state: SheetState, ops: CaseOp[]): SheetState {
  let next = state.cases;
  let columns = state.columns;
  for (const op of ops) {
    switch (op.type) {
      case "add_column": {
        if (columns.some((c) => c.id === op.columnId)) break;
        const added: Column = {
          id: op.columnId,
          systemKey: null,
          ...op.column,
        };
        const at =
          op.afterColumnId === null
            ? 0
            : columns.findIndex((c) => c.id === op.afterColumnId) + 1;
        columns = [...columns.slice(0, at), added, ...columns.slice(at)];
        break;
      }
      case "remove_column": {
        columns = columns.filter((c) => c.id !== op.columnId);
        next = next.map((c) => {
          if (!(op.columnId in c.values)) return c;
          const { [op.columnId]: _, ...values } = c.values;
          return { ...c, values };
        });
        break;
      }
      case "update_column":
        columns = columns.map((c) =>
          c.id === op.columnId
            ? { ...c, name: op.name, description: op.description }
            : c,
        );
        break;
      case "reorder_columns": {
        const byId = new Map(columns.map((c) => [c.id, c]));
        const ordered = op.columnIds
          .map((id) => byId.get(id))
          .filter((c): c is Column => c !== undefined);
        if (ordered.length === columns.length) columns = ordered;
        break;
      }
      case "set_cell":
        next = next.map((c) =>
          c.id === op.caseId
            ? { ...c, values: { ...c.values, [op.columnId]: op.value } }
            : c,
        );
        break;
      case "add_case": {
        if (next.some((c) => c.id === op.caseId)) break;
        const added = { id: op.caseId, values: { ...op.values } };
        const at =
          op.afterCaseId === null
            ? 0
            : next.findIndex((c) => c.id === op.afterCaseId) + 1;
        next = [...next.slice(0, at), added, ...next.slice(at)];
        break;
      }
      case "delete_cases": {
        const ids = new Set(op.caseIds);
        next = next.filter((c) => !ids.has(c.id));
        break;
      }
      case "move_case": {
        const moved = next.find((c) => c.id === op.caseId);
        if (!moved) break;
        const rest = next.filter((c) => c.id !== op.caseId);
        const at =
          op.afterCaseId === null
            ? 0
            : rest.findIndex((c) => c.id === op.afterCaseId) + 1;
        next = [...rest.slice(0, at), moved, ...rest.slice(at)];
        break;
      }
    }
  }
  return columns === state.columns && next === state.cases
    ? state
    : { columns, cases: next };
}

/** 서버가 돌려준 바뀐 케이스로 덮는다. 순서는 화면 순서를 지킨다. */
export function mergeCases(
  cases: TestCase[],
  changed: TestCase[],
  deletedIds: readonly string[] = [],
): TestCase[] {
  const byId = new Map(changed.map((c) => [c.id, c]));
  const deleted = new Set(deletedIds);
  return cases
    .filter((c) => !deleted.has(c.id))
    .map((c) => byId.get(c.id) ?? c);
}

/** 묶음 하나. value는 이 묶음에 놓인 케이스가 갖는 묶기 항목 값이다. 카드 보기의 열, 표 보기의 구역이 된다. */
export interface CaseGroup {
  key: string;
  label: string;
  value: CellValue;
  cases: TestCase[];
}

export function groupCases(
  group: Column | null,
  cases: TestCase[],
): CaseGroup[] {
  if (!group) return [{ key: "all", label: "모든 케이스", value: null, cases }];
  const groupValue = (c: TestCase) => readCell(group, c.values[group.id]);
  if (group.type === "checkbox")
    return [
      {
        key: "yes",
        label: "예",
        value: true,
        cases: cases.filter((c) => groupValue(c) === true),
      },
      {
        key: "no",
        label: "아니오",
        value: false,
        cases: cases.filter((c) => groupValue(c) !== true),
      },
    ];
  const lanes: CaseGroup[] = group.options.map((option) => ({
    key: `o:${option}`,
    label: option,
    value: group.type === "tags" ? [option] : option,
    cases: cases.filter((c) => {
      const v = groupValue(c);
      return Array.isArray(v) ? v.includes(option) : v === option;
    }),
  }));
  lanes.push({
    key: "none",
    label: group.type === "tags" ? "태그 없음" : "값 없음",
    value: group.type === "tags" ? [] : null,
    cases: cases.filter((c) => {
      const v = groupValue(c);
      return Array.isArray(v) ? v.length === 0 : v === null;
    }),
  });
  return lanes;
}
