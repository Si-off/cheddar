import { caseSchema } from "../output-schema";
import type { StepDefinition } from "../types";
export const cases: StepDefinition = {
  key: "cases",
  displayStage: "cases",
  version: "cases-3",
  maxTokens: 96000,
  timeoutMs: 300000,
  retries: 2,
  prompt:
    "지정한 기능 그룹에 대해 사람이 직접 수행하는 QA 테스트 케이스를 작성한다. 실행 코드가 아니다. 양식 항목과 설명, 선택 값, 점검 관점를 지킨다. 테스트 ID는 서버가 붙이므로 출력하지 않는다. 기존 케이스와 중복을 피하고 스타일 예시를 따른다. 화면이나 설명끼리 달라 예상 결과를 정할 수 없거나 핵심 규칙이 어디에도 없을 때만 확인 필요로 보낸다. 확인 필요에는 이유, 질문, 다시 작성에 쓸 화면 설명과 초안을 남긴다. coverage에는 점검 관점 ID별 반영 또는 해당 없음의 근거를 쓴다. 해당 요소가 없으면 건너뛴다. 수행자의 행동·입력값·사전 조건이 달라지면 새 행으로 나눈다. 같은 행동 뒤 같은 화면에서 여러 가지를 볼 때는 한 셀에 불릿으로 묶는다. 같은 절차에서 결과만 갈리면 행을 나누고 수행 절차는 같은 값으로 둔다. 테스트 환경 열이 있으면 환경에 따라 동작이 다른 케이스만 환경별 행으로 반복하고 나머지는 환경을 공통으로 쓴다. 사전 정의 열 작성 규칙과 예시를 따른다. 사용자 열은 자료에 근거가 없으면 비운다. QA 기록 열은 작성하지 않는다.",
  schema: caseSchema,
};
