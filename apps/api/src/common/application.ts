import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Request, Response } from "express";
import { appModule } from "../app.module";
import type { ApiEnv } from "../config/env";
import { ApiExceptionFilter } from "./errors";
import { createDocument } from "./openapi";
import { validationPipe } from "./validation";

export function configureApp(app: INestApplication, config: ApiEnv) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (
      origin &&
      !config.corsOrigins.includes(origin) &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      res.status(403).json({
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "허용되지 않은 요청입니다.",
          requestId,
        },
      });
      return;
    }
    next();
  });
  (app as NestExpressApplication).useBodyParser("json", { limit: "5mb" });
  app.enableCors({
    origin: config.corsOrigins,
    credentials: false,
    exposedHeaders: ["X-Request-Id", "Content-Disposition"],
  });
  app.useGlobalPipes(validationPipe());
  app.useGlobalFilters(new ApiExceptionFilter());
  app
    .getHttpAdapter()
    .get("/openapi.json", (_req: Request, res: Response) =>
      res.json(createDocument(app)),
    );
}
export async function createApp(config: ApiEnv, migrationsFolder: string) {
  const app = await NestFactory.create(appModule(config, migrationsFolder), {
    logger: false,
  });
  configureApp(app, config);
  return app;
}
