import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ErrorResponseDto } from "../contracts/common.dto";
import { ProjectTemplateDto, UpdateTemplateDto } from "../contracts/ia.dto";
import { TemplatesService } from "./templates.service";

@ApiTags("templates")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/template")
export class TemplatesController {
  constructor(
    @Inject(TemplatesService) private readonly service: TemplatesService,
  ) {}

  @Get()
  @ApiOperation({ operationId: "getProjectTemplate" })
  @ApiOkResponse({ type: ProjectTemplateDto })
  get(@Param("projectId", new ParseUUIDPipe()) projectId: string) {
    return this.service.get(projectId);
  }

  @Put()
  @ApiOperation({ operationId: "updateProjectTemplate" })
  @ApiBody({ type: UpdateTemplateDto })
  @ApiOkResponse({ type: ProjectTemplateDto })
  update(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Body() input: UpdateTemplateDto,
  ) {
    return this.service.update(projectId, input);
  }
}
