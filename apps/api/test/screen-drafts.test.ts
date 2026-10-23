import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { cleanRules, parseSheet } from "../src/projects/screen-drafts";
import { matches } from "../src/projects/screen-id-rules";

const list = (name: string, ...codes: string[]) => ({
  name,
  kind: "list" as const,
  codes: codes.map((code) => ({ code, meaning: "" })),
  value: "",
  digits: 0,
});
const fixed = (name: string, value: string) => ({
  name,
  kind: "fixed" as const,
  codes: [],
  value,
  digits: 0,
});
const number = (digits: number) => ({
  name: "번호",
  kind: "number" as const,
  codes: [],
  value: "",
  digits,
});

test("AI 규칙 정리: 한 자리만 다른 ID로 코드를 넓히고 예외 구조와 겹치는 이름을 정리", () => {
  const ids = [
    ...Array.from(
      { length: 20 },
      (_, i) => `U_SP_0103_ES_PG_${String(i + 1).padStart(3, "0")}`,
    ),
    "U_SP_0102_ES_PG_001",
    "U_SP_0103_SE_PG_001",
    "U_SP_0103_MA_PG_001",
    "U_SP_0101_PG",
    "U_SP_0103_MY_PG_001_1",
  ];
  const rules = cleanRules(
    {
      rules: [
        {
          name: "앱 화면",
          separator: "_",
          parts: [
            fixed("채널", "U"),
            fixed("서비스", "SP"),
            fixed("메뉴", "0103"),
            list("영역", "ES"),
            list("유형", "PG"),
            number(3),
          ],
        },
        // ID 하나에만 맞는 예외 구조는 버린다.
        {
          name: "앱 기본",
          separator: "_",
          parts: [
            fixed("채널", "U"),
            fixed("서비스", "SP"),
            number(4),
            fixed("유형", "PG"),
          ],
        },
        // 코드가 비면 저장할 수 없어 버린다.
        { name: "빈 규칙", separator: "_", parts: [list("영역")] },
      ],
    },
    ids,
    ["앱 화면"],
  );
  assert.equal(rules.length, 1);
  const [rule] = rules;
  assert.equal(rule.name, "앱 화면 2");
  assert.equal(rule.parts[2].kind, "list");
  assert.deepEqual(
    rule.parts[2].codes.map((c) => c.code),
    ["0103", "0102"],
  );
  assert.deepEqual(
    rule.parts[3].codes.map((c) => c.code),
    ["ES", "MA", "SE"],
  );
  assert.equal(rule.parts[5].kind, "number");
  for (const id of ids.slice(0, 23)) assert.ok(matches(rule, id), id);
  // 두 자리가 다른 ID는 넓히지 않는다.
  assert.equal(matches(rule, "U_SP_0104_XX_PG_001"), false);
  assert.equal(matches(rule, "U_SP_0101_PG"), false);
});

test("시트 펼치기: 비어 있는 상위 경로를 잇고 버튼은 빼며 ID 없는 행만 센다", () => {
  const { drafts, withoutId } = parseSheet(
    {
      file: "ia.xlsx",
      name: "IA",
      rows: [
        ["module", "1Depth", "2Depth", "Type", "Screen ID"],
        ["홈", "", "", "Page", "H_PG_001"],
        ["", "공지", "", "Page", "-"],
        ["", "", "상세", "Popup", "H_PO_001"],
        ["", "", "저장", "버튼", ""],
        ["", "", "", "", ""],
        ["마이", "", "", "풀팝업", "M_PO_001"],
      ],
    },
    {
      sheet: 0,
      use: true,
      headerRow: 1,
      idColumn: 5,
      pathColumns: [1, 2, 3],
      typeColumn: 4,
      noteColumn: null,
      types: [
        { value: "Page", type: "page" },
        { value: "Popup", type: "popup" },
      ],
    },
    "s0",
  );
  assert.equal(withoutId, 1);
  assert.deepEqual(
    drafts.map((d) => [d.screenId, d.name, d.type, d.parentKey, d.group]),
    [
      ["H_PG_001", "홈", "page", null, "홈"],
      ["H_PO_001", "상세", "popup", "s0:2", "홈"],
      ["M_PO_001", "마이", "popup", null, "마이"],
    ],
  );
});
