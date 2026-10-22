import assert from "node:assert/strict";
import test from "node:test";
import { caseSchema, validateSchema } from "../src/generation/output-schema";
import {
  flattenScenarios,
  groupScenarios,
  scenarioBlock,
  scenarioColumns,
} from "../src/generation/scenarios";
import type { GenerationInput, ScenarioOutput } from "../src/generation/types";
import { defaultColumns } from "../src/projects/template";

const columns = defaultColumns();
const key = (presetKey: string) => {
  const column = columns.find((c) => c.presetKey === presetKey);
  assert.ok(column);
  return column.id;
};
const [env, testCase, title, steps, expected] = [
  "test_env",
  "test_case",
  "title",
  "steps",
  "expected",
].map(key);
const output = (scenarios: ScenarioOutput["scenarios"]): ScenarioOutput => ({
  scenarios,
  reviews: [],
  coverage: [],
  mergedCount: 0,
});

test("시나리오를 펼치면 행마다 테스트 케이스와 제목을 채우고 null 절차는 같은 시나리오 윗행을 따른다", () => {
  const flat = flattenScenarios(
    columns,
    output([
      {
        name: "쿠폰 등록",
        groupKey: "coupon",
        tasks: [
          {
            title: "Case 1. 유효하지 않은 번호",
            rows: [
              { [steps]: "1. 번호 입력\n2. [등록] 선택", [expected]: "- 오류" },
            ],
          },
          {
            title: "Case 2. 이미 사용한 번호",
            rows: [{ [steps]: null, [expected]: "- 사용 안내" }],
          },
        ],
      },
      {
        name: "쿠폰 취소",
        groupKey: null,
        tasks: [
          {
            title: "취소 팝업",
            rows: [
              { [steps]: null, [expected]: "- 팝업" },
              { [steps]: "2. [네] 선택", [expected]: "- 취소" },
            ],
          },
        ],
      },
    ]),
  );
  assert.deepEqual(
    flat.cases.map((c) => [c[testCase], c[title], c[steps]]),
    [
      [
        "쿠폰 등록",
        "Case 1. 유효하지 않은 번호",
        "1. 번호 입력\n2. [등록] 선택",
      ],
      ["쿠폰 등록", "Case 2. 이미 사용한 번호", "1. 번호 입력\n2. [등록] 선택"],
      // 다른 시나리오의 절차는 이어받지 않는다.
      ["쿠폰 취소", "취소 팝업", ""],
      ["쿠폰 취소", "취소 팝업", "2. [네] 선택"],
    ],
  );
  assert.deepEqual(flat.caseGroupKeys, ["coupon", "coupon", null, null]);
});

test("저장된 행을 시나리오로 묶었다가 펼치면 같은 행이 된다", () => {
  const rows = [
    { [env]: "APP", [testCase]: "가", [title]: "a", [steps]: "1. 진입" },
    { [env]: "APP", [testCase]: "가", [title]: "a", [steps]: "2. 선택" },
    { [env]: "APP", [testCase]: "가", [title]: "b", [steps]: "2. 선택" },
    { [env]: "WEB", [testCase]: "나", [title]: "b", [steps]: "2. 선택" },
  ];
  const scenarios = groupScenarios(columns, rows);
  assert.deepEqual(
    scenarios.map((s) => [s.name, s.tasks.map((t) => t.rows.length)]),
    [
      ["가", [2, 1]],
      ["나", [1]],
    ],
  );
  assert.equal(scenarios[0].tasks[1].rows[0][steps], null);
  assert.deepEqual(flattenScenarios(columns, output(scenarios)).cases, rows);
});

test("케이스 출력은 행 없는 하위 시나리오와 이전 평평한 형식을 거부한다", () => {
  const schema = caseSchema({
    columns,
    viewpoints: [],
  } as unknown as GenerationInput);
  assert.throws(() =>
    validateSchema(
      schema,
      output([{ name: "가", tasks: [{ title: "a", rows: [] }] }]),
    ),
  );
  assert.throws(() =>
    validateSchema(schema, {
      cases: [],
      reviews: [],
      coverage: [],
      mergedCount: 0,
    }),
  );
});

test("제목이나 테스트 케이스 열이 없어도 펼칠 수 있다", () => {
  const without = columns.filter(
    (c) => c.presetKey !== "test_case" && c.systemKey !== "title",
  );
  assert.equal(scenarioColumns(without).title, undefined);
  const flat = flattenScenarios(
    without,
    output([
      { name: "가", tasks: [{ title: "a", rows: [{ [steps]: "1. 진입" }] }] },
    ]),
  );
  assert.deepEqual(flat.cases, [{ [steps]: "1. 진입" }]);
});

test("스타일 예시는 테스트 케이스 값이 이어지는 첫 묶음을 통째로 고른다", () => {
  const rows = ["가", "나", "나", "나", "다"].map((name, i) => ({
    id: String(i),
    values: { [testCase]: name },
  }));
  assert.deepEqual(
    scenarioBlock(columns, rows).map((r) => r.id),
    ["1", "2", "3"],
  );
  const single = rows.filter((r) => r.values[testCase] !== "나");
  assert.deepEqual(
    scenarioBlock(columns, single).map((r) => r.id),
    ["0", "4"],
  );
});
