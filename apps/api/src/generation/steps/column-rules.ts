import type { CellValue, TestSetColumnDto } from "../../contracts/test-set.dto";

export const QA_RECORD_KEYS = [
  "qa_result",
  "qa_owner",
  "result_comment",
  "dev_status",
  "dev_owner",
];
export const COLUMN_RULES: Record<string, string> = {
  test_env:
    '테스트 환경을 쓴다. 환경별로 같은 케이스를 반복할 때 사용한다. 예: "Android", "PC Web". iOS와 Mobile Web도 환경 값으로 쓸 수 있다.',
  test_case:
    '기능 단위 묶음 이름을 쓴다. 예: "회원가입 > 이메일 인증", "주문 > 결제".',
  title:
    '한 문장으로 확인 사항을 쓰고 "~한다/~된다"로 끝낸다. 예: "이메일 형식이 아니면 가입 버튼이 비활성된다", "인증에 성공하면 가입 화면으로 이동한다".',
  user_role:
    '테스트 수행자의 상태를 쓴다. 예: "비회원", "회원(인증 전)". 관리자 수행이면 "관리자"로 쓴다.',
  screen_id:
    '화면 구조에 있는 ID만 쓴다. 없으면 "추후 채번"으로 쓴다. 화면 ID 규칙으로 ID를 만들지 않는다. 예: 화면 구조의 ID가 "LOGIN-01"이면 "LOGIN-01", 없으면 "추후 채번".',
  steps:
    '수행자의 행동만 번호 목록으로 쓴다. 결과를 섞지 않는다. 예: "1. 이메일을 입력한다.\n2. 가입 버튼을 누른다."',
  expected:
    '확인할 결과를 쓴다. 여러 결과면 "- " 불릿으로 쓴다. 예: "- 완료 안내가 표시된다.\n- 가입 화면으로 이동한다."',
  extra:
    '사전 조건과 테스트 데이터를 쓴다. 없으면 빈 값으로 둔다. 예: "미인증 회원으로 로그인", "이메일: test@example.com".',
};
export const isQaRecord = (column: TestSetColumnDto) =>
  column.presetKey !== null && QA_RECORD_KEYS.includes(column.presetKey);
export const isAiColumn = (column: TestSetColumnDto) =>
  column.systemKey !== "test_id" && !isQaRecord(column);
export const columnRule = (column: TestSetColumnDto) =>
  column.presetKey === null
    ? `${column.name} (${column.type}): ${column.description}. 자료에 근거가 없으면 빈 값으로 둔다.`
    : (COLUMN_RULES[column.presetKey] ?? column.description);
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
