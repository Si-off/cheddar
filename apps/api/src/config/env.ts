import { isAbsolute, resolve, sep } from "node:path";
import { type DynamicModule, Global, Module } from "@nestjs/common";

export const API_ENV = Symbol("API_ENV");
export interface ApiEnv {
  databaseUrl: string;
  storageRoot: string;
  port: number;
  corsOrigins: string[];
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
    resolve(storageRoot) === sep
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
  return {
    databaseUrl: databaseUrl as string,
    storageRoot: resolve(storageRoot),
    port,
    corsOrigins,
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
