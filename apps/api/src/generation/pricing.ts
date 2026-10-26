import type { Usage } from "./providers/ai-provider";

// USD / 100만 토큰. 2026-10-26 공식 표 기준. 알 수 없는 모델은 0으로 추정하지 않는다.
// https://platform.claude.com/docs/en/about-claude/pricing
// https://developers.openai.com/api/docs/pricing
type Rates = [
  input: number,
  output: number,
  cacheRead: number,
  cacheCreation: number,
];
type Price = { rates: Rates; long?: { above: number; rates: Rates } };
const OPENAI_LONG = 272000;
export const PRICING: Record<string, Price> = {
  "openai:gpt-6.1-sol": {
    rates: [2, 10, 0.1, 2.5],
    long: { above: OPENAI_LONG, rates: [4, 15, 0.2, 5] },
  },
  "anthropic:claude-opus-5-5": { rates: [4, 20, 0.2, 5] },
  "anthropic:claude-sonnet-5-5": { rates: [2, 10, 0.2, 2.5] },
  "anthropic:claude-haiku-5-5": {
    rates: [0.1, 0.5, 0.01, 0.125],
    long: { above: 100000, rates: [0.5, 2.5, 0.05, 0.625] },
  },
  "openai:gpt-5.4": {
    rates: [2.5, 15, 0.25, 0],
    long: { above: OPENAI_LONG, rates: [5, 22.5, 0.5, 0] },
  },
  "openai:gpt-6-luna": {
    rates: [0.1, 0.5, 0.01, 0.125],
    long: { above: OPENAI_LONG, rates: [0.2, 0.75, 0.02, 0.25] },
  },
  "openai:gpt-5.6-terra": {
    rates: [2, 12, 0.2, 2.5],
    long: { above: OPENAI_LONG, rates: [4, 18, 0.4, 5] },
  },
};
export function pricingFor(model: string, usage: Usage) {
  const price = PRICING[model];
  if (!price) return null;
  const promptTokens =
    usage.inputTokens + usage.cacheReadTokens + usage.cacheCreationTokens;
  const longContext = price.long && promptTokens > price.long.above;
  const rates = longContext && price.long ? price.long.rates : price.rates;
  const openai = model.startsWith("openai:");
  return {
    version: model === "openai:gpt-6.1-sol" ? "2026-10-26" : "2026-10-20",
    model,
    currency: "USD",
    unit: "usd_per_million_tokens",
    rates: {
      input: rates[0],
      output: rates[1],
      cacheRead: rates[2],
      cacheCreation: rates[3],
    },
    condition: [
      "standard",
      price.long && `input ${longContext ? ">" : "<="} ${price.long.above}`,
      !openai && "cache write 5m",
    ]
      .filter(Boolean)
      .join("; "),
    source: openai
      ? "https://developers.openai.com/api/docs/pricing"
      : "https://platform.claude.com/docs/en/about-claude/pricing",
  };
}
export function costFor(
  model: string,
  usage: Usage,
  fake = false,
): string | null {
  if (fake) return "0.0000000000";
  const rates = pricingFor(model, usage)?.rates;
  if (!rates) return null;
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheCreationTokens * rates.cacheCreation) /
    1000000
  ).toFixed(10);
}
