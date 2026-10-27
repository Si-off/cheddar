import { isAbsolute, parse, resolve } from "node:path";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import { type AiConfig, readAiConfig } from "../generation/model-config";
import { type PiConfig, piConfig } from "../generation/pi/config";
import type { CostSource } from "../generation/provider-costs";

export const API_ENV = Symbol("API_ENV");
/** API 프로세스당 큐 실행 수. 초과 요청은 거절하지 않고 기다린다. */
export const GENERATION_CONCURRENCY = 2;
const COST_SYNC_INTERVAL_MS = 3600 * 1000;
export interface ApiEnv {
  databaseUrl: string;
  storageRoot: string;
  port: number;
  /** listen 주소. 기본은 loopback이고 외부 호스팅에서는 0.0.0.0 */
  host: string;
  corsOrigins: string[];
  /** 웹과 API가 다른 사이트에 있을 때만 none. Secure가 필요해 production에서만 허용한다 */
  cookieSameSite: "lax" | "none";
  allowFigmaNullOrigin?: boolean;
  /** 원격으로 호스팅한 플러그인 UI의 Origin. 플러그인 경로에만 credentials 없이 허용한다 */
  pluginUiOrigin?: string;
  production?: boolean;
  generationConcurrency?: number;
  costSync?: {
    openai?: CostSource;
    anthropic?: CostSource;
    intervalMs: number;
  };
  ai?: AiConfig;
  pi?: PiConfig;
  queuePollingSeconds?: number;
  workersEnabled?: boolean;
}

export function readEnv(env: NodeJS.ProcessEnv = process.env): ApiEnv {
  const databaseUrl = env.DATABASE_URL;
  try {
    const url = new URL(databaseUrl ?? "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname.length < 2
    )
      throw new Error();
  } catch {
    throw new Error("DATABASE_URL must identify a PostgreSQL database.");
  }
  const storageRoot = env.FILE_STORAGE_ROOT;
  if (
    !storageRoot ||
    !isAbsolute(storageRoot) ||
    resolve(storageRoot) === parse(resolve(storageRoot)).root
  ) {
    throw new Error(
      "FILE_STORAGE_ROOT must be an absolute, dedicated directory.",
    );
  }
  // 호스팅 서비스가 정해 주는 PORT는 API_PORT가 없을 때만 따른다
  const port = Number(env.API_PORT || env.PORT || 3101);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("API_PORT is invalid.");
  const host = env.API_HOST?.trim() || "127.0.0.1";
  const cookieSameSite = env.COOKIE_SAME_SITE?.trim() || "lax";
  if (cookieSameSite !== "lax" && cookieSameSite !== "none")
    throw new Error("COOKIE_SAME_SITE must be lax or none.");
  if (cookieSameSite === "none" && env.NODE_ENV !== "production")
    throw new Error("COOKIE_SAME_SITE=none requires NODE_ENV=production.");
  const corsOrigins = (env.CORS_ORIGINS ?? "http://127.0.0.1:5173")
    .split(",")
    .map((s) => s.trim());
  for (const origin of corsOrigins) {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
        throw new Error();
    } catch {
      throw new Error("CORS_ORIGINS must contain explicit HTTP origins.");
    }
  }
  const allowNullOrigin = env.ALLOW_FIGMA_NULL_ORIGIN ?? "false";
  if (!["true", "false"].includes(allowNullOrigin))
    throw new Error("ALLOW_FIGMA_NULL_ORIGIN must be true or false.");
  if (allowNullOrigin === "true") {
    if (env.NODE_ENV !== "development")
      throw new Error("ALLOW_FIGMA_NULL_ORIGIN requires NODE_ENV=development.");
  }
  const pluginUiOrigin = env.PLUGIN_UI_ORIGIN?.trim() || undefined;
  if (pluginUiOrigin) {
    let url: URL;
    try {
      url = new URL(pluginUiOrigin);
    } catch {
      throw new Error("PLUGIN_UI_ORIGIN must be an explicit HTTP origin.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== pluginUiOrigin
    )
      throw new Error("PLUGIN_UI_ORIGIN must be an explicit HTTP origin.");
    if (env.NODE_ENV === "production" && url.protocol !== "https:")
      throw new Error("PLUGIN_UI_ORIGIN must use HTTPS in production.");
    // 쿠키를 함께 받는 웹 Origin과 섞으면 플러그인 경로 제한이 사라진다
    if (corsOrigins.includes(pluginUiOrigin))
      throw new Error("PLUGIN_UI_ORIGIN must not be listed in CORS_ORIGINS.");
  }
  const costSource = (key: string, scope: string): CostSource | undefined => {
    const adminKey = env[key]?.trim();
    const scopeId = env[scope]?.trim();
    if (!adminKey && !scopeId) return undefined;
    if (!adminKey || !scopeId || !/^[a-zA-Z0-9_-]{1,200}$/.test(scopeId))
      throw new Error(`${key} and ${scope} must be configured together.`);
    return { adminKey, scopeId };
  };
  return {
    databaseUrl: databaseUrl as string,
    storageRoot: resolve(storageRoot),
    port,
    host,
    corsOrigins,
    cookieSameSite,
    allowFigmaNullOrigin: allowNullOrigin === "true",
    pluginUiOrigin,
    production: env.NODE_ENV === "production",
    generationConcurrency: GENERATION_CONCURRENCY,
    costSync: {
      openai: costSource("OPENAI_ADMIN_KEY", "OPENAI_COST_PROJECT_ID"),
      anthropic: costSource(
        "ANTHROPIC_ADMIN_KEY",
        "ANTHROPIC_COST_WORKSPACE_ID",
      ),
      intervalMs: COST_SYNC_INTERVAL_MS,
    },
    ai: readAiConfig(env),
    // 외부 호출 없는 fake에서는 이전 단계 생성기를 쓴다
    pi: piConfig(env.AI_PROVIDER === "fake" ? "staged" : "pi"),
  };
}

@Global()
@Module({})
export class ConfigModule {}
export function configModule(config: ApiEnv): DynamicModule {
  return {
    module: ConfigModule,
    providers: [{ provide: API_ENV, useValue: config }],
    exports: [API_ENV],
  };
}
