import type { ModelConfig } from "../model-config";

export type PiConfig = {
  engine: "staged" | "pi";
  model: ModelConfig;
  maxTurns: number;
  timeoutMs: number;
  maxTokens: number;
};

export function readPiConfig(env: NodeJS.ProcessEnv = process.env): PiConfig {
  const engine = env.AI_GENERATION_ENGINE || "pi";
  if (engine !== "staged" && engine !== "pi")
    throw new Error("AI_GENERATION_ENGINE은 staged 또는 pi여야 합니다.");
  const match = /^(openai|anthropic):([^\s:]+)$/.exec(
    env.AI_PI_MODEL || "openai:gpt-6.1-sol",
  );
  if (!match) throw new Error("AI_PI_MODEL 설정을 확인하세요.");
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(env[key] || fallback);
    if (!Number.isInteger(value) || value < min || value > max)
      throw new Error(`${key}는 ${min}~${max} 정수여야 합니다.`);
    return value;
  };
  return {
    engine,
    model: {
      provider: match[1] as ModelConfig["provider"],
      model: match[2],
      effort: "high",
    },
    maxTurns: number("AI_PI_MAX_TURNS", 80, 1, 200),
    timeoutMs: number("AI_PI_TIMEOUT_SECONDS", 1200, 10, 1500) * 1000,
    maxTokens: number("AI_PI_MAX_TOKENS", 1000000, 1000, 2000000),
  };
}
