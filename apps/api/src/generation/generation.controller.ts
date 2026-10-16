import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ErrorResponseDto } from "../contracts/common.dto";
import {
  AddGeneratedCasesDto,
  GenerationDto,
  GenerationListDto,
  GenerationProvidersDto,
  ReviewGenerationResultDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import { GenerationService } from "./generation.service";
@ApiTags("generation")
@Controller("api/v1/generation")
export class GenerationProvidersController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
  ) {}
  @Get("providers")
  @ApiOperation({ operationId: "listGenerationProviders" })
  @ApiOkResponse({ type: GenerationProvidersDto })
  providers() {
    return this.service.providers();
  }
}
@ApiTags("generation")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@Controller(
  "api/v1/projects/:projectId/test-scenarios/:testScenarioId/generations",
)
export class GenerationController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
  ) {}
  @Get()
  @ApiOperation({ operationId: "listGenerations" })
  @ApiOkResponse({ type: GenerationListDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
  ) {
    return this.service.list(projectId, testScenarioId);
  }
  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: "startGeneration" })
  @ApiBody({ type: StartGenerationDto })
  @ApiAcceptedResponse({ type: GenerationDto })
  start(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Body() input: StartGenerationDto,
  ) {
    return this.service.start(projectId, testScenarioId, input);
  }
  @Post(":jobId/add")
  @ApiOperation({ operationId: "addGeneratedCases" })
  @ApiBody({ type: AddGeneratedCasesDto })
  @ApiOkResponse({ type: GenerationDto })
  add(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Body() input: AddGeneratedCasesDto,
  ) {
    return this.service.add(projectId, testScenarioId, jobId, input);
  }
  @Put(":jobId/results/:resultId")
  @ApiOperation({ operationId: "reviewGenerationResult" })
  @ApiBody({ type: ReviewGenerationResultDto })
  @ApiOkResponse({ type: GenerationDto })
  review(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Param("resultId", new ParseUUIDPipe()) resultId: string,
    @Body() input: ReviewGenerationResultDto,
  ) {
    return this.service.review(
      projectId,
      testScenarioId,
      jobId,
      resultId,
      input,
    );
  }
}
