/** 점검 관점. 해당 요소가 있을 때 빠지면 안 되는 QA 확인의 종류다. */
export type Viewpoint = {
  id: string;
  name: string;
  when: string;
  /** 관리자 화면이 있을 때만 대상이다. */
  admin?: boolean;
};
/** 케이스를 시나리오, 하위 시나리오, 행, 셀로 나누는 기준 하나. */
export type DecompositionRule = {
  id: string;
  level: "scenario" | "case" | "row" | "cell";
  rule: string;
};
/**
 * 작성 지침. 현업 시트에서 뽑은 QA 판단을 묶어 실험 단위로 바꾼다.
 * 출력 형식처럼 스키마에 묶인 실행 규약은 단계 정의(steps)에 둔다.
 */
export type Guide = {
  id: string;
  /** 사전 정의 열(presetKey)별 작성 기준. */
  columns: Readonly<Record<string, string>>;
  viewpoints: readonly Viewpoint[];
  decomposition: readonly DecompositionRule[];
};
