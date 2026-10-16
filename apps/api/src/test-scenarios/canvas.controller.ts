import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  CanvasSnapshotDto,
  FlowGenerationDto,
  FlowGenerationListDto,
  ReplaceFlowDto,
  RestoreFlowDto,
  SaveCanvasLayoutDto,
  SaveFlowDto,
  StartFlowGenerationDto,
} from "../contracts/canvas.dto";
import { ErrorResponseDto } from "../contracts/common.dto";
import { FlowGenerationService } from "../generation/flow-generation.service";
import { CanvasRepository } from "./canvas.repository";

@ApiTags("scenario_canvas")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/test-scenarios/:testScenarioId")
export class CanvasController {
  constructor(
    @Inject(CanvasRepository) private readonly canvas: CanvasRepository,
    @Inject(FlowGenerationService)
    private readonly generation: FlowGenerationService,
  ) {}
  @Get("canvas")
  @ApiOperation({ operationId: "getScenarioCanvas" })
  @ApiOkResponse({ type: CanvasSnapshotDto })
  get(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
  ) {
    return this.canvas.get(project, id);
  }
  @Put("flow")
  @ApiOperation({ operationId: "saveScenarioFlow" })
  @ApiBody({ type: SaveFlowDto })
  @ApiOkResponse({ type: CanvasSnapshotDto })
  flow(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
    @Body() body: SaveFlowDto,
  ) {
    return this.canvas.saveFlow(project, id, body);
  }
  @Put("canvas-layout")
  @ApiOperation({ operationId: "saveScenarioCanvasLayout" })
  @ApiBody({ type: SaveCanvasLayoutDto })
  @ApiOkResponse({ type: CanvasSnapshotDto })
  layout(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
    @Body() body: SaveCanvasLayoutDto,
  ) {
    return this.canvas.saveLayout(project, id, body);
  }
  @Post("flow/replace")
  @ApiOperation({ operationId: "replaceScenarioFlow" })
  @ApiBody({ type: ReplaceFlowDto })
  @ApiCreatedResponse({ type: CanvasSnapshotDto })
  replace(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
    @Body() body: ReplaceFlowDto,
  ) {
    return this.canvas.replace(project, id, body);
  }
  @Post("flow/restore")
  @ApiOperation({ operationId: "restoreScenarioFlow" })
  @ApiBody({ type: RestoreFlowDto })
  @ApiCreatedResponse({ type: CanvasSnapshotDto })
  restore(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
    @Body() body: RestoreFlowDto,
  ) {
    return this.canvas.restore(project, id, body);
  }
  @Post("flow-generations")
  @ApiOperation({ operationId: "startScenarioFlowGeneration" })
  @ApiBody({ type: StartFlowGenerationDto })
  @ApiCreatedResponse({ type: FlowGenerationDto })
  generate(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
    @Body() body: StartFlowGenerationDto,
  ) {
    return this.generation.start(project, id, body);
  }
  @Get("flow-generations")
  @ApiOperation({ operationId: "listScenarioFlowGenerations" })
  @ApiOkResponse({ type: FlowGenerationListDto })
  jobs(
    @Param("projectId", new ParseUUIDPipe()) project: string,
    @Param("testScenarioId", new ParseUUIDPipe()) id: string,
  ) {
    return this.generation.list(project, id);
  }
}
