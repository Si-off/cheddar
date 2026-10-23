import {
  type CallHandler,
  type ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiError } from "../common/errors";
export const MAX_CELL_IMAGE_BYTES = 10 * 1024 * 1024;
@Injectable()
export class CellImageUploadInterceptor extends FileInterceptor("file", {
  limits: { fileSize: MAX_CELL_IMAGE_BYTES + 1, files: 1, fields: 0 },
}) {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 413)
        throw new ApiError(
          400,
          "VALIDATION_FAILED",
          "10MB 이하 이미지만 넣을 수 있습니다.",
        );
      throw error;
    }
  }
}
