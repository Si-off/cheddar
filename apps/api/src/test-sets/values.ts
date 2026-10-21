import { plainToInstance } from "class-transformer";
import { isUUID, validateSync } from "class-validator";
import { ApiError } from "../common/errors";
import type { TestSetColumnDto } from "../contracts/test-set.dto";
import {
  AddCaseOpDto,
  AddColumnOpDto,
  ApplyOpsDto,
  type CaseOp,
  type CellValue,
  DeleteCasesOpDto,
  MoveCaseOpDto,
  RemoveColumnOpDto,
  ReorderColumnsOpDto,
  SetCellOpDto,
  TestSetViewDto,
  UpdateColumnOpDto,
} from "../contracts/test-set.dto";

export const validationFailed = (
  message = "입력 내용을 확인해주세요.",
): never => {
  throw new ApiError(400, "VALIDATION_FAILED", message);
};
export function validateCell(
  column: TestSetColumnDto,
  value: unknown,
): CellValue {
  if (
    column.type === "text" &&
    typeof value === "string" &&
    value.length > 20000
  )
    return validationFailed("텍스트는 20,000자 이하로 입력하세요.");
  // 선택과 태그는 Excel의 목록처럼 목록에 없는 값도 받는다(붙여넣기, 항목 변경 뒤 남은 값).
  // AI 생성은 출력 스키마가 목록으로 제한한다.
  const valid =
    column.type === "text"
      ? typeof value === "string" && value.length <= 20000
      : column.type === "checkbox"
        ? typeof value === "boolean"
        : column.type === "select"
          ? value === null ||
            (typeof value === "string" && value.length <= 20000)
          : Array.isArray(value) &&
            value.every((v) => typeof v === "string") &&
            value.join(", ").length <= 20000 &&
            new Set(value).size === value.length;
  if (!valid)
    return validationFailed("항목의 형식과 선택 값에 맞게 입력해주세요.");
  return value as CellValue;
}
// 양식 변경 때 유효한 값만 보존한다. 텍스트 변환은 XLSX에도 같은 표기를 쓴다.
export function cellText(value: CellValue | undefined): string {
  return value === true
    ? "예"
    : value === false || value == null
      ? ""
      : Array.isArray(value)
        ? value.join(", ")
        : value;
}
export function reconcileValue(
  column: TestSetColumnDto,
  value: CellValue,
): CellValue | undefined {
  if (column.type === "text") {
    const text = cellText(value);
    return text.length <= 20000 ? text : undefined;
  }
  try {
    return validateCell(
      column,
      column.type === "tags" && Array.isArray(value)
        ? [...new Set(value)]
        : value,
    );
  } catch {
    return undefined;
  }
}
export function normalizeValues(values: unknown): Record<string, CellValue> {
  if (!values || typeof values !== "object" || Array.isArray(values))
    return validationFailed("셀 값을 확인해주세요.");
  const entries = Object.entries(values);
  const ids = entries.map(([id]) => id.toLowerCase());
  if (entries.some(([id]) => !isUUID(id)) || new Set(ids).size !== ids.length)
    return validationFailed("항목을 확인해주세요.");
  return Object.fromEntries(entries.map(([id, v]) => [id.toLowerCase(), v]));
}
export function validateOps(input: unknown): CaseOp[] {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return validationFailed("편집 내용을 확인해주세요.");
  const dto = plainToInstance(ApplyOpsDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    return validationFailed("편집 내용을 확인해주세요.");
  return dto.ops.map((input) => {
    if (!input || typeof input !== "object" || Array.isArray(input))
      return validationFailed("편집 내용을 확인해주세요.");
    const type = new Map<string, new () => CaseOp>([
      ["add_column", AddColumnOpDto],
      ["update_column", UpdateColumnOpDto],
      ["remove_column", RemoveColumnOpDto],
      ["reorder_columns", ReorderColumnsOpDto],
      ["set_cell", SetCellOpDto],
      ["add_case", AddCaseOpDto],
      ["delete_cases", DeleteCasesOpDto],
      ["move_case", MoveCaseOpDto],
    ]).get(input.type);
    if (!type) return validationFailed("편집 종류를 확인해주세요.");
    const op = plainToInstance(type as new () => CaseOp, input);
    if (
      validateSync(op, { whitelist: true, forbidNonWhitelisted: true }).length
    )
      return validationFailed("편집 내용을 확인해주세요.");
    if (op.type === "reorder_columns")
      op.columnIds = op.columnIds.map((id) => id.toLowerCase());
    else if (
      op.type === "add_column" ||
      op.type === "remove_column" ||
      op.type === "update_column"
    ) {
      op.columnId = op.columnId.toLowerCase();
      if (op.type === "add_column")
        op.afterColumnId = op.afterColumnId?.toLowerCase() ?? null;
    } else if (op.type === "delete_cases")
      op.caseIds = op.caseIds.map((id) => id.toLowerCase());
    else {
      op.caseId = op.caseId.toLowerCase();
      if (op.type === "set_cell") op.columnId = op.columnId.toLowerCase();
      else op.afterCaseId = op.afterCaseId?.toLowerCase() ?? null;
      if (op.type === "add_case" && op.values !== undefined)
        op.values = normalizeValues(op.values);
    }
    return op;
  });
}
export function validateView(input: unknown): TestSetViewDto {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return validationFailed("보기 설정을 확인해주세요.");
  const dto = plainToInstance(TestSetViewDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    return validationFailed("보기 설정을 확인해주세요.");
  for (const [key, min] of [
    ["columnWidths", 40],
    ["rowHeights", 24],
  ] as const) {
    if (
      Object.entries(dto[key]).some(
        ([id, size]) =>
          !isUUID(id) || !Number.isInteger(size) || size < min || size > 2000,
      )
    )
      return validationFailed(
        "열 너비와 행 높이를 허용 범위의 정수로 입력해주세요.",
      );
    dto[key] = Object.fromEntries(
      Object.entries(dto[key]).map(([id, size]) => [id.toLowerCase(), size]),
    );
  }
  dto.groupByColumnId = dto.groupByColumnId?.toLowerCase() ?? null;
  return dto;
}
export function testIdNumber(value: CellValue | undefined): bigint {
  return typeof value === "string" && /^TC-\d+$/.test(value)
    ? BigInt(value.slice(3))
    : 0n;
}
