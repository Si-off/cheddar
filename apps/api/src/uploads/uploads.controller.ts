import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { ErrorResponseDto, PageQueryDto } from "../contracts/common.dto";
import {
  CreateUploadDto,
  UploadDto,
  UploadPageDto,
} from "../contracts/uploads.dto";
import { UploadsService } from "./uploads.service";

@ApiExtraModels(PageQueryDto)
@ApiTags("uploads")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/uploads")
export class UploadsController {
  constructor(
    @Inject(UploadsService) private readonly service: UploadsService,
  ) {}
  @Post()
  @ApiOperation({ operationId: "createUpload" })
  @ApiBody({ type: CreateUploadDto })
  @ApiCreatedResponse({ type: UploadDto })
  @ApiOkResponse({
    type: UploadDto,
    description: "Previously completed request with the same content",
  })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  async create(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Body() input: CreateUploadDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.create(projectId, input);
    res.status(result.created ? 201 : 200);
    return result.upload;
  }
  @Get()
  @ApiOperation({ operationId: "listUploads" })
  @ApiOkResponse({ type: UploadPageDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Query() query: PageQueryDto,
  ) {
    return this.service.list(projectId, query);
  }
  @Get(":uploadId")
  @ApiOperation({ operationId: "getUpload" })
  @ApiOkResponse({ type: UploadDto })
  get(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("uploadId", new ParseUUIDPipe()) uploadId: string,
  ) {
    return this.service.get(projectId, uploadId);
  }
}
