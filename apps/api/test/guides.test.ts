import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GUIDE,
  GUIDES,
  guideOf,
  promptVersion,
} from "../src/generation/guides";
import { readAiConfig } from "../src/generation/model-config";
import {
  type AiRequest,
  stableInstructions,
} from "../src/generation/providers/ai-provider";
import { DEFINITIONS } from "../src/generation/steps";
import { isAiColumn } from "../src/generation/steps/column-rules";
import type { GenerationInput } from "../src/generation/types";
import { defaultColumns } from "../src/projects/template";

const columns = defaultColumns().map(({ enabled: _, ...c }) => c);
const input = (guide?: string): GenerationInput => ({
  guide,
  columns,
  memo: "",
  frames: [],
  featureGroups: [],
  viewpoints: [],
  screenStructure: [],
  styleExamples: [],
  existingCases: [],
});

for (const guide of Object.values(GUIDES))
  test(`${guide.id} 지침은 AI가 쓰는 사전 정의 열마다 작성 기준이 있고 ID가 겹치지 않는다`, () => {
    for (const column of columns.filter(isAiColumn))
      if (column.presetKey)
        assert.ok(
          guide.columns[column.presetKey],
          `${column.presetKey} 작성 기준이 없습니다.`,
        );
    for (const ids of [
      guide.viewpoints.map((v) => v.id),
      guide.decomposition.map((r) => r.id),
    ])
      assert.equal(new Set(ids).size, ids.length);
    assert.ok(guide.viewpoints.some((v) => v.admin));
    assert.ok(guide.decomposition.length > 0);
  });

test("새 작업의 지침은 AI_GUIDE로 고르고 없는 지침은 시작할 때 거부한다", () => {
  assert.equal(readAiConfig({}).guide, DEFAULT_GUIDE);
  assert.equal(readAiConfig({ AI_GUIDE: "" }).guide, DEFAULT_GUIDE);
  for (const id of Object.keys(GUIDES))
    assert.equal(readAiConfig({ AI_GUIDE: id }).guide, id);
  assert.throws(() => readAiConfig({ AI_GUIDE: "없는-지침" }), /AI_GUIDE/);
  assert.throws(() => readAiConfig({ AI_GUIDE: "toString" }), /AI_GUIDE/);
});

test("지침을 기록하지 않은 이전 작업은 기본 지침으로 이어서 실행한다", () => {
  assert.equal(guideOf(input()).id, DEFAULT_GUIDE);
  assert.throws(() => guideOf(input("없는-지침")));
  assert.throws(() => guideOf(input("toString")));
});

test("분해 기준은 케이스를 나누는 단계에만 보낸다", () => {
  const request = (key: keyof typeof DEFINITIONS): AiRequest => ({
    definition: DEFINITIONS[key],
    model: readAiConfig({}).models[key],
    schema: {},
    context: input(),
    sourceData: {},
    images: [],
  });
  const sent = (key: keyof typeof DEFINITIONS) =>
    JSON.parse(stableInstructions(request(key))).decomposition;
  const rules = guideOf(input()).decomposition;
  assert.deepEqual(sent("cases"), rules);
  assert.deepEqual(sent("finish"), rules);
  for (const key of ["screens", "flows", "rewrite"] as const)
    assert.equal(sent(key), undefined);
});

test("프롬프트 버전은 단계 프롬프트나 지침 내용이 바뀌면 달라진다", () => {
  const guide = guideOf(input());
  const step = DEFINITIONS.cases;
  const version = promptVersion(step, guide);
  assert.ok(version.startsWith(`${step.version}+${guide.id}@`));
  assert.equal(promptVersion(step, { ...guide }), version);
  assert.notEqual(
    promptVersion(step, {
      ...guide,
      decomposition: guide.decomposition.slice(1),
    }),
    version,
  );
  assert.notEqual(
    promptVersion({ ...step, prompt: `${step.prompt} ` }, guide),
    version,
  );
});
