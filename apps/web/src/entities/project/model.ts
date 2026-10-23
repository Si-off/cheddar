export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  columnCount: number;
  screenCount: number;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  /** 설정을 바꿀 수 있는지(그 프로젝트의 프로젝트 설정 관리 권한) */
  canManage: boolean;
}

export type ColumnType = "text" | "select" | "checkbox" | "tags";

export const columnTypeLabel: Record<ColumnType, string> = {
  text: "텍스트",
  select: "단일 선택",
  checkbox: "체크박스",
  tags: "태그",
};

/** 값 목록을 미리 정하는 형식. AI는 이 목록에서만 고른다. */
export const hasOptions = (type: ColumnType) =>
  type === "select" || type === "tags";

export interface TemplateColumn {
  id: string;
  /** 사전 정의 열의 고정 키. 사용자 열은 null */
  presetKey: string | null;
  /** 테스트 ID와 제목은 지우거나 이름과 형식을 바꿀 수 없다 */
  systemKey: "test_id" | "title" | null;
  /** 양식에서 켜진 열만 새 테스트 세트에 들어간다 */
  enabled: boolean;
  name: string;
  type: ColumnType;
  description: string;
  options: string[];
}

/** 사전 정의 열 중 AI가 Figma 자료에서 채우는 열. 나머지 사전 정의 열은 QA 중에 사람이 기록한다. */
const AI_PRESET_KEYS = new Set([
  "test_id",
  "test_env",
  "test_case",
  "title",
  "user_role",
  "screen_id",
  "steps",
  "expected",
]);

export type ColumnGroup = "ai" | "qa" | "custom";

export const columnGroup = (column: Pick<TemplateColumn, "presetKey">) =>
  column.presetKey === null
    ? "custom"
    : AI_PRESET_KEYS.has(column.presetKey)
      ? "ai"
      : "qa";

export const columnGroupLabel: Record<ColumnGroup, string> = {
  ai: "AI 작성 열",
  qa: "QA 기록 열",
  custom: "사용자 열",
};

export interface Template {
  revision: number;
  columns: TemplateColumn[];
}

export interface FeatureGroup {
  id: string;
  name: string;
  description: string;
}

export interface Screen {
  id: string;
  screenId: string;
  name: string;
  type: ScreenType;
  parentId: string | null;
  description: string;
  /** 프로젝트에 규칙이 있는데 어느 규칙에도 맞지 않는 ID */
  ruleMismatch: boolean;
}

export interface Memo {
  body: string;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}

export type ScreenType = "page" | "popup" | "bottom_sheet" | "tab";

export const screenTypeLabel: Record<ScreenType, string> = {
  page: "페이지",
  popup: "팝업",
  bottom_sheet: "바텀시트",
  tab: "탭",
};

export type ScreenIdPartKind = "list" | "fixed" | "number";

export const screenIdPartKindLabel: Record<ScreenIdPartKind, string> = {
  list: "코드 목록",
  fixed: "고정값",
  number: "번호",
};

export interface ScreenIdRulePart {
  name: string;
  kind: ScreenIdPartKind;
  /** 코드 목록일 때 쓸 수 있는 값 */
  codes: { code: string; meaning: string }[];
  /** 고정값 */
  value: string;
  /** 번호 자릿수 */
  digits: number;
}

export interface ScreenIdRule {
  id: string;
  name: string;
  separator: string;
  parts: ScreenIdRulePart[];
  /** 서버가 계산한 예시 ID */
  example: string;
}

export type ScreenIdRuleInput = Omit<ScreenIdRule, "id" | "example">;

/** 부분마다 대표값(첫 코드, 고정값, 1을 자릿수로 채운 번호)을 보여주는 예시 */
export function screenIdExampleParts(rule: Pick<ScreenIdRule, "parts">) {
  return rule.parts.map((part) =>
    part.kind === "list"
      ? (part.codes[0]?.code ?? "")
      : part.kind === "fixed"
        ? part.value
        : "1".padStart(Math.max(1, part.digits), "0"),
  );
}

/** 자료에서 AI가 찾은 규칙. 저장하기 전 초안이다. */
export type ScreenIdRuleDraft = ScreenIdRuleInput & { example: string };

/** 자료에서 찾은 화면. 저장하기 전 초안이며 key로 상위 초안을 가리킨다. */
export interface ScreenDraft {
  key: string;
  screenId: string;
  name: string;
  type: ScreenType;
  parentKey: string | null;
  description: string;
  /** 결과 확인에서 묶는 이름(엑셀은 모듈) */
  group: string;
  /** 같은 화면 ID가 프로젝트에 이미 있다 */
  exists: boolean;
  ruleMismatch: boolean;
}

/** 화면 ID 규칙과 화면을 만들 때 넣을 수 있는 자료 */
export const screenSourceAccept = ".xlsx,.csv,.tsv,.txt,.md,.png,.jpg,.jpeg";
