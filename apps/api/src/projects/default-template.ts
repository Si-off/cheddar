import { randomUUID } from "node:crypto";
import type { TemplateColumn, TemplateView } from "../database/schema";

export const DEFAULT_COLUMN_WIDTH = 180;
const initialColumns = [
  ["caseCode", "테스트 ID"],
  ["title", "테스트 항목"],
  ["preconditions", "사전 조건"],
  ["steps", "수행 절차"],
  ["expectedResult", "예상 결과"],
  ["priority", "우선순위"],
  ["relatedFrames", "관련 화면"],
  ["screens", "화면 ID"],
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
  const group: TemplateColumn = {
    id: randomUUID(),
    kind: "custom",
    valueType: "text",
    name: "기능 구분",
  };
  const data: TemplateColumn = {
    id: randomUUID(),
    kind: "custom",
    valueType: "text",
    name: "테스트 데이터",
  };
  const find = (field: TemplateColumn["field"]) =>
    columns.find((c) => c.field === field) as TemplateColumn;
  const ordered = [
    find("caseCode"),
    group,
    find("title"),
    find("screens"),
    find("preconditions"),
    data,
    find("steps"),
    find("expectedResult"),
    find("priority"),
    find("relatedFrames"),
  ];
  return {
    columns: ordered,
    view: ordered.map((column) => ({
      columnId: column.id,
      width:
        column.field === "title"
          ? 260
          : column.field === "steps" || column.field === "expectedResult"
            ? 280
            : column.field === "caseCode"
              ? 100
              : DEFAULT_COLUMN_WIDTH,
    })),
  };
}
