import { caseSchema } from "../output-schema";
import type { StepDefinition } from "../types";
export const finish: StepDefinition = {
  key: "finish",
  displayStage: "finish",
  version: "finish-3",
  maxTokens: 96000,
  timeoutMs: 300000,
  retries: 2,
  prompt:
    "그룹별 초안을 모아 점검 관점와 하나씩 대조한다. 해당 요소가 있을 때 누락된 케이스를 보충하고 해당 없으면 coverage에 이유를 쓴다. 기존 케이스와 초안 사이의 의미상 중복을 합치고 mergedCount에 합친 수를 기록한다. 양식과 선택 값을 검증한다. 모호함만으로 확인 필요를 늘리지 않는다. 모든 점검 관점 ID를 coverage에 한 번씩 포함한다. 최종 케이스와 확인 필요를 한 번에 출력한다. 테스트 ID와 QA 기록 열은 출력하지 않는다. 해당 요소가 없으면 건너뛴다. 열 작성 규칙과 행 나누기 기준을 유지한다.",
  schema: caseSchema,
};
