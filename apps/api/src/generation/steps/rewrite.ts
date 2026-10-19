import { formSchema } from "../output-schema";
import type { StepDefinition } from "../types";
export const rewrite: StepDefinition = {
  key: "rewrite",
  displayStage: null,
  version: "rewrite-2",
  effort: "high",
  maxTokens: 12000,
  timeoutMs: 180000,
  retries: 2,
  prompt:
    "확인 필요 항목에 남긴 화면 설명, 질문과 사용자의 답변을 바탕으로 초안을 다시 작성한다. 같은 세트의 비슷한 케이스를 참고하고 양식의 형식과 선택 값을 지킨다. 새로운 업무 규칙을 만들지 않는다. 테스트 ID는 서버가 붙인다. 케이스 하나의 셀 값 객체만 출력한다.",
  schema: (input) => formSchema(input.columns),
};
