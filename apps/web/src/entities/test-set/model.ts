import {
  type CellImage,
  isCellImage,
  type OptionColor,
  type CaseOp as SharedCaseOp,
  type CellValue as SharedCellValue,
} from "@workspace/contracts";
import type { ColumnType, TemplateColumn } from "@/entities/project";

export type { CellImage, OptionColor };
export { isCellImage };

/** 테스트 세트의 항목. 프로젝트 기본 양식에서 복사한 뒤 따로 바뀐다. */
export type Column = Omit<TemplateColumn, "enabled"> & {
  /** 항목 이름별 칩 색. 없는 항목은 회색이다. */
  colors?: Record<string, OptionColor>;
};

/** 텍스트 열의 셀에는 글자 대신 이미지 한 장을 넣을 수 있다. */
export type CellValue = SharedCellValue;

export interface TestCase {
  id: string;
  values: Record<string, CellValue>;
  /** 이 케이스의 기능 그룹. 캔버스의 기본 그룹화에 쓴다. 표와 XLSX에는 나오지 않는다. */
  featureGroupId?: string | null;
}

/** 프로젝트의 기능 그룹(순서대로) */
export interface FeatureGroupRef {
  id: string;
  name: string;
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
  featureGroups?: FeatureGroupRef[];
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

export type TestSetFilter = "all" | "mine";

/** 셀과 열 편집 연산. 공동 편집에서도 같은 모양을 쓴다. 같은 셀은 나중 값이 이긴다. */
export type CaseOp = SharedCaseOp;

/** 연산이 바꾸는 테스트 세트 내용. 열과 케이스를 함께 든다. */
export interface SheetState {
  columns: Column[];
  cases: TestCase[];
}

export interface ViewPreference {
  view: "table" | "canvas";
  /** 캔버스를 무엇으로 나눌지. column이면 groupByColumnId의 값으로 나눈다. */
  canvasGroup: "feature" | "column" | "none";
  groupByColumnId: string | null;
  /** 캔버스 카드에 보일 내용. 간략은 ID와 제목, 상세는 모든 열 */
  canvasDensity: "brief" | "detail";
  columnWidths: Record<string, number>;
  rowHeights: Record<string, number>;
}

export const defaultView: ViewPreference = {
  view: "table",
  canvasGroup: "feature",
  groupByColumnId: null,
  canvasDensity: "brief",
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
/**
 * 병합이 끊기면 뒤쪽 병합 열도 함께 끊기는 열. 현업 시트처럼 제목, 화면 ID, 수행 절차는
 * 같은 테스트 케이스 안에서 서로의 경계를 넘어 병합된다.
 */
export const mergeBounds = (column: Pick<Column, "presetKey">) =>
  column.presetKey === "test_env" || column.presetKey === "test_case";

export const groupable = (type: ColumnType) =>
  type === "select" || type === "tags" || type === "checkbox";

/** 항목의 칩 색 */
export const optionColor = (
  column: Pick<Column, "colors">,
  option: string,
): OptionColor => column.colors?.[option] ?? "gray";

/** 셀에 든 이미지. 텍스트 열에서만 읽는다. */
export const cellImage = (column: Pick<Column, "type">, value: unknown) =>
  column.type === "text" && isCellImage(value) ? value : null;

/** 형식에 맞지 않는 값은 빈 값으로 본다. 선택과 태그는 스프레드시트처럼 목록에 없는 값도 그대로 읽는다. */
export function readCell(column: Column, value: CellValue | undefined) {
  switch (column.type) {
    case "checkbox":
      return value === true;
    case "tags":
      return Array.isArray(value) ? value : [];
    case "select":
      return typeof value === "string" && value ? value : null;
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

/** 셀에 값이 있는지. 이미지만 든 셀도 값이 있다. */
export const hasValue = (column: Column, value: CellValue | undefined) =>
  cellImage(column, value) !== null || cellText(column, value) !== "";

/** 두 값이 사람이 보기에 같은지. 이미지는 글자로 비교하면 모두 빈칸이라 이미지 id로 비교한다. */
export function sameValue(
  column: Column,
  a: CellValue | undefined,
  b: CellValue | undefined,
) {
  const ia = cellImage(column, a);
  const ib = cellImage(column, b);
  if (ia || ib) return ia?.image === ib?.image;
  return cellText(column, a) === cellText(column, b);
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
    // 선택과 태그는 스프레드시트의 목록처럼 목록에 없는 값도 그대로 넣는다.
    case "select":
      return t || null;
    case "tags":
      return [...new Set(t.split(/[,\n]/).map((s) => s.trim()))].filter(
        Boolean,
      );
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
            ? {
                ...c,
                name: op.name,
                description: op.description,
                type: op.columnType ?? c.type,
                options: op.options ?? c.options,
                colors: op.colors ?? c.colors,
              }
            : c,
        );
        // 드롭다운으로 바꾼 열의 이미지는 선택 값이 될 수 없어 비운다
        if (op.columnType)
          next = next.map((c) =>
            isCellImage(c.values[op.columnId])
              ? { ...c, values: { ...c.values, [op.columnId]: null } }
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
        // 기능 그룹을 주지 않으면 바로 앞 케이스를 따른다(서버와 같다)
        const featureGroupId =
          op.featureGroupId !== undefined
            ? op.featureGroupId
            : (next.find((c) => c.id === op.afterCaseId)?.featureGroupId ??
              null);
        const added = {
          id: op.caseId,
          values: { ...op.values },
          featureGroupId,
        };
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
      case "set_feature_group":
        next = next.map((c) =>
          c.id === op.caseId ? { ...c, featureGroupId: op.featureGroupId } : c,
        );
        break;
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

/** 형식별 빈 값 */
export const emptyValue = (column: Pick<Column, "type">): CellValue =>
  column.type === "checkbox"
    ? false
    : column.type === "tags"
      ? []
      : column.type === "select"
        ? null
        : "";

/** 되돌릴 때 그 셀이 아직 이 값이어야 한다(그 사이 다른 사람이 바꾸지 않았는지 확인한다) */
export interface CellExpectation {
  caseId: string;
  columnId: string;
  value: CellValue;
}

export interface Reversal {
  ops: CaseOp[];
  expect: CellExpectation[];
  /** 되돌릴 때 그 케이스가 아직 이 기능 그룹이어야 한다 */
  expectGroup?: { caseId: string; featureGroupId: string | null }[];
}

/**
 * 연산을 되돌리는 연산. 셀 값과 케이스 추가·삭제·이동만 되돌리고 열 연산은 되돌리지 않는다.
 * 지운 케이스는 같은 ID와 값(테스트 ID 포함)으로 원래 자리에 다시 넣는다.
 */
export function invertOps(state: SheetState, ops: CaseOp[]): Reversal {
  let work = state;
  const groups: CaseOp[][] = [];
  const expect: CellExpectation[] = [];
  const expectGroup: NonNullable<Reversal["expectGroup"]> = [];
  for (const op of ops) {
    const inverse: CaseOp[] = [];
    if (op.type === "set_cell") {
      const target = work.cases.find((c) => c.id === op.caseId);
      const column = work.columns.find((c) => c.id === op.columnId);
      if (target && column) {
        inverse.push({
          type: "set_cell",
          caseId: op.caseId,
          columnId: op.columnId,
          value: target.values[op.columnId] ?? emptyValue(column),
        });
        expect.push({
          caseId: op.caseId,
          columnId: op.columnId,
          value: op.value,
        });
      }
    } else if (op.type === "add_case") {
      inverse.push({ type: "delete_cases", caseIds: [op.caseId] });
    } else if (op.type === "delete_cases") {
      const ids = new Set(op.caseIds);
      work.cases.forEach((c, index) => {
        if (!ids.has(c.id)) return;
        inverse.push({
          type: "add_case",
          caseId: c.id,
          afterCaseId: work.cases[index - 1]?.id ?? null,
          values: c.values,
          featureGroupId: c.featureGroupId ?? null,
        });
      });
    } else if (op.type === "set_feature_group") {
      const target = work.cases.find((c) => c.id === op.caseId);
      if (target) {
        inverse.push({
          type: "set_feature_group",
          caseId: op.caseId,
          featureGroupId: target.featureGroupId ?? null,
        });
        expectGroup.push({
          caseId: op.caseId,
          featureGroupId: op.featureGroupId,
        });
      }
    } else if (op.type === "move_case") {
      const index = work.cases.findIndex((c) => c.id === op.caseId);
      if (index >= 0)
        inverse.push({
          type: "move_case",
          caseId: op.caseId,
          afterCaseId: work.cases[index - 1]?.id ?? null,
        });
    }
    groups.unshift(inverse);
    work = applyOps(work, [op]);
  }
  return { ops: groups.flat(), expect, expectGroup };
}

/** 기능 그룹별 묶음. 프로젝트 순서를 따르고, 그룹이 없거나 지워진 그룹의 케이스는 맨 뒤 "미분류"에 모은다. */
export function groupByFeature(
  featureGroups: readonly FeatureGroupRef[],
  cases: TestCase[],
): {
  key: string;
  label: string;
  featureGroupId: string | null;
  cases: TestCase[];
}[] {
  const known = new Set(featureGroups.map((g) => g.id));
  const lanes = featureGroups.map((g) => ({
    key: g.id,
    label: g.name,
    featureGroupId: g.id as string | null,
    cases: cases.filter((c) => c.featureGroupId === g.id),
  }));
  const rest = cases.filter(
    (c) => !c.featureGroupId || !known.has(c.featureGroupId),
  );
  if (rest.length > 0 || lanes.length === 0)
    lanes.push({
      key: "none",
      label: "미분류",
      featureGroupId: null,
      cases: rest,
    });
  return lanes;
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
  // 목록에 없는 값(붙여넣기, 항목 변경 뒤 남은 값)도 사라지지 않게 목록 항목 뒤에 구역을 둔다.
  const extra = [
    ...new Set(
      cases.flatMap((c) => {
        const v = groupValue(c);
        return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
      }),
    ),
  ].filter((v) => !group.options.includes(v));
  const lanes: CaseGroup[] = [...group.options, ...extra].map((option) => ({
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
