import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { ErrorResponseDto, PageQueryDto } from "../contracts/common.dto";
import { FileDto, FilePageDto } from "../contracts/files.dto";
import { MAX_FILE_BYTES } from "./file-validation";
import { FilesService } from "./files.service";

@ApiExtraModels(PageQueryDto)
@ApiTags("files")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/files")
export class FilesController {
  constructor(@Inject(FilesService) private readonly service: FilesService) {}
  @Post()
  @ApiOperation({ operationId: "uploadFile" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      additionalProperties: false,
      properties: { file: { type: "string", format: "binary" } },
    },
  })
  @ApiCreatedResponse({ type: FileDto })
  @ApiResponse({ status: 413, type: ErrorResponseDto })
  @ApiResponse({ status: 415, type: ErrorResponseDto })
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 2 },
    }),
  )
  create(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(projectId, file);
  }
  @Get()
  @ApiOperation({ operationId: "listFiles" })
  @ApiOkResponse({ type: FilePageDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.service.list(projectId, query);
  }
  @Get(":fileId")
  @ApiOperation({ operationId: "getFile" })
  @ApiOkResponse({ type: FileDto })
  get(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
  ) {
    return this.service.get(projectId, fileId);
  }
  @Get(":fileId/content")
  @ApiOperation({ operationId: "downloadFile" })
  @ApiProduces("application/octet-stream")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async download(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { metadata, stream } = await this.service.download(projectId, fileId);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const name = encodeURIComponent(metadata.originalName).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return new StreamableFile(stream, {
      type: metadata.mediaType,
      length: metadata.byteSize,
      disposition: `attachment; filename="download"; filename*=UTF-8''${name}`,
    })
      .setErrorHandler(() => {
        // After streaming begins a JSON error envelope is no longer safe; abort the download.
        res.destroy();
      })
      .setErrorLogger(() => {
        process.stderr.write(
          `File stream failed; requestId=${res.getHeader("X-Request-Id")}\n`,
        );
      });
  }
}
