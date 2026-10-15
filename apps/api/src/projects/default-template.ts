import { randomUUID } from "node:crypto";
import type { TemplateColumn, TemplateView } from "../database/schema";

export const DEFAULT_COLUMN_WIDTH = 180;
const initialColumns = [
  ["caseCode", "케이스 번호"],
  ["title", "제목"],
  ["preconditions", "사전조건"],
  ["steps", "수행 단계"],
  ["expectedResult", "기대 결과"],
  ["priority", "우선순위"],
  ["relatedFrames", "관련 프레임"],
  ["screens", "IA 화면"],
] as const;
export function createDefaultTemplate(): {
  columns: TemplateColumn[];
  view: TemplateView[];
} {
  const columns: TemplateColumn[] = initialColumns.map(([field, name]) => ({
    id: randomUUID(),
    kind: "system",
    field,
    name,
  }));
  return {
    columns,
    view: columns.map((column) => ({
      columnId: column.id,
      width: DEFAULT_COLUMN_WIDTH,
    })),
  };
}
