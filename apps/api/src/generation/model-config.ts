export const STAGES = [
  "screens",
  "flows",
  "cases",
  "finish",
  "rewrite",
] as const;
export type Stage = (typeof STAGES)[number];
/** 생성 단계와 생성 작업 밖의 단발 호출(파일에서 화면 구조 초안 만들기). */
export const AI_TASKS = [...STAGES, "structure"] as const;
export type AiTask = (typeof AI_TASKS)[number];
/** Claude와 GPT가 함께 받는 effort 값. default는 effort를 보내지 않아 모델 기본값을 쓴다(effort를 받지 않는 모델용). */
export const EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "default",
] as const;
export type Effort = (typeof EFFORTS)[number];
export type ModelConfig = {
  provider: "anthropic" | "openai";
  model: string;
  effort: Effort;
};
export type AiConfig = { fake: boolean; models: Record<AiTask, ModelConfig> };

/** 짧은 이름으로 모델을 고를 수 있게 한다. 전체 이름(`anthropic:<모델>`, `openai:<모델>`)도 받는다. */
export const MODEL_ALIASES: Record<string, string> = {
  haiku: "anthropic:claude-haiku-5-5",
  sonnet: "anthropic:claude-sonnet-5-5",
  opus: "anthropic:claude-opus-5-5",
  luna: "openai:gpt-6-luna",
  terra: "openai:gpt-5.6-terra",
};

/** 단계별 기본 모델과 effort. 환경변수 AI_MODEL_<단계>, AI_EFFORT_<단계>로 바꾼다. */
const defaults: Record<AiTask, { model: string; effort: Effort }> = {
  screens: { model: "terra", effort: "low" },
  flows: { model: "terra", effort: "medium" },
  cases: { model: "terra", effort: "high" },
  finish: { model: "luna", effort: "low" },
  rewrite: { model: "terra", effort: "medium" },
  structure: { model: "terra", effort: "medium" },
};

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  if (
    env.AI_PROVIDER &&
    !["fake", "anthropic", "openai"].includes(env.AI_PROVIDER)
  )
    throw new Error("AI_PROVIDER 설정을 확인하세요.");
  const models = Object.fromEntries(
    AI_TASKS.map((stage) => {
      const name = stage.toUpperCase();
      const value = env[`AI_MODEL_${name}`] ?? defaults[stage].model;
      const match = /^(anthropic|openai):([^\s:]+)$/.exec(
        MODEL_ALIASES[value] ?? value,
      );
      if (!match) throw new Error(`AI_MODEL_${name} 설정을 확인하세요.`);
      const effort = env[`AI_EFFORT_${name}`] ?? defaults[stage].effort;
      if (!(EFFORTS as readonly string[]).includes(effort))
        throw new Error(`AI_EFFORT_${name} 설정을 확인하세요.`);
      return [
        stage,
        { provider: match[1], model: match[2], effort: effort as Effort },
      ];
    }),
  ) as Record<AiTask, ModelConfig>;
  return { fake: env.AI_PROVIDER === "fake", models };
}
