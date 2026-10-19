import { caseSchema } from "../output-schema";
import type { StepDefinition } from "../types";
export const cases: StepDefinition = {
  key: "cases",
  displayStage: "cases",
  version: "cases-2",
  maxTokens: 32000,
  timeoutMs: 300000,
  retries: 2,
  prompt:
    "지정한 기능 그룹에 대해 사람이 직접 수행하는 QA 테스트 케이스를 작성한다. 실행 코드가 아니다. 양식 항목과 설명, 선택 값, 켜진 필수 케이스를 지킨다. 테스트 ID는 서버가 붙이므로 출력하지 않는다. 기존 케이스와 중복을 피하고 스타일 예시를 따른다. 화면이나 설명끼리 달라 예상 결과를 정할 수 없거나 핵심 규칙이 어디에도 없을 때만 확인 필요로 보낸다. 확인 필요에는 이유, 질문, 다시 작성에 쓸 화면 설명과 초안을 남긴다. coverage에는 필수 케이스별 반영 또는 해당 없음의 근거를 쓴다.",
  schema: caseSchema,
};
