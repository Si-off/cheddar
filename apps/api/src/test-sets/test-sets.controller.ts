import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { CurrentAccount } from "../authorization/guards";
import { CellImageDto, IMAGE_UPLOAD_SCHEMA } from "../contracts/cell-image.dto";
import {
  AddCaseOpDto,
  AddColumnOpDto,
  ApplyOpsDto,
  CreateTestSetDto,
  CustomTemplateChoiceDto,
  DeleteCasesOpDto,
  MoveCaseOpDto,
  OpsResultDto,
  ProjectTemplateChoiceDto,
  RecentTemplateChoiceDto,
  RemoveColumnOpDto,
  ReorderColumnsOpDto,
  SetCellOpDto,
  SetFeatureGroupOpDto,
  TestSetDto,
  TestSetListDto,
  TestSetQueryDto,
  TestSetViewDto,
  UpdateColumnOpDto,
  UpdateTestSetDto,
} from "../contracts/test-set.dto";
import { CaseOperationsService } from "./case-operations.service";
import { CellImageUploadInterceptor } from "./cell-image-upload.interceptor";
import { CellImagesService } from "./cell-images.service";
import { TestSetsService } from "./test-sets.service";

@ApiTags("테스트 세트")
@ApiCookieAuth()
@ApiExtraModels(
  SetCellOpDto,
  SetFeatureGroupOpDto,
  AddCaseOpDto,
  DeleteCasesOpDto,
  MoveCaseOpDto,
  AddColumnOpDto,
  RemoveColumnOpDto,
  ReorderColumnsOpDto,
  UpdateColumnOpDto,
  ProjectTemplateChoiceDto,
  RecentTemplateChoiceDto,
  CustomTemplateChoiceDto,
)
@Controller("api/v1/test-sets")
export class TestSetsController {
  constructor(
    @Inject(CellImagesService) private readonly images: CellImagesService,
    @Inject(TestSetsService) private readonly service: TestSetsService,
    @Inject(CaseOperationsService)
    private readonly operations: CaseOperationsService,
  ) {}
  @Get()
  @ApiOperation({
    operationId: "listTestSets",
    summary: "볼 수 있는 테스트 세트 목록",
  })
  @ApiQuery({ type: TestSetQueryDto })
  @ApiOkResponse({ type: TestSetListDto })
  list(@CurrentAccount() accountId: string, @Query() query: TestSetQueryDto) {
    return this.service.list(accountId, query);
  }

  @Post()
  @ApiOperation({
    operationId: "createTestSet",
    summary: "프로젝트 기본 양식으로 테스트 세트 만들기",
  })
  @ApiBody({ type: CreateTestSetDto })
  @ApiCreatedResponse({ type: TestSetDto })
  create(@CurrentAccount() accountId: string, @Body() dto: CreateTestSetDto) {
    return this.service.create(accountId, dto);
  }

  @Get(":testSetId")
  @ApiOperation({ operationId: "getTestSet", summary: "테스트 세트 보기" })
  @ApiOkResponse({ type: TestSetDto })
  async detail(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.detail(id, accountId);
  }

  @Patch(":testSetId")
  @ApiOperation({
    operationId: "updateTestSet",
    summary: "테스트 세트 이름과 메모 변경",
  })
  @ApiBody({ type: UpdateTestSetDto })
  @ApiOkResponse({ type: TestSetDto })
  update(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: UpdateTestSetDto,
  ) {
    return this.service.update(id, accountId, dto);
  }

  @Delete(":testSetId")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteTestSet", summary: "테스트 세트 삭제" })
  @ApiNoContentResponse()
  remove(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.remove(id, accountId);
  }

  @Post(":testSetId/ops")
  @HttpCode(200)
  @ApiOperation({
    operationId: "applyTestSetOps",
    summary: "테스트 케이스 편집 연산 적용",
  })
  @ApiBody({ type: ApplyOpsDto })
  @ApiOkResponse({ type: OpsResultDto })
  @ApiHeader({
    name: "x-connection-id",
    required: false,
    schema: { type: "string", format: "uuid" },
  })
  ops(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: ApplyOpsDto,
    @Headers("x-connection-id") connectionId?: string,
  ) {
    return this.operations.apply(id, accountId, dto, connectionId ?? null);
  }

  @Get(":testSetId/view")
  @ApiOperation({ operationId: "getTestSetView", summary: "내 보기 설정 읽기" })
  @ApiOkResponse({ type: TestSetViewDto })
  view(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.view(id, accountId);
  }

  @Put(":testSetId/view")
  @ApiOperation({
    operationId: "updateTestSetView",
    summary: "내 보기 설정 저장",
  })
  @ApiOkResponse({ type: TestSetViewDto })
  saveView(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: TestSetViewDto,
  ) {
    return this.service.saveView(id, accountId, dto);
  }

  @Post(":testSetId/images")
  @UseInterceptors(CellImageUploadInterceptor)
  @ApiOperation({
    operationId: "uploadTestSetImage",
    summary: "셀 이미지 업로드",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ schema: IMAGE_UPLOAD_SCHEMA })
  @ApiCreatedResponse({ type: CellImageDto })
  uploadImage(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.images.upload(id, accountId, file);
  }
  @Get(":testSetId/images/:imageId")
  @ApiOperation({ operationId: "getTestSetImage", summary: "셀 이미지 조회" })
  @ApiProduces("image/png", "image/jpeg", "image/gif", "image/webp")
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  image(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @Param("imageId", ParseUUIDPipe) imageId: string,
    @CurrentAccount() accountId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.images.download(id, accountId, imageId, response);
  }

  @Get(":testSetId/export")
  @ApiOperation({
    operationId: "exportTestSet",
    summary: "테스트 세트 XLSX 내보내기",
  })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  @ApiOkResponse({
    schema: { type: "string", format: "binary" },
    headers: {
      "Content-Disposition": {
        description: "attachment; filename*=UTF-8''<테스트 세트 이름>.xlsx",
        schema: { type: "string" },
      },
    },
  })
  async export(
    @Param("testSetId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    const { fileName, data } = await this.service.export(id, accountId);
    return new StreamableFile(data, {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    });
  }
}
