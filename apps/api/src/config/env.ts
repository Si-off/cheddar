import { isAbsolute, parse, resolve } from "node:path";
import { type DynamicModule, Global, Module } from "@nestjs/common";

export const API_ENV = Symbol("API_ENV");
export interface ApiEnv {
  databaseUrl: string;
  storageRoot: string;
  port: number;
  corsOrigins: string[];
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
  return {
    databaseUrl: databaseUrl as string,
    storageRoot: resolve(storageRoot),
    port,
    corsOrigins,
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
