import { readEnv } from "../config/env";
import { readAiConfig, STAGES } from "../generation/model-config";

// 원본 설정에서는 AI 실행에 필요한 값만 읽는다. 로컬 DB와 관리자 키는 사용하지 않는다.
export function demoEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    ...STAGES.flatMap((stage) => [
      `AI_MODEL_${stage.toUpperCase()}`,
      `AI_EFFORT_${stage.toUpperCase()}`,
    ]),
  ]) {
    if (source[key]?.trim()) env[key] = source[key];
  }
  Object.assign(env, {
    DATABASE_URL:
      "postgresql://cheddar_demo:cheddar_demo_local@db:5432/cheddar_demo",
    FILE_STORAGE_ROOT: "/data/files",
    API_PORT: "3101",
    CORS_ORIGINS: "http://127.0.0.1:5173",
    ALLOW_FIGMA_NULL_ORIGIN: "true",
    NODE_ENV: "development",
    AI_PROVIDER: "",
  });
  for (const model of Object.values(readAiConfig(env).models)) {
    const key =
      model.provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY";
    if (!env[key]?.trim())
      throw new Error(
        `전달받은 설정 파일에 ${key}가 없습니다. 준비 담당자에게 확인하세요.`,
      );
  }
  readEnv(env);
  return env;
}
