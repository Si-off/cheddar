import type { CellValue, TestSetColumnDto } from "../../contracts/test-set.dto";

export const QA_RECORD_KEYS = [
  "qa_result",
  "qa_owner",
  "result_comment",
  "dev_status",
  "dev_owner",
];
export const isQaRecord = (column: TestSetColumnDto) =>
  column.presetKey !== null && QA_RECORD_KEYS.includes(column.presetKey);
export const isAiColumn = (column: TestSetColumnDto) =>
  column.systemKey !== "test_id" && !isQaRecord(column);
export const emptyCell = (column: TestSetColumnDto): CellValue =>
  column.type === "checkbox"
    ? false
    : column.type === "tags"
      ? []
      : column.type === "select"
        ? null
        : "";
export const isEmptyCell = (value: CellValue | undefined) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (Array.isArray(value) && value.length === 0);
