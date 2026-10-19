import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiError } from "../common/errors";
import {
  type TemplateColumnDto,
  UpdateTemplateDto,
} from "../contracts/project.dto";

const fail = (message: string): never => {
  throw new ApiError(400, "VALIDATION_FAILED", message);
};
export function validateTemplate(input: unknown): UpdateTemplateDto {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("양식의 입력 내용을 확인해주세요.");
  const dto = plainToInstance(UpdateTemplateDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    return fail("양식의 항목 수, 이름, 설명과 형식을 확인해주세요.");
  const keys = ["test_id", "title"];
  const names = ["테스트 ID", "제목"];
  const ids = new Set<string>();
  const columnNames = new Set<string>();
  for (const [index, column] of dto.columns.entries()) {
    if (
      index < 2
        ? column.systemKey !== keys[index] ||
          column.name !== names[index] ||
          column.type !== "text"
        : column.systemKey !== null
    )
      return fail(
        "테스트 ID와 제목은 양식의 처음 두 항목이며 이름과 형식을 바꿀 수 없습니다.",
      );
    const id = column.id.toLowerCase();
    if (ids.has(id)) return fail("같은 항목이 두 번 들어 있습니다.");
    if (columnNames.has(column.name))
      return fail("같은 이름의 항목이 있습니다.");
    ids.add(id);
    column.id = id;
    columnNames.add(column.name);
    if (column.type === "select" || column.type === "tags") {
      if (
        column.options.length < 1 ||
        column.options.length > 50 ||
        column.options.some((v) => v.length < 1 || v.length > 100) ||
        new Set(column.options).size !== column.options.length
      )
        return fail(
          "선택과 태그의 값은 1~50개이며 각 1~100자로 서로 달라야 합니다.",
        );
    } else column.options = [];
  }
  return dto;
}
export function defaultColumns(): TemplateColumnDto[] {
  return [
    "테스트 ID",
    "제목",
    "사전 조건",
    "수행 절차",
    "예상 결과",
    "우선순위",
  ].map((name, index) => ({
    id: randomUUID(),
    name,
    systemKey: index === 0 ? "test_id" : index === 1 ? "title" : null,
    type: index === 5 ? "select" : "text",
    description: "",
    options: index === 5 ? ["높음", "보통", "낮음"] : [],
  }));
}
export const DEFAULT_REQUIRED_CASES = [
  "화면 진입과 첫 상태",
  "입력마다 필수 여부, 형식, 길이 경계",
  "버튼 활성 조건",
  "목록의 검색, 필터, 정렬, 페이지, 결과 없음",
  "오류 표시",
  "팝업과 모달 열기와 닫기",
  "권한이나 상태에 따라 다르게 보이는 요소",
  "업무를 처음부터 끝까지 정상 완료",
  "업무 중 분기마다 하나",
  "중간 취소와 뒤로 가기",
  "입력하거나 바꾼 값이 다른 화면과 목록에 반영되는지",
  "Figma에 변경 표시가 있는 요소",
];
