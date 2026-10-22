import { createHash } from "node:crypto";
import { scenarioColumns } from "../scenarios";
import { isAiColumn } from "../steps/column-rules";
import type {
  CaseOutput,
  Draft,
  FlowOutput,
  ScenarioOutput,
  ScreenOutput,
} from "../types";
import {
  type AiProvider,
  type AiRequest,
  type AiResponse,
  emptyUsage,
} from "./ai-provider";
export class FakeProvider implements AiProvider {
  async generate(r: AiRequest): Promise<AiResponse> {
    const { context: input, definition } = r;
    const source = r.sourceData as {
      screens?: ScreenOutput;
      group?: FlowOutput["groups"][number];
      outputs?: (ScenarioOutput & { groupKey?: string })[];
    };
    const draft = (title: string): Draft =>
      Object.fromEntries(
        input.columns
          .filter(isAiColumn)
          .map((c) => [
            c.id,
            c.type === "text"
              ? c.systemKey === "title"
                ? title
                : `${c.name} 확인`
              : c.type === "checkbox"
                ? false
                : c.type === "tags"
                  ? []
                  : (c.options[0] ?? null),
          ]),
      );
    const signature = createHash("sha256")
      .update(
        JSON.stringify({
          memo: input.memo,
          frames: input.frames.map((f) => f.screenDocument),
        }),
      )
      .digest("hex")
      .slice(0, 8);
    const coverage: CaseOutput["coverage"] = input.viewpoints.map((c) => ({
      viewpointId: c.id,
      status: "covered",
      explanation: "합성 케이스에 반영",
    }));
    let output: unknown;
    if (definition.key === "screens")
      output = {
        screens: input.frames.map((f) => ({
          frameId: f.id,
          name: f.name,
          description: `${f.name}: ${f.screenDocument}`.slice(0, 20000),
          features: [f.name],
          uncertainties: [],
        })),
      } satisfies ScreenOutput;
    else if (definition.key === "flows")
      output = {
        groups: (input.featureGroups.length
          ? input.featureGroups
          : [{ id: "default", name: "기본 흐름", description: "" }]
        ).map((g) => ({
          key: g.id,
          name: g.name,
          description: g.description,
          screenIds: source.screens?.screens.map((s) => s.frameId) ?? [],
          flows: [input.memo || "화면 진입 후 완료"],
        })),
      } satisfies FlowOutput;
    else if (input.fillColumn) {
      const columnId = input.fillColumn.id;
      output = Object.fromEntries(
        input.existingCases.map((c) => [c.id, draft("열 채우기")[columnId]]),
      );
    } else if (definition.key === "rewrite")
      output = draft(`답변 반영: ${input.review?.answer ?? ""}`);
    else if (definition.key === "finish") {
      const all = source.outputs ?? [];
      output = {
        scenarios: all.flatMap((o) =>
          o.scenarios.map((s) => ({ ...s, groupKey: o.groupKey ?? null })),
        ),
        reviews: all
          .flatMap((o) =>
            o.reviews.map((r) => ({ ...r, groupKey: o.groupKey ?? null })),
          )
          .slice(0, 1),
        coverage,
        mergedCount: 0,
      } satisfies ScenarioOutput;
    } else {
      // 두 행은 같은 시나리오에서 절차를 공유해 펼친 결과가 병합 모양이 된다.
      const { testCase, title, steps } = scenarioColumns(input.columns);
      const row = (name: string) => {
        const values = draft(name);
        for (const column of [testCase, title])
          if (column) delete values[column.id];
        return values;
      };
      const tasks = ["진입", "완료"].map((step, index) => {
        const name = `${source.group?.name ?? "화면"} ${step} ${signature}`;
        const values = row(name);
        if (steps && index) values[steps.id] = null;
        return { title: name, rows: [values] };
      });
      output = {
        scenarios: [
          { name: testCase ? `${testCase.name} 확인` : "시나리오", tasks },
        ],
        reviews: [
          {
            reason: "완료 조건을 확인해야 합니다.",
            question: "완료 후 어떤 상태가 표시되나요?",
            screenDescription:
              input.frames
                .map((f) => `${f.name}: ${f.screenDocument}`)
                .join("\n")
                .slice(0, 20000) || input.memo,
            draft: draft(`완료 상태 ${signature}`),
          },
        ],
        coverage,
        mergedCount: 0,
      } satisfies ScenarioOutput;
    }
    return { text: JSON.stringify(output), usage: emptyUsage() };
  }
}
