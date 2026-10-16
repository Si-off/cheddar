import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { ErrorResponseDto } from "../contracts/common.dto";
import {
  CreateTestScenarioDto,
  TestScenarioContentDto,
  TestScenarioPageDto,
  TestScenarioPageQueryDto,
  TestScenarioSnapshotDto,
  TestScenarioViewDto,
} from "../contracts/test-scenarios.dto";
import { TestScenariosService } from "./test-scenarios.service";

@ApiExtraModels(TestScenarioPageQueryDto)
@ApiTags("test_scenarios")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 413, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/test-scenarios")
export class TestScenariosController {
  constructor(
    @Inject(TestScenariosService)
    private readonly service: TestScenariosService,
  ) {}
  @Post()
  @ApiOperation({ operationId: "createTestScenario" })
  @ApiBody({ type: CreateTestScenarioDto })
  @ApiCreatedResponse({ type: TestScenarioSnapshotDto })
  create(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Body() input: CreateTestScenarioDto,
  ) {
    return this.service.create(projectId, input);
  }
  @Get()
  @ApiOperation({ operationId: "listTestScenarios" })
  @ApiOkResponse({ type: TestScenarioPageDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Query() query: TestScenarioPageQueryDto,
  ) {
    return this.service.list(projectId, query);
  }
  @Get(":testScenarioId")
  @ApiOperation({ operationId: "getTestScenario" })
  @ApiOkResponse({ type: TestScenarioSnapshotDto })
  get(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
  ) {
    return this.service.get(projectId, testScenarioId);
  }
  @Put(":testScenarioId/content")
  @ApiOperation({ operationId: "updateTestScenarioContent" })
  @ApiBody({ type: TestScenarioContentDto })
  @ApiOkResponse({ type: TestScenarioSnapshotDto })
  content(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Body() input: TestScenarioContentDto,
  ) {
    return this.service.updateContent(projectId, testScenarioId, input);
  }
  @Put(":testScenarioId/view")
  @ApiOperation({ operationId: "updateTestScenarioView" })
  @ApiBody({ type: TestScenarioViewDto })
  @ApiOkResponse({ type: TestScenarioSnapshotDto })
  view(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Body() input: TestScenarioViewDto,
  ) {
    return this.service.updateView(projectId, testScenarioId, input);
  }
}
