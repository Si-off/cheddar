import { randomUUID } from "node:crypto";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Request, Response } from "express";

export class ApiError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message, status);
  }
}
export const notFound = () =>
  new ApiError(404, "NOT_FOUND", "요청 항목을 찾지 못했습니다.");
export const invalid = (details?: unknown) =>
  new ApiError(400, "VALIDATION_ERROR", "입력 내용을 확인해주세요.", details);
export const unavailable = () =>
  new ApiError(
    503,
    "DEPENDENCY_UNAVAILABLE",
    "데이터를 읽거나 저장하지 못했습니다. 저장 결과를 확인해주세요.",
  );

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    if (res.headersSent) {
      res.destroy();
      return;
    }
    let error: ApiError;
    if (exception instanceof ApiError) error = exception;
    else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      error =
        status === 404
          ? notFound()
          : status === 413
            ? new ApiError(
                413,
                "FILE_TOO_LARGE",
                "파일 크기가 허용 범위를 초과했습니다.",
              )
            : status === 400
              ? invalid()
              : new ApiError(
                  status,
                  "REQUEST_REJECTED",
                  "요청을 처리하지 못했습니다.",
                );
    } else if (
      typeof exception === "object" &&
      exception !== null &&
      "status" in exception &&
      exception.status === 413
    ) {
      error = new ApiError(
        413,
        "FILE_TOO_LARGE",
        "요청 크기가 허용 범위를 초과했습니다.",
      );
    } else if (
      typeof exception === "object" &&
      exception !== null &&
      "status" in exception &&
      exception.status === 400
    ) {
      error = invalid();
    } else
      error = new ApiError(
        500,
        "INTERNAL_ERROR",
        "요청을 처리하지 못했습니다. 결과 확인 후 다시 시도해주세요.",
      );
    const requestId =
      (res.getHeader("X-Request-Id") as string | undefined) ?? randomUUID();
    res.setHeader("X-Request-Id", requestId);
    res.status(error.getStatus()).json({
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    });
    // Deliberately never log raw exceptions, request bodies, credentials or local paths.
    if (error.getStatus() >= 500)
      process.stderr.write(
        `${JSON.stringify({
          requestId,
          method: req.method,
          status: error.getStatus(),
          code: error.code,
        })}\n`,
      );
  }
}
