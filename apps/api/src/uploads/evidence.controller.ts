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
import { ErrorResponseDto } from "../contracts/common.dto";
import { EvidenceDto, ExtractEvidenceDto } from "../contracts/evidence.dto";
import { EvidenceService } from "./evidence.service";
@ApiTags("evidence")
@ApiResponse({ status: 400, type: ErrorResponseDto })
@ApiResponse({ status: 404, type: ErrorResponseDto })
@ApiResponse({ status: 409, type: ErrorResponseDto })
@Controller("api/v1/projects/:projectId/evidence")
export class EvidenceController {
  constructor(
    @Inject(EvidenceService) private readonly service: EvidenceService,
  ) {}
  @Get()
  @ApiOperation({ operationId: "getEvidence" })
  @ApiOkResponse({ type: EvidenceDto })
  get(@Param("projectId", new ParseUUIDPipe()) p: string) {
    return this.service.get(p.toLowerCase());
  }
  @Put()
  @ApiOperation({ operationId: "saveEvidence" })
  @ApiBody({ type: EvidenceDto })
  @ApiOkResponse({ type: EvidenceDto })
  save(
    @Param("projectId", new ParseUUIDPipe()) p: string,
    @Body() input: EvidenceDto,
  ) {
    return this.service.save(p.toLowerCase(), input);
  }
  @Post("extract")
  @ApiOperation({ operationId: "extractEvidence" })
  @ApiBody({ type: ExtractEvidenceDto })
  @ApiOkResponse({ type: EvidenceDto })
  extract(
    @Param("projectId", new ParseUUIDPipe()) p: string,
    @Body() input: ExtractEvidenceDto,
  ) {
    return this.service.extract(p.toLowerCase(), input.uploadId.toLowerCase());
  }
}
