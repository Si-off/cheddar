import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import { ErrorResponseDto, PageQueryDto } from "../contracts/common.dto";
import {
  CreateProjectDto,
  ProjectDto,
  ProjectPageDto,
  UpdateProjectDto,
} from "../contracts/projects.dto";
import { ProjectsService } from "./projects.service";

@ApiExtraModels(PageQueryDto)
@ApiTags("projects")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@Controller("api/v1/projects")
export class ProjectsController {
  constructor(
    @Inject(ProjectsService) private readonly service: ProjectsService,
  ) {}
  @Post()
  @ApiOperation({ operationId: "createProject" })
  @ApiBody({ type: CreateProjectDto })
  @ApiCreatedResponse({ type: ProjectDto })
  create(@Body() input: CreateProjectDto) {
    return this.service.create(input);
  }
  @Get()
  @ApiOperation({ operationId: "listProjects" })
  @ApiOkResponse({ type: ProjectPageDto })
  list(@Query() query: PageQueryDto) {
    return this.service.list(query);
  }
  @Get(":projectId")
  @ApiOperation({ operationId: "getProject" })
  @ApiOkResponse({ type: ProjectDto })
  get(@Param("projectId", new ParseUUIDPipe()) id: string) {
    return this.service.get(id);
  }
  @Patch(":projectId")
  @ApiOperation({ operationId: "updateProject" })
  @ApiBody({ type: UpdateProjectDto })
  @ApiOkResponse({ type: ProjectDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  update(
    @Param("projectId", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.service.update(id, input);
  }
}
