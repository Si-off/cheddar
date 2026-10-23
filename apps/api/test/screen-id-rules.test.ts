import assert from "node:assert/strict";
import test from "node:test";
import type { ScreenIdRulePartDto } from "../src/contracts/project.dto";
import {
  example,
  matches,
  nextScreenId,
} from "../src/projects/screen-id-rules";

const parts: ScreenIdRulePartDto[] = [
  {
    name: "환경",
    kind: "list",
    codes: [
      { code: "PC", meaning: "" },
      { code: "APP", meaning: "" },
    ],
    value: "",
    digits: 0,
  },
  { name: "화면", kind: "fixed", codes: [], value: "PG", digits: 0 },
  { name: "번호", kind: "number", codes: [], value: "", digits: 3 },
];
test("화면 ID 규칙은 코드·고정값·번호 자릿수와 조각 수를 검사한다", () => {
  const rule = { separator: "_", parts };
  assert.equal(example(rule), "PC_PG_001");
  for (const id of ["PC_PG_001", "APP_PG_000"])
    assert.equal(matches(rule, id), true);
  for (const id of [
    "pc_PG_001",
    "PC_X_001",
    "PC_PG_01",
    "PC_PG_0001",
    "PC_PG_abc",
    "PC_PG_001_X",
  ])
    assert.equal(matches(rule, id), false);
});
test("앞부분별 최댓값 다음 번호, 잘못된 ID 제외, 번호 없음과 소진", () => {
  const rule = { separator: "_", parts };
  const ids = ["PC_PG_002", "PC_PG_009", "APP_PG_050", "PC_X_999", "PC_PG_99"];
  assert.equal(nextScreenId(rule, ["PC", "PG"], ids), "PC_PG_010");
  assert.equal(nextScreenId(rule, ["APP", "PG"], ids), "APP_PG_051");
  assert.equal(nextScreenId(rule, ["PC", "PG"], []), "PC_PG_001");
  assert.equal(nextScreenId(rule, ["PC"], ids), null);
  assert.equal(nextScreenId(rule, ["BAD", "PG"], ids), null);
  assert.equal(nextScreenId(rule, ["PC", "PG"], ["PC_PG_999"]), null);
  assert.equal(
    nextScreenId({ ...rule, parts: parts.slice(0, 2) }, [], []),
    null,
  );
});
test("빈 구분 기호와 번호 뒤 고정 부분", () => {
  const rule = {
    separator: "",
    parts: [...parts, { ...parts[1], value: "END" }],
  };
  assert.equal(matches(rule, "PCPG002END"), true);
  assert.equal(nextScreenId(rule, ["PC", "PG"], ["PCPG002END"]), "PCPG003END");
});
