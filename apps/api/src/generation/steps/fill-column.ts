import { guideOf } from "../guides";
import { formSchema, object } from "../output-schema";
import type { StepDefinition } from "../types";
import { rewrite } from "./rewrite";

// 다시 작성과 같은 실행 단계·모델·재시도 정책을 사용한다.
export const fillColumn: StepDefinition = {
  ...rewrite,
  version: "fill-column-1",
  prompt:
    "모든 케이스의 다른 열 값, 프로젝트 메모와 화면 구조를 참고해 대상 열의 빈 셀만 작성한다. 대상 열의 이름·형식·선택 값·작성 기준과 사전 정의 규칙을 따른다. 자료에 근거가 없으면 빈 값을 출력한다. 이미 값이 있는 셀은 그대로 둔다. 확인 필요 항목은 만들지 않는다. 케이스 ID를 키로, 대상 열의 값을 값으로 하는 객체만 출력한다.",
  schema: (input) => {
    if (!input.fillColumn) throw new Error("대상 열이 없습니다.");
    const cell = formSchema([input.fillColumn], guideOf(input)).properties?.[
      input.fillColumn.id
    ];
    if (!cell) throw new Error("AI로 작성할 수 없는 열입니다.");
    return object(
      Object.fromEntries(input.existingCases.map((c) => [c.id, cell])),
    );
  },
};
