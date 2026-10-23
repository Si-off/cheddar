import { createHash } from "node:crypto";
import { isAiColumn } from "../steps/column-rules";
import type { CaseOutput, Draft, FlowOutput, ScreenOutput } from "../types";
import {
  type AiProvider,
  type AiRequest,
  type AiResponse,
  emptyUsage,
} from "./ai-provider";
export class FakeProvider implements AiProvider {
  async generate(r: AiRequest): Promise<AiResponse> {
    const { context: input, definition } = r;
    if (definition.fake)
      return {
        text: JSON.stringify(definition.fake(r.sourceData)),
        usage: emptyUsage(),
      };
    const source = r.sourceData as {
      screens?: ScreenOutput;
      group?: FlowOutput["groups"][number];
      outputs?: (CaseOutput & { groupKey?: string })[];
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
      const reviews = all
        .flatMap((o) =>
          o.reviews.map((r) => ({ review: r, groupKey: o.groupKey ?? null })),
        )
        .slice(0, 1);
      output = {
        cases: all.flatMap((o) => o.cases),
        reviews: reviews.map((r) => r.review),
        caseGroupKeys: all.flatMap((o) =>
          o.cases.map(() => o.groupKey ?? null),
        ),
        reviewGroupKeys: reviews.map((r) => r.groupKey),
        coverage,
        mergedCount: 0,
      } satisfies CaseOutput;
    } else
      output = {
        cases: [
          draft(`${source.group?.name ?? "화면"} 진입 ${signature}`),
          draft(`${source.group?.name ?? "화면"} 완료 ${signature}`),
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
      } satisfies CaseOutput;
    return { text: JSON.stringify(output), usage: emptyUsage() };
  }
}
