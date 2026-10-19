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
  /** 테스트 ID와 제목은 지우거나 이름과 형식을 바꿀 수 없다 */
  systemKey: "test_id" | "title" | null;
  name: string;
  type: ColumnType;
  description: string;
  options: string[];
}

export interface Template {
  revision: number;
  columns: TemplateColumn[];
}

export interface FeatureGroup {
  id: string;
  name: string;
  description: string;
}

export interface RequiredCase {
  id: string;
  description: string;
  enabled: boolean;
  /** 기본 필수 케이스는 끌 수만 있고 지우거나 고칠 수 없다 */
  isDefault: boolean;
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
