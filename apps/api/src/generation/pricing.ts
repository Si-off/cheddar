import type { Usage } from "./providers/ai-provider";
// USD / 100만 토큰. 2026-10-19 공식 표 기준. 알 수 없는 모델은 0으로 추정하지 않는다.
// https://platform.claude.com/docs/en/about-claude/pricing
// https://developers.openai.com/api/docs/models/gpt-5.4
export const PRICING: Record<string, [number, number, number, number]> = {
  "anthropic:claude-opus-5-5": [4, 20, 0.2, 5],
  "anthropic:claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "anthropic:claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "openai:gpt-5.4": [2.5, 15, 0.25, 0],
};
export function costFor(
  model: string,
  usage: Usage,
  fake = false,
): string | null {
  if (fake) return "0.0000000000";
  let rates = PRICING[model];
  const promptTokens =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  if (model === "anthropic:claude-haiku-5-5" && promptTokens > 100000)
    rates = [0.5, 2.5, 0.05, 0.625];
  if (model === "openai:gpt-5.4" && promptTokens > 272000)
    rates = [5, 22.5, 0.5, 0];
  if (!rates) return null;
  return (
    (usage.inputTokens * rates[0] +
      usage.outputTokens * rates[1] +
      usage.cacheReadTokens * rates[2] +
      usage.cacheCreationTokens * rates[3]) /
    1000000
  ).toFixed(10);
}
