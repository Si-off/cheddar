import type { ModelConfig } from "../model-config";
import type { GenerationInput, JsonSchema, StepDefinition } from "../types";
export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
};
export const emptyUsage = (): Usage => ({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});
export type AiRequest = {
  definition: StepDefinition;
  model: ModelConfig;
  schema: JsonSchema;
  context: GenerationInput;
  sourceData: unknown;
  images: { mediaType: "image/png" | "image/jpeg"; data: string }[];
  repair?: { output: string; error: string };
  signal?: AbortSignal;
};
export type AiResponse = { text: string; usage: Usage };
export interface AiProvider {
  generate(request: AiRequest): Promise<AiResponse>;
}
export class AiFailure extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly usage = emptyUsage(),
  ) {
    super(code);
  }
}
export function requestData(r: AiRequest) {
  return JSON.stringify({
    sourceData: r.sourceData,
    ...(r.repair
      ? {
          correction: {
            previousOutput: r.repair.output,
            validationError: r.repair.error,
            instruction: "검증 오류를 고치고 전체 JSON을 다시 출력하세요.",
          },
        }
      : {}),
  });
}
export function stableInstructions(r: AiRequest) {
  return JSON.stringify({
    form: r.context.columns.map(({ id, ...c }) => ({ key: id, ...c })),
    requiredCases: r.context.requiredCases,
    featureGroups: r.context.featureGroups,
  });
}
// 제공자 오류 메시지에 키 일부가 섞일 수 있어 키 형태의 문자열을 지운 뒤 기록한다.
export function failureLog(status: number | undefined, message: string) {
  return `${status ?? "-"} ${message.replace(/sk-[\w*.-]+/g, "[키 생략]")}`;
}
