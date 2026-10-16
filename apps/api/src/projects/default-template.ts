import { randomUUID } from "node:crypto";
import type { TemplateColumn, TemplateView } from "../database/schema";

export const DEFAULT_COLUMN_WIDTH = 180;
export function createDefaultTemplate(): {
  columns: TemplateColumn[];
  view: TemplateView[];
} {
  const columns: TemplateColumn[] = [
    { id: randomUUID(), kind: "system", field: "caseCode", name: "테스트 ID" },
    { id: randomUUID(), kind: "system", field: "title", name: "테스트 항목" },
  ];
  return {
    columns,
    view: columns.map((column) => ({
      columnId: column.id,
      width: column.field === "caseCode" ? 100 : 260,
    })),
  };
}
