import type { ModelConfig } from "../model-config";

export type PiConfig = {
  engine: "staged" | "pi";
  model: ModelConfig;
  maxTurns: number;
  timeoutMs: number;
  maxCostUsd: number;
};

export const DEFAULT_PI_MAX_COST_USD = 3;

/** 최초/추가 생성 설정. 호출마다 새 객체를 돌려줘 작업별 변경이 서로 번지지 않게 한다. */
export function piConfig(engine: PiConfig["engine"] = "pi"): PiConfig {
  return {
    engine,
    model: {
      provider: "anthropic",
      model: "claude-sonnet-5-5",
      effort: "medium",
    },
    maxTurns: 80,
    timeoutMs: 1500 * 1000,
    maxCostUsd: DEFAULT_PI_MAX_COST_USD,
  };
}
