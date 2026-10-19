export const STAGES = [
  "screens",
  "flows",
  "cases",
  "finish",
  "rewrite",
] as const;
export type Stage = (typeof STAGES)[number];
export type ModelConfig = { provider: "anthropic" | "openai"; model: string };
export type AiConfig = { fake: boolean; models: Record<Stage, ModelConfig> };
const defaults: Record<Stage, string> = {
  screens: "anthropic:claude-sonnet-5-5",
  flows: "anthropic:claude-opus-5-5",
  cases: "anthropic:claude-opus-5-5",
  finish: "anthropic:claude-haiku-5-5",
  rewrite: "anthropic:claude-opus-5-5",
};
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  if (
    env.AI_PROVIDER &&
    !["fake", "anthropic", "openai"].includes(env.AI_PROVIDER)
  )
    throw new Error("AI_PROVIDER 설정을 확인하세요.");
  const models = Object.fromEntries(
    STAGES.map((stage) => {
      const value = env[`AI_MODEL_${stage.toUpperCase()}`] ?? defaults[stage];
      const match = /^(anthropic|openai):([^\s:]+)$/.exec(value);
      if (!match)
        throw new Error(`AI_MODEL_${stage.toUpperCase()} 설정을 확인하세요.`);
      return [stage, { provider: match[1], model: match[2] }];
    }),
  ) as Record<Stage, ModelConfig>;
  return { fake: env.AI_PROVIDER === "fake", models };
}
