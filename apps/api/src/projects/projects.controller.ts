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
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import {
  AllowPluginToken,
  CurrentAccount,
  RequirePermission,
} from "../authorization/guards";
import {
  CreateFeatureGroupDto,
  CreateProjectDto,
  CreateRequiredCaseDto,
  CreateScreenDto,
  FeatureGroupDto,
  FeatureGroupListDto,
  FeatureGroupOrderDto,
  MemoDto,
  ProjectDto,
  ProjectListDto,
  RequiredCaseDto,
  RequiredCaseListDto,
  ScreenDto,
  ScreenListDto,
  TemplateDto,
  UpdateFeatureGroupDto,
  UpdateMemoDto,
  UpdateProjectDto,
  UpdateRequiredCaseDto,
  UpdateScreenDto,
  UpdateTemplateDto,
} from "../contracts/project.dto";
import { ProjectsService } from "./projects.service";

const projectSource = { source: "params", key: "projectId" } as const;
@ApiTags("프로젝트 설정")
@ApiCookieAuth()
@Controller("api/v1/projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly service: ProjectsService,
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
  @RequirePermission("project.create")
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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

  @Get(":projectId/required-cases")
  @ApiOperation({
    operationId: "listProjectRequiredCases",
    summary: "필수 케이스 목록",
  })
  @ApiOkResponse({ type: RequiredCaseListDto })
  cases(
    @Param("projectId", ParseUUIDPipe) id: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.listCases(id, accountId);
  }

  @Post(":projectId/required-cases")
  @RequirePermission("project.manage", projectSource)
  @ApiOperation({
    operationId: "createProjectRequiredCase",
    summary: "필수 케이스 추가",
  })
  @ApiBody({ type: CreateRequiredCaseDto })
  @ApiCreatedResponse({ type: RequiredCaseDto })
  createCase(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Body() dto: CreateRequiredCaseDto,
  ) {
    return this.service.createCase(id, dto);
  }

  @Patch(":projectId/required-cases/:caseId")
  @RequirePermission("project.manage", projectSource)
  @ApiOperation({
    operationId: "updateProjectRequiredCase",
    summary: "필수 케이스 수정",
  })
  @ApiBody({ type: UpdateRequiredCaseDto })
  @ApiOkResponse({ type: RequiredCaseDto })
  updateCase(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("caseId", ParseUUIDPipe) caseId: string,
    @Body() dto: UpdateRequiredCaseDto,
  ) {
    return this.service.updateCase(id, caseId, dto);
  }

  @Delete(":projectId/required-cases/:caseId")
  @RequirePermission("project.manage", projectSource)
  @HttpCode(204)
  @ApiOperation({
    operationId: "deleteProjectRequiredCase",
    summary: "추가한 필수 케이스 삭제",
  })
  @ApiNoContentResponse()
  removeCase(
    @Param("projectId", ParseUUIDPipe) id: string,
    @Param("caseId", ParseUUIDPipe) caseId: string,
  ) {
    return this.service.removeCase(id, caseId);
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
  @RequirePermission("project.manage", projectSource)
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
