import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { ErrorResponseDto } from "../contracts/common.dto";
import { TestScenarioExportQueryDto } from "../contracts/test-scenarios.dto";
import { ExportsService } from "./exports.service";

@ApiExtraModels(TestScenarioExportQueryDto)
@ApiTags("test_scenarios")
@Controller("api/v1/projects/:projectId/test-scenarios/:testScenarioId")
export class ExportsController {
  constructor(
    @Inject(ExportsService) private readonly service: ExportsService,
  ) {}
  @Get("export.xlsx")
  @ApiOperation({ operationId: "exportTestScenarioXlsx" })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  )
  @ApiOkResponse({ schema: { type: "string", format: "binary" } })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 404, type: ErrorResponseDto })
  @ApiResponse({ status: 409, type: ErrorResponseDto })
  @ApiResponse({ status: 422, type: ErrorResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async export(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("testScenarioId", new ParseUUIDPipe()) testScenarioId: string,
    @Query() query: TestScenarioExportQueryDto,
    @Res() response: Response,
  ) {
    const result = await this.service.export(projectId, testScenarioId, query);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="test-cases.xlsx"; filename*=UTF-8''${encodeURIComponent(result.filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    );
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Length", result.bytes.length);
    response.send(result.bytes);
  }
}
