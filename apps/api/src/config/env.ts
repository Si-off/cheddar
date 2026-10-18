import { isAbsolute, parse, resolve } from "node:path";
import { type DynamicModule, Global, Module } from "@nestjs/common";
import type { CostSource } from "../generation/provider-costs";

export const API_ENV = Symbol("API_ENV");
export interface ApiEnv {
  databaseUrl: string;
  storageRoot: string;
  port: number;
  corsOrigins: string[];
  generationConcurrency?: number;
  costSync?: {
    openai?: CostSource;
    anthropic?: CostSource;
    intervalMs: number;
  };
  ai?: {
    anthropicKey?: string;
    openaiKey?: string;
    anthropicModel: string;
    openaiModel: string;
  };
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
  const port = Number(env.API_PORT ?? 3101);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("API_PORT is invalid.");
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
    corsOrigins.push("null");
  }
  const costSource = (key: string, scope: string): CostSource | undefined => {
    const adminKey = env[key]?.trim();
    const scopeId = env[scope]?.trim();
    if (!adminKey && !scopeId) return undefined;
    if (!adminKey || !scopeId || !/^[a-zA-Z0-9_-]{1,200}$/.test(scopeId))
      throw new Error(`${key} and ${scope} must be configured together.`);
    return { adminKey, scopeId };
  };
  const interval = Number(env.AI_COST_SYNC_INTERVAL_SECONDS ?? 3600);
  const generationConcurrency = Number(env.AI_GENERATION_CONCURRENCY ?? 2);
  if (
    !Number.isInteger(generationConcurrency) ||
    generationConcurrency < 1 ||
    generationConcurrency > 8
  )
    throw new Error("AI_GENERATION_CONCURRENCY must be 1-8.");
  if (!Number.isInteger(interval) || interval < 60 || interval > 86400)
    throw new Error("AI_COST_SYNC_INTERVAL_SECONDS must be 60-86400.");
  return {
    databaseUrl: databaseUrl as string,
    storageRoot: resolve(storageRoot),
    port,
    corsOrigins,
    generationConcurrency,
    costSync: {
      openai: costSource("OPENAI_ADMIN_KEY", "OPENAI_COST_PROJECT_ID"),
      anthropic: costSource(
        "ANTHROPIC_ADMIN_KEY",
        "ANTHROPIC_COST_WORKSPACE_ID",
      ),
      intervalMs: interval * 1000,
    },
    ai: {
      anthropicKey: env.ANTHROPIC_API_KEY?.trim() || undefined,
      openaiKey: env.OPENAI_API_KEY?.trim() || undefined,
      anthropicModel: env.ANTHROPIC_MODEL?.trim() || "claude-haiku-5-5",
      openaiModel: env.OPENAI_MODEL?.trim() || "gpt-6-luna",
    },
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
