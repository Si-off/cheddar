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
  AddFigmaLinkDto,
  AddImagesMultipartDto,
  TempUploadAddedDto,
} from "../contracts/figma.dto";
import {
  TempUploadDto,
  UploadMultipartDto,
} from "../contracts/temp-upload.dto";
import { MAX_SOURCE_IMAGE_BYTES } from "./images";
import { MAX_FRAMES, MAX_IMAGE_BYTES, MAX_UPLOAD_BYTES } from "./manifest";
import { TempUploadsService } from "./temp-uploads.service";

@ApiTags("임시 업로드")
@ApiCookieAuth()
@ApiExtraModels(UploadMultipartDto, AddImagesMultipartDto)
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
  @Post("figma")
  @ApiOperation({
    operationId: "addFigmaLinkToUpload",
    summary: "Figma 링크의 프레임 붙이기",
  })
  @ApiBody({ type: AddFigmaLinkDto })
  @ApiCreatedResponse({ type: TempUploadAddedDto })
  addFigmaLink(
    @CurrentAccount() accountId: string,
    @Body() dto: AddFigmaLinkDto,
  ) {
    return this.service.addFigmaLink(accountId, dto.uploadId, dto.url);
  }
  @Post("images")
  @UseInterceptors(
    FilesInterceptor("images[]", MAX_FRAMES, {
      limits: { fileSize: MAX_SOURCE_IMAGE_BYTES, fields: 1 },
    }),
  )
  @ApiOperation({
    operationId: "addImagesToUpload",
    summary: "화면 이미지 붙이기",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["images[]"],
      properties: {
        uploadId: { type: "string", format: "uuid" },
        "images[]": {
          type: "array",
          items: { type: "string", format: "binary" },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: TempUploadAddedDto })
  addImages(
    @CurrentAccount() accountId: string,
    @Body() dto: AddImagesMultipartDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.service.addImages(accountId, dto.uploadId, files ?? []);
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
