import { array, object, text } from "../output-schema";
import type { StepDefinition } from "../types";
export const screens: StepDefinition = {
  key: "screens",
  displayStage: "screens",
  version: "screens-2",
  maxTokens: 36000,
  timeoutMs: 180000,
  retries: 2,
  prompt:
    "보드의 화면 문서와 이미지를 함께 살펴 화면 카드를 작성한다. 글자, 상태, 반복 구조, 연결선, 설명 번호를 보존한다. 보이지 않는 업무 규칙은 추측하지 않는다. frameId는 입력의 ID를 그대로 사용한다. 화면 설명은 이후 프레임이 삭제되어도 확인 필요 항목을 다시 작성할 수 있을 정도로 구체적으로 쓴다.",
  schema: () =>
    object({
      screens: array(
        object({
          frameId: text(36),
          name: text(1000),
          description: text(),
          features: array(text(2000)),
          uncertainties: array(text(2000)),
        }),
      ),
    }),
};
