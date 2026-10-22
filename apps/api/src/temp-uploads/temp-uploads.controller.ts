import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import { AllowPluginToken, CurrentAccount } from "../authorization/guards";
import {
  TempUploadDto,
  UploadMultipartDto,
} from "../contracts/temp-upload.dto";
import { MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "./manifest";
import { TempUploadsService } from "./temp-uploads.service";

@ApiTags("임시 업로드")
@ApiCookieAuth()
@ApiExtraModels(UploadMultipartDto)
@Controller("api/v1/temp-uploads")
export class TempUploadsController {
  constructor(
    @Inject(TempUploadsService) private readonly service: TempUploadsService,
  ) {}
  @Post()
  @AllowPluginToken()
  @ApiBearerAuth()
  @UseInterceptors(
    FilesInterceptor("images[]", 20000, {
      limits: {
        fileSize: MAX_IMAGE_BYTES,
        fieldSize: MAX_UPLOAD_BYTES,
        fields: 1,
      },
    }),
  )
  @ApiOperation({
    operationId: "createTempUpload",
    summary: "프레임 임시 업로드",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["manifest"],
      properties: {
        manifest: {
          type: "string",
          description: "JSON: { frames: [{ name, document, imageCount }] }",
        },
        "images[]": {
          type: "array",
          items: { type: "string", format: "binary" },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: TempUploadDto })
  create(
    @CurrentAccount() accountId: string,
    @Body() dto: UploadMultipartDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.create(accountId, dto.manifest, files ?? []);
  }
  @Get(":uploadId")
  @ApiOperation({
    operationId: "getTempUpload",
    summary: "내 임시 업로드 보기",
  })
  @ApiOkResponse({ type: TempUploadDto })
  detail(
    @Param("uploadId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.detail(id, accountId);
  }
  @Get(":uploadId/frames/:frameId/thumbnail")
  @ApiOperation({
    operationId: "getTempFrameThumbnail",
    summary: "프레임 미리보기",
  })
  @ApiProduces("image/png", "image/jpeg")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async thumbnail(
    @Param("uploadId", ParseUUIDPipe) id: string,
    @Param("frameId", ParseUUIDPipe) frameId: string,
    @CurrentAccount() accountId: string,
  ) {
    const { bytes, type } = await this.service.thumbnail(
      id,
      frameId,
      accountId,
    );
    return new StreamableFile(bytes, { type });
  }
}
