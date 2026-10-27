import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "../authorization/guards";
import { CellImageDto, IMAGE_UPLOAD_SCHEMA } from "../contracts/cell-image.dto";
import { SharedTestSetDto } from "../contracts/sharing.dto";
import {
  AddCaseOpDto,
  ApplyOpsDto,
  DeleteCasesOpDto,
  MoveCaseOpDto,
  OpsResultDto,
  SetCellOpDto,
  TestSetViewDto,
} from "../contracts/test-set.dto";
import { CaseOperationsService } from "../test-sets/case-operations.service";
import { CellImageUploadInterceptor } from "../test-sets/cell-image-upload.interceptor";
import { CellImagesService } from "../test-sets/cell-images.service";
import { SharedService } from "./shared.service";

@Public()
@ApiTags("공개 링크")
@ApiExtraModels(SetCellOpDto, AddCaseOpDto, DeleteCasesOpDto, MoveCaseOpDto)
@Controller("api/v1/shared/:linkToken")
export class SharedController {
  constructor(
    @Inject(CellImagesService) private readonly images: CellImagesService,
    @Inject(SharedService) private readonly shared: SharedService,
    @Inject(CaseOperationsService)
    private readonly operations: CaseOperationsService,
  ) {}
  @Get()
  @ApiOperation({
    operationId: "getSharedTestSet",
    summary: "공개 링크로 테스트 세트 열기",
  })
  @ApiOkResponse({ type: SharedTestSetDto })
  async detail(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.shared.detail(await this.shared.subject(token, req, res));
  }
  @Post("ops")
  @HttpCode(200)
  @ApiOperation({
    operationId: "applySharedTestSetOps",
    summary: "공개 링크의 케이스 편집",
  })
  @ApiHeader({
    name: "x-connection-id",
    required: false,
    schema: { type: "string", format: "uuid" },
  })
  @ApiBody({ type: ApplyOpsDto })
  @ApiOkResponse({ type: OpsResultDto })
  async ops(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: ApplyOpsDto,
    @Headers("x-connection-id") connectionId?: string,
  ) {
    const subject = await this.shared.subject(token, req, res);
    return this.operations.apply("", subject, dto, connectionId ?? null);
  }
  @Get("view")
  @ApiOperation({
    operationId: "getSharedTestSetView",
    summary: "공개 링크의 내 보기 설정 읽기",
  })
  @ApiOkResponse({ type: TestSetViewDto })
  async view(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.shared.subject(token, req, res);
    const { row } = await this.shared.prepare(subject);
    return this.shared.sets.view(row.id, subject);
  }
  @Put("view")
  @ApiOperation({
    operationId: "updateSharedTestSetView",
    summary: "공개 링크의 내 보기 설정 저장",
  })
  @ApiBody({ type: TestSetViewDto })
  @ApiOkResponse({ type: TestSetViewDto })
  async saveView(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() dto: TestSetViewDto,
  ) {
    return this.shared.sets.saveView(
      "",
      await this.shared.subject(token, req, res),
      dto,
    );
  }
  @Post("images")
  @UseInterceptors(CellImageUploadInterceptor)
  @ApiOperation({
    operationId: "uploadSharedTestSetImage",
    summary: "공개 링크의 셀 이미지 업로드",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: IMAGE_UPLOAD_SCHEMA })
  @ApiCreatedResponse({ type: CellImageDto })
  async uploadImage(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.images.upload(
      "",
      await this.shared.subject(token, req, res),
      file,
    );
  }
  @Get("images/:imageId")
  @ApiOperation({
    operationId: "getSharedTestSetImage",
    summary: "공개 링크의 셀 이미지 조회",
  })
  @ApiProduces("image/png", "image/jpeg", "image/gif", "image/webp")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async image(
    @Param("linkToken") token: string,
    @Param("imageId", ParseUUIDPipe) imageId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.images.download(
      "",
      await this.shared.subject(token, req, res),
      imageId,
      res,
    );
  }

  @Get("export")
  @ApiOperation({
    operationId: "exportSharedTestSet",
    summary: "공개 링크의 XLSX 내보내기",
  })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  async export(
    @Param("linkToken") token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const subject = await this.shared.subject(token, req, res);
    const { row } = await this.shared.prepare(subject);
    const { fileName, data } = await this.shared.sets.export(row.id, subject);
    return new StreamableFile(data, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }
}
