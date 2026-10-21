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
  parentId: string | null;
  description: string;
}

export interface Memo {
  body: string;
  updatedAt: string | null;
  updatedBy: { id: string; name: string } | null;
}
