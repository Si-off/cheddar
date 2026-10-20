import "reflect-metadata";
import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import type { CorsOptionsCallback } from "@nestjs/common/interfaces/external/cors-options.interface";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { WsAdapter } from "@nestjs/platform-ws";
import type { NextFunction, Request, Response } from "express";
import { appModule } from "../app.module";
import type { ApiEnv } from "../config/env";
import { MAX_UPLOAD_BYTES } from "../temp-uploads/manifest";
import { ApiExceptionFilter } from "./errors";
import { createDocument } from "./openapi";
import { isPluginCorsRequest } from "./plugin-cors";
import { validationPipe } from "./validation";

// Figma 플러그인 UI가 보내는 Origin. 번들 UI는 null, 원격 UI는 PLUGIN_UI_ORIGIN이다.
// 둘 다 지정한 플러그인 경로에만 credentials 없이 허용한다.
function pluginOrigin(config: ApiEnv, origin: string | undefined) {
  return (
    origin === "null" ||
    (config.pluginUiOrigin !== undefined && origin === config.pluginUiOrigin)
  );
}
function pluginAllowed(config: ApiEnv, req: Request) {
  return (
    (req.headers.origin !== "null" || config.allowFigmaNullOrigin === true) &&
    isPluginCorsRequest(req)
  );
}

export function configureApp(app: INestApplication, config: ApiEnv) {
  app.useWebSocketAdapter(new WsAdapter(app));
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.path.startsWith("/api/"))
      res.setHeader("Cache-Control", "no-store");
    if (
      req.method === "POST" &&
      /^\/api\/v1\/temp-uploads\/?$/i.test(req.path)
    ) {
      let received = 0;
      const reject = () => {
        if (res.headersSent) return;
        res.setHeader("Connection", "close");
        req.unpipe();
        req.resume();
        res.status(413).json({
          error: {
            code: "FILE_TOO_LARGE",
            message: "한 번에 200MB 이하로 업로드해주세요.",
            requestId,
          },
        });
      };
      if (Number(req.headers["content-length"]) > MAX_UPLOAD_BYTES) {
        reject();
        return;
      }
      req.on("data", (chunk: Buffer) => {
        received += chunk.length;
        if (received > MAX_UPLOAD_BYTES) reject();
      });
      // 인증을 기다리는 동안 흐름을 시작하지 않는다. multer의 pipe가 준비되면 재개된다.
      req.pause();
    }
    const origin = req.headers.origin;
    if (
      origin &&
      !(pluginOrigin(config, origin)
        ? pluginAllowed(config, req)
        : config.corsOrigins.includes(origin)) &&
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
  app.enableCors((req: Request, callback: CorsOptionsCallback) => {
    const plugin = pluginOrigin(config, req.headers.origin);
    callback(null, {
      origin: plugin
        ? pluginAllowed(config, req) && (req.headers.origin as string)
        : config.corsOrigins.filter((origin) => origin !== "null"),
      credentials: !plugin,
      ...(plugin ? { allowedHeaders: ["Authorization", "Content-Type"] } : {}),
      exposedHeaders: ["X-Request-Id", "Content-Disposition"],
    });
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
