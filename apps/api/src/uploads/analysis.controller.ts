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
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { AnalysisDto, ExtractAnalysisDto } from "../contracts/analysis.dto";
import { ErrorResponseDto } from "../contracts/common.dto";
import { AnalysisService } from "./analysis.service";
@ApiTags("analysis")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/analysis")
export class AnalysisController {
  constructor(
    @Inject(AnalysisService) private readonly service: AnalysisService,
  ) {}
  @Get()
  @ApiOperation({ operationId: "getAnalysis" })
  @ApiOkResponse({ type: AnalysisDto })
  get(@Param("projectId", new ParseUUIDPipe()) p: string) {
    return this.service.get(p.toLowerCase());
  }
  @Put()
  @ApiOperation({ operationId: "saveAnalysis" })
  @ApiBody({ type: AnalysisDto })
  @ApiOkResponse({ type: AnalysisDto })
  save(
    @Param("projectId", new ParseUUIDPipe()) p: string,
    @Body() input: AnalysisDto,
  ) {
    return this.service.save(p.toLowerCase(), input);
  }
  @Post("extract")
  @ApiOperation({ operationId: "extractAnalysis" })
  @ApiBody({ type: ExtractAnalysisDto })
  @ApiOkResponse({ type: AnalysisDto })
  extract(
    @Param("projectId", new ParseUUIDPipe()) p: string,
    @Body() input: ExtractAnalysisDto,
  ) {
    return this.service.extract(p.toLowerCase(), input.uploadId.toLowerCase());
  }
}
