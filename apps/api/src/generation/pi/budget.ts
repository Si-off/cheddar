import type { ModelConfig } from "../model-config";
import { costFor } from "../pricing";
import { normalizeUsage } from "../usage";
import type { PiCheckpoint } from "./runtime";

/** 저장된 호출 영수증에서 다시 계산하므로 재개·재전송 시 비용을 중복 합산하지 않는다. */
export function piCostUsd(
  state: Pick<PiCheckpoint, "observations" | "entries">,
  model: ModelConfig,
): number {
  if (state.observations?.length)
    return state.observations.reduce((total, call) => {
      const observed = call.observation;
      const usage = normalizeUsage(model.provider, observed?.usage);
      const standard =
        model.provider === "anthropic" ||
        ["default", "standard"].includes(observed?.serviceTier ?? "");
      if (!observed?.usageComplete || !usage.known || !standard) return total;
      const cost = costFor(
        `${model.provider}:${observed.responseModel ?? model.model}`,
        {
          inputTokens:
            (usage.inputTokens as number) -
            (usage.cachedInputTokens as number) -
            (usage.cacheWriteTokens as number),
          outputTokens: usage.outputTokens as number,
          cacheReadTokens: usage.cachedInputTokens as number,
          cacheCreationTokens: usage.cacheWriteTokens as number,
        },
      );
      return total + Number(cost ?? 0);
    }, 0);

  // 관측 훅 없이 실행하는 경우에는 대화·요약 사용량을 같은 단가로 계산한다.
  return state.entries.reduce((total, entry) => {
    const message = entry.type === "message" ? entry.message : undefined;
    const usage =
      message?.role === "assistant"
        ? message.usage
        : entry.type === "compaction" || entry.type === "usage"
          ? entry.usage
          : undefined;
    if (!usage) return total;
    return (
      total +
      Number(
        costFor(`${model.provider}:${model.model}`, {
          inputTokens: usage.input,
          outputTokens: usage.output,
          cacheReadTokens: usage.cacheRead,
          cacheCreationTokens: usage.cacheWrite,
        }) ?? 0,
      )
    );
  }, 0);
}
