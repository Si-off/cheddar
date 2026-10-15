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
  CreateSheetDto,
  SheetContentDto,
  SheetPageDto,
  SheetPageQueryDto,
  SheetSnapshotDto,
  SheetViewDto,
} from "../contracts/sheets.dto";
import { SheetsService } from "./sheets.service";

@ApiExtraModels(SheetPageQueryDto)
@ApiTags("sheets")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@ApiResponse({ status: 413, type: ErrorResponseDto })
@ApiResponse({ status: 500, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/sheets")
export class SheetsController {
  constructor(@Inject(SheetsService) private readonly service: SheetsService) {}
  @Post()
  @ApiOperation({ operationId: "createSheet" })
  @ApiBody({ type: CreateSheetDto })
  @ApiCreatedResponse({ type: SheetSnapshotDto })
  create(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Body() input: CreateSheetDto,
  ) {
    return this.service.create(projectId, input);
  }
  @Get()
  @ApiOperation({ operationId: "listSheets" })
  @ApiOkResponse({ type: SheetPageDto })
  list(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Query() query: SheetPageQueryDto,
  ) {
    return this.service.list(projectId, query);
  }
  @Get(":sheetId")
  @ApiOperation({ operationId: "getSheet" })
  @ApiOkResponse({ type: SheetSnapshotDto })
  get(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
  ) {
    return this.service.get(projectId, sheetId);
  }
  @Put(":sheetId/content")
  @ApiOperation({ operationId: "updateSheetContent" })
  @ApiBody({ type: SheetContentDto })
  @ApiOkResponse({ type: SheetSnapshotDto })
  content(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
    @Body() input: SheetContentDto,
  ) {
    return this.service.updateContent(projectId, sheetId, input);
  }
  @Put(":sheetId/view")
  @ApiOperation({ operationId: "updateSheetView" })
  @ApiBody({ type: SheetViewDto })
  @ApiOkResponse({ type: SheetSnapshotDto })
  view(
    @Param("projectId", new ParseUUIDPipe()) projectId: string,
    @Param("sheetId", new ParseUUIDPipe()) sheetId: string,
    @Body() input: SheetViewDto,
  ) {
    return this.service.updateView(projectId, sheetId, input);
  }
}
