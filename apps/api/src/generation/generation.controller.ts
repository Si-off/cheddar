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
  GenerationDto,
  GenerationListDto,
  GenerationProvidersDto,
  ReviewCandidateDto,
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
@Controller("api/v1/projects/:projectId/sheets/:sheetId/generations")
export class GenerationController {
  constructor(
    @Inject(GenerationService) private readonly service: GenerationService,
  ) {}
  @Get()
  @ApiOperation({ operationId: "listGenerations" })
  @ApiOkResponse({ type: GenerationListDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
  ) {
    return this.service.list(projectId, sheetId);
  }
  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: "startGeneration" })
  @ApiBody({ type: StartGenerationDto })
  @ApiAcceptedResponse({ type: GenerationDto })
  start(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
    @Body() input: StartGenerationDto,
  ) {
    return this.service.start(projectId, sheetId, input);
  }
  @Put(":jobId/candidates/:candidateId")
  @ApiOperation({ operationId: "reviewCandidate" })
  @ApiBody({ type: ReviewCandidateDto })
  @ApiOkResponse({ type: GenerationDto })
  review(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
    @Param("jobId", new ParseUUIDPipe()) jobId: string,
    @Param("candidateId", new ParseUUIDPipe()) candidateId: string,
    @Body() input: ReviewCandidateDto,
  ) {
    return this.service.review(projectId, sheetId, jobId, candidateId, input);
  }
}
