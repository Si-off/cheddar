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
  const columns: Omit<TemplateColumnDto, "id" | "systemKey">[] = [
    {
      name: "테스트 ID",
      type: "text",
      description: "각 테스트 케이스를 구분하는 번호입니다.",
      options: [],
    },
    {
      name: "제목",
      type: "text",
      description: "확인할 작업이나 조건을 한 문장으로 적습니다.",
      options: [],
    },
    {
      name: "테스트 환경",
      type: "text",
      description:
        "앱, 웹, 관리자 화면 등 테스트할 환경을 적습니다. 확인되지 않은 환경은 비워둡니다.",
      options: [],
    },
    {
      name: "테스트 케이스",
      type: "text",
      description: "테스트 대상 화면과 확인할 기능을 적습니다.",
      options: [],
    },
    {
      name: "사용자/관리자",
      type: "select",
      description:
        "테스트를 수행할 계정 유형을 고릅니다. 확인되지 않으면 비워둡니다.",
      options: ["사용자", "관리자"],
    },
    {
      name: "화면 ID 또는 URL",
      type: "text",
      description:
        "제공된 화면 ID나 화면 주소를 적습니다. 확인되지 않은 값은 만들지 않고 비워둡니다.",
      options: [],
    },
    {
      name: "수행 절차",
      type: "text",
      description:
        "시작 화면과 필요한 사전 조건을 포함해 수행할 행동을 번호 순서로 적습니다.",
      options: [],
    },
    {
      name: "예상 결과",
      type: "text",
      description:
        "절차를 수행했을 때 확인할 화면, 문구, 상태와 동작을 구체적으로 적습니다.",
      options: [],
    },
    {
      name: "QA 결과",
      type: "select",
      description:
        "실제 테스트 후 결과를 고릅니다. 테스트를 수행하기 전에는 비워둡니다.",
      options: ["Pass", "Fail", "Deferred", "N/A", "-", "추가 요청"],
    },
    {
      name: "QA 담당자",
      type: "text",
      description:
        "배정된 QA 담당자를 적습니다. 담당자가 정해지지 않았으면 비워둡니다.",
      options: [],
    },
    {
      name: "결과 및 의견",
      type: "text",
      description:
        "실제 테스트에서 확인한 결과와 의견을 적습니다. 테스트를 수행하기 전에는 비워둡니다.",
      options: [],
    },
    {
      name: "개발 진행 상태",
      type: "select",
      description:
        "개발 작업의 현재 상태를 고릅니다. 확인되지 않은 상태는 비워둡니다.",
      options: ["완료", "수정중", "수정 완료", "보류", "기타", "-"],
    },
    {
      name: "개발 담당자",
      type: "text",
      description:
        "배정된 개발 담당자를 적습니다. 담당자가 정해지지 않았으면 비워둡니다.",
      options: [],
    },
    {
      name: "추가 정보",
      type: "text",
      description:
        "해당 테스트 케이스에 필요한 참고 사항을 적습니다. 참고 사항이 없으면 비워둡니다.",
      options: [],
    },
  ];
  return columns.map((column, index) => ({
    ...column,
    id: randomUUID(),
    systemKey: index === 0 ? "test_id" : index === 1 ? "title" : null,
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
