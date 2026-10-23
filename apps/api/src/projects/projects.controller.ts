import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AllowPluginToken, CurrentAccount } from "../authorization/guards";
import {
  CreateFeatureGroupDto,
  CreateProjectDto,
  CreateScreenDto,
  CreateScreenIdRuleDto,
  CreateScreensDto,
  CreateScreensResultDto,
  FeatureGroupDto,
  FeatureGroupListDto,
  FeatureGroupOrderDto,
  MemoDto,
  NextScreenIdDto,
  ProjectDto,
  ProjectListDto,
  ScreenDraftListDto,
  ScreenDto,
  ScreenIdRuleDraftListDto,
  ScreenIdRuleDto,
  ScreenIdRuleListDto,
  ScreenListDto,
  ScreenSourcesMultipartDto,
  TemplateDto,
  UpdateFeatureGroupDto,
  UpdateMemoDto,
  UpdateProjectDto,
  UpdateScreenDto,
  UpdateScreenIdRuleDto,
  UpdateTemplateDto,
} from "../contracts/project.dto";
import { ProjectsService } from "./projects.service";
import { ScreenDraftsService } from "./screen-drafts.service";
import { MAX_SOURCE_BYTES, MAX_SOURCE_FILES } from "./screen-sources";

const sourceFiles = FilesInterceptor("files[]", MAX_SOURCE_FILES, {
  limits: { fileSize: MAX_SOURCE_BYTES, fieldSize: 200_000, fields: 1 },
});
const sourcesBody = {
  schema: {
    type: "object",
    properties: {
      text: { type: "string" },
      "files[]": { type: "array", items: { type: "string", format: "binary" } },
    },
  },
} as const;

@ApiTags("프로젝트 설정")
@ApiCookieAuth()
@ApiExtraModels(ScreenSourcesMultipartDto)
@Controller("api/v1/projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly service: ProjectsService,
    @Inject(ScreenDraftsService) private readonly drafts: ScreenDraftsService,
  ) {}
  // 플러그인이 업로드할 프로젝트를 고를 때도 쓴다
  @Get()
  @AllowPluginToken()
  @ApiBearerAuth()
  @ApiOperation({
    operationId: "listProjects",
    summary: "볼 수 있는 프로젝트 목록",
  })
  @ApiOkResponse({ type: ProjectListDto })
  list(@CurrentAccount() accountId: string) {
    return this.service.list(accountId);
  }

  @Post()
  @ApiOperation({
    operationId: "createProject",
    summary: "프로젝트와 기본 설정 만들기",
  })
  @ApiBody({ type: CreateProjectDto })
  @ApiCreatedResponse({ type: ProjectDto })
  create(@CurrentAccount() accountId: string, @Body() dto: CreateProjectDto) {
    return this.service.create(accountId, dto);
  }

  @Get(":projectId")
  @ApiOperation({ operationId: "getProject", summary: "프로젝트 보기" })
  @ApiOkResponse({ type: ProjectDto })
  detail(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.detail(id, accountId);
  }

  @Patch(":projectId")
  @ApiOperation({ operationId: "updateProject", summary: "프로젝트 수정" })
  @ApiBody({ type: UpdateProjectDto })
  @ApiOkResponse({ type: ProjectDto })
  update(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.service.update(id, accountId, dto);
  }

  @Get(":projectId/template")
  @ApiOperation({
    operationId: "getProjectTemplate",
    summary: "기본 양식 보기",
  })
  @ApiOkResponse({ type: TemplateDto })
  template(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.template(id, accountId);
  }

  @Put(":projectId/template")
  @ApiOperation({
    operationId: "updateProjectTemplate",
    summary: "기본 양식 저장",
  })
  @ApiBody({ type: UpdateTemplateDto })
  @ApiOkResponse({ type: TemplateDto })
  // 양식은 DTO 검증도 전용 함수로 수행해 모든 양식 오류를 VALIDATION_FAILED로 응답한다.
  saveTemplate(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: unknown,
  ) {
    return this.service.saveTemplate(id, dto);
  }

  @Get(":projectId/feature-groups")
  @ApiOperation({
    operationId: "listProjectFeatureGroups",
    summary: "기능 그룹 목록",
  })
  @ApiOkResponse({ type: FeatureGroupListDto })
  groups(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.listGroups(id, accountId);
  }

  @Post(":projectId/feature-groups")
  @ApiOperation({
    operationId: "createProjectFeatureGroup",
    summary: "기능 그룹 추가",
  })
  @ApiBody({ type: CreateFeatureGroupDto })
  @ApiCreatedResponse({ type: FeatureGroupDto })
  createGroup(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: CreateFeatureGroupDto,
  ) {
    return this.service.saveGroup(id, dto);
  }

  @Patch(":projectId/feature-groups/:groupId")
  @ApiOperation({
    operationId: "updateProjectFeatureGroup",
    summary: "기능 그룹 수정",
  })
  @ApiBody({ type: UpdateFeatureGroupDto })
  @ApiOkResponse({ type: FeatureGroupDto })
  updateGroup(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("groupId", ParseUUIDPipe) groupId: string,
    @Body() dto: UpdateFeatureGroupDto,
  ) {
    return this.service.saveGroup(id, dto, groupId.toLowerCase());
  }

  @Delete(":projectId/feature-groups/:groupId")
  @HttpCode(204)
  @ApiOperation({
    operationId: "deleteProjectFeatureGroup",
    summary: "기능 그룹 삭제",
  })
  @ApiNoContentResponse()
  removeGroup(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("groupId", ParseUUIDPipe) groupId: string,
  ) {
    return this.service.removeGroup(id, groupId);
  }

  @Put(":projectId/feature-groups/order")
  @ApiOperation({
    operationId: "reorderProjectFeatureGroups",
    summary: "기능 그룹 순서 변경",
  })
  @ApiBody({ type: FeatureGroupOrderDto })
  @ApiOkResponse({ type: FeatureGroupListDto })
  orderGroups(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: FeatureGroupOrderDto,
  ) {
    return this.service.orderGroups(id, dto.ids);
  }

  @Get(":projectId/screen-id-rules")
  @ApiOperation({
    operationId: "listProjectScreenIdRules",
    summary: "화면 ID 규칙 목록",
  })
  @ApiOkResponse({ type: ScreenIdRuleListDto })
  rules(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.listRules(id, accountId);
  }

  @Post(":projectId/screen-id-rules")
  @ApiOperation({
    operationId: "createProjectScreenIdRule",
    summary: "화면 ID 규칙 추가",
  })
  @ApiBody({ type: CreateScreenIdRuleDto })
  @ApiCreatedResponse({ type: ScreenIdRuleDto })
  createRule(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: CreateScreenIdRuleDto,
  ) {
    return this.service.saveRule(id, dto);
  }

  @Patch(":projectId/screen-id-rules/:ruleId")
  @ApiOperation({
    operationId: "updateProjectScreenIdRule",
    summary: "화면 ID 규칙 수정",
  })
  @ApiBody({ type: UpdateScreenIdRuleDto })
  @ApiOkResponse({ type: ScreenIdRuleDto })
  updateRule(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @Body() dto: UpdateScreenIdRuleDto,
  ) {
    return this.service.saveRule(id, dto, ruleId.toLowerCase());
  }

  @Delete(":projectId/screen-id-rules/:ruleId")
  @HttpCode(204)
  @ApiOperation({
    operationId: "deleteProjectScreenIdRule",
    summary: "화면 ID 규칙 삭제",
  })
  @ApiNoContentResponse()
  removeRule(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
  ) {
    return this.service.removeRule(id, ruleId);
  }

  @Put(":projectId/screen-id-rules/order")
  @ApiOperation({
    operationId: "reorderProjectScreenIdRules",
    summary: "화면 ID 규칙 순서 변경",
  })
  @ApiBody({ type: FeatureGroupOrderDto })
  @ApiOkResponse({ type: ScreenIdRuleListDto })
  orderRules(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: FeatureGroupOrderDto,
  ) {
    return this.service.orderRules(id, dto.ids);
  }

  @Get(":projectId/screens")
  @ApiOperation({
    operationId: "listProjectScreens",
    summary: "화면 구조 목록",
  })
  @ApiOkResponse({ type: ScreenListDto })
  screens(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.listScreens(id, accountId);
  }

  @Post(":projectId/screens")
  @ApiOperation({ operationId: "createProjectScreen", summary: "화면 추가" })
  @ApiBody({ type: CreateScreenDto })
  @ApiCreatedResponse({ type: ScreenDto })
  createScreen(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: CreateScreenDto,
  ) {
    return this.service.saveScreen(id, dto);
  }

  @Patch(":projectId/screens/:itemId")
  @ApiOperation({ operationId: "updateProjectScreen", summary: "화면 수정" })
  @ApiBody({ type: UpdateScreenDto })
  @ApiOkResponse({ type: ScreenDto })
  updateScreen(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateScreenDto,
  ) {
    return this.service.saveScreen(id, dto, itemId.toLowerCase());
  }

  @Delete(":projectId/screens/:itemId")
  @HttpCode(204)
  @ApiOperation({
    operationId: "deleteProjectScreen",
    summary: "하위 화면이 없는 화면 삭제",
  })
  @ApiNoContentResponse()
  removeScreen(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ) {
    return this.service.removeScreen(id, itemId);
  }

  @Get(":projectId/screen-id-rules/:ruleId/next")
  @ApiOperation({
    operationId: "getProjectNextScreenId",
    summary: "다음 화면 ID 계산",
  })
  @ApiQuery({ name: "prefix", required: false, type: String })
  @ApiOkResponse({ type: NextScreenIdDto })
  nextScreenId(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("ruleId", ParseUUIDPipe) ruleId: string,
    @CurrentAccount() accountId: string,
    @Query("prefix") prefix = "",
  ) {
    return this.service.nextRuleId(
      id,
      accountId,
      ruleId,
      typeof prefix === "string" ? prefix : "",
    );
  }

  @Post(":projectId/screens/batch")
  @ApiOperation({
    operationId: "createProjectScreens",
    summary: "화면 여러 개 추가",
  })
  @ApiBody({ type: CreateScreensDto })
  @ApiCreatedResponse({ type: CreateScreensResultDto })
  createScreens(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: CreateScreensDto,
  ) {
    return this.service.addScreens(id, dto.items);
  }

  @Post(":projectId/screens/drafts")
  @UseInterceptors(sourceFiles)
  @ApiOperation({
    operationId: "draftProjectScreens",
    summary: "자료에서 화면 초안 만들기",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody(sourcesBody)
  @ApiCreatedResponse({ type: ScreenDraftListDto })
  screenDrafts(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: ScreenSourcesMultipartDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.drafts.screenDrafts(id, accountId, dto.text ?? "", files);
  }

  @Post(":projectId/screen-id-rules/drafts")
  @UseInterceptors(sourceFiles)
  @ApiOperation({
    operationId: "draftProjectScreenIdRules",
    summary: "자료에서 화면 ID 규칙 초안 만들기",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody(sourcesBody)
  @ApiCreatedResponse({ type: ScreenIdRuleDraftListDto })
  ruleDrafts(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: ScreenSourcesMultipartDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return this.drafts.ruleDrafts(id, accountId, dto.text ?? "", files);
  }

  @Get(":projectId/memo")
  @ApiOperation({ operationId: "getProjectMemo", summary: "메모 보기" })
  @ApiOkResponse({ type: MemoDto })
  memo(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.memo(id, accountId);
  }

  @Put(":projectId/memo")
  @ApiOperation({ operationId: "updateProjectMemo", summary: "메모 저장" })
  @ApiBody({ type: UpdateMemoDto })
  @ApiOkResponse({ type: MemoDto })
  saveMemo(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
    @Body() dto: UpdateMemoDto,
  ) {
    return this.service.saveMemo(id, accountId, dto.body);
  }
}
