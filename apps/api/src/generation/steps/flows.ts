import { array, object, text } from "../output-schema";
import type { StepDefinition } from "../types";
export const flows: StepDefinition = {
  key: "flows",
  displayStage: "flows",
  version: "flows-2",
  maxTokens: 20000,
  timeoutMs: 240000,
  retries: 2,
  prompt:
    "화면 카드와 화면 구조를 이용해 사용 흐름과 기능 지도를 만든다. 프로젝트 기능 그룹이 있으면 해당 ID를 key로 사용하고, 없으면 자료에 맞는 그룹 key를 만든다. 정상 완료와 분기, 취소, 화면 간 값 반영을 연결한다. 확인되지 않은 연결은 확정하지 않는다. 그룹마다 관련 화면 ID와 사람이 수행할 업무 흐름을 작성한다.",
  schema: () =>
    object({
      groups: {
        ...array(
          object({
            key: text(100),
            name: text(200),
            description: text(),
            screenIds: array(text(36)),
            flows: array(text(5000)),
          }),
        ),
        minItems: 1,
      },
    }),
};
