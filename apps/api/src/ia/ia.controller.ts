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
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ErrorResponseDto } from "../contracts/common.dto";
import {
  CreateIaItemDto,
  DeleteIaQueryDto,
  IaItemDto,
  IaPageDto,
  UpdateIaItemDto,
} from "../contracts/ia.dto";
import { IaService } from "./ia.service";

@ApiExtraModels(DeleteIaQueryDto)
@ApiTags("ia")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@ApiResponse({ status: 503, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/ia")
export class IaController {
  constructor(@Inject(IaService) private readonly service: IaService) {}

  @Get()
  @ApiOperation({ operationId: "listIaItems" })
  @ApiOkResponse({ type: IaPageDto })
  list(@Param("projectId", new ParseUUIDPipe()) projectId: string) {
    return this.service.list(projectId);
  }

  @Post()
  @ApiOperation({ operationId: "createIaItem" })
  @ApiBody({ type: CreateIaItemDto })
  @ApiCreatedResponse({ type: IaItemDto })
  create(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Body() input: CreateIaItemDto,
  ) {
    return this.service.create(projectId, input);
  }

  @Patch(":itemId")
  @ApiOperation({ operationId: "updateIaItem" })
  @ApiBody({ type: UpdateIaItemDto })
  @ApiOkResponse({ type: IaItemDto })
  update(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Body() input: UpdateIaItemDto,
  ) {
    return this.service.update(projectId, itemId, input);
  }

  @Delete(":itemId")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteIaItem" })
  @ApiNoContentResponse()
  delete(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("itemId", new ParseUUIDPipe()) itemId: string,
    @Query() query: DeleteIaQueryDto,
  ) {
    return this.service.delete(projectId, itemId, query.expectedRevision);
  }
}
