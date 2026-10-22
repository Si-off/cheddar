import type { CellValue, TestSetColumnDto } from "../contracts/test-set.dto";
import { isAiColumn } from "./steps/column-rules";
import type { CaseOutput, Draft, ScenarioOutput } from "./types";

// 시나리오와 하위 시나리오 이름을 담는 열. 펼칠 때 같은 값을 반복해 표가 병합으로 그린다.
export function scenarioColumns(columns: TestSetColumnDto[]) {
  const text = (match: (c: TestSetColumnDto) => boolean) =>
    columns.find((c) => isAiColumn(c) && c.type === "text" && match(c));
  return {
    testCase: text((c) => c.presetKey === "test_case"),
    title: text((c) => c.systemKey === "title"),
    steps: text((c) => c.presetKey === "steps"),
  };
}

/** 수행 절차가 null인 행은 같은 시나리오의 바로 윗행 절차를 쓴다. */
export function flattenScenarios(
  columns: TestSetColumnDto[],
  output: ScenarioOutput | CaseOutput,
): CaseOutput {
  // 이전 작업이 저장한 출력은 이미 행 목록이다.
  if (!("scenarios" in output)) return output;
  const { testCase, title, steps } = scenarioColumns(columns);
  const { scenarios, reviews, ...rest } = output;
  const cases: Draft[] = [];
  const caseGroupKeys: (string | null)[] = [];
  for (const scenario of scenarios) {
    let previous: CellValue = "";
    for (const task of scenario.tasks)
      for (const row of task.rows) {
        const draft: Draft = { ...row };
        if (testCase) draft[testCase.id] = scenario.name;
        if (title) draft[title.id] = task.title;
        if (steps) {
          draft[steps.id] ??= previous;
          previous = draft[steps.id];
        }
        cases.push(draft);
        caseGroupKeys.push(scenario.groupKey ?? null);
      }
  }
  return {
    ...rest,
    cases,
    caseGroupKeys,
    reviews: reviews.map(({ groupKey: _, ...review }) => review),
    reviewGroupKeys: reviews.map((r) => r.groupKey ?? null),
  };
}

/** 저장된 행을 AI 출력과 같은 묶음으로 보여준다. 스타일 예시에 쓴다. */
export function groupScenarios(
  columns: TestSetColumnDto[],
  rows: Draft[],
): ScenarioOutput["scenarios"] {
  const { testCase, title, steps } = scenarioColumns(columns);
  const text = (row: Draft, column?: TestSetColumnDto) =>
    column ? String(row[column.id] ?? "") : "";
  const scenarios: ScenarioOutput["scenarios"] = [];
  let previous: Draft | undefined;
  for (const values of rows) {
    const row: Draft = { ...values };
    const name = text(row, testCase);
    const task = text(row, title);
    let scenario = scenarios.at(-1);
    if (!scenario || !previous || name !== text(previous, testCase)) {
      scenario = { name, tasks: [] };
      scenarios.push(scenario);
    } else if (
      steps &&
      text(row, steps) &&
      text(row, steps) === text(previous, steps)
    )
      row[steps.id] = null;
    if (scenario.tasks.at(-1)?.title !== task || !scenario.tasks.length)
      scenario.tasks.push({ title: task, rows: [] });
    for (const column of [testCase, title]) if (column) delete row[column.id];
    scenario.tasks.at(-1)?.rows.push(row);
    previous = values;
  }
  return scenarios;
}

export const STYLE_BLOCK_ROWS = 8;
/** 테스트 케이스 값이 이어지는 첫 여러 행 묶음. 없으면 앞의 행들. */
export function scenarioBlock<T extends { values: Draft }>(
  columns: TestSetColumnDto[],
  rows: T[],
): T[] {
  const { testCase } = scenarioColumns(columns);
  const name = (row: T) =>
    testCase ? String(row.values[testCase.id] ?? "").trim() : "";
  for (let start = 0; start < rows.length; ) {
    let end = start + 1;
    while (
      end < rows.length &&
      name(rows[start]) &&
      name(rows[end]) === name(rows[start])
    )
      end++;
    if (end - start > 1) return rows.slice(start, end);
    start = end;
  }
  return rows.slice(0, 3);
}

/** 이전 작업이 저장한 평평한 출력도 시나리오 출력으로 맞춘다. */
export function asScenarioOutput(
  columns: TestSetColumnDto[],
  output: ScenarioOutput | CaseOutput,
): ScenarioOutput {
  if ("scenarios" in output) return output;
  const { cases, caseGroupKeys: _, reviewGroupKeys: __, ...rest } = output;
  return { ...rest, scenarios: groupScenarios(columns, cases) };
}
