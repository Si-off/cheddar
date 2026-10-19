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
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermission } from "../authorization/guards";
import { AffiliationDto, NameDto } from "../contracts/identity.dto";
import { AffiliationsService } from "./affiliations.service";
@ApiTags("소속")
@ApiCookieAuth()
@RequirePermission("role.manage")
@Controller("api/v1/affiliations")
export class AffiliationsController {
  constructor(
    @Inject(AffiliationsService) private readonly service: AffiliationsService,
  ) {}
  @Get()
  // 계정을 만들고 고칠 때 역할과 소속을 골라야 하므로 계정 관리 권한으로도 읽을 수 있다
  @RequirePermission(["role.manage", "account.manage"])
  @ApiOperation({ operationId: "listAffiliations", summary: "소속 목록" })
  @ApiOkResponse({ type: AffiliationDto, isArray: true })
  list() {
    return this.service.list();
  }
  @Get(":affiliationId")
  // 계정을 만들고 고칠 때 역할과 소속을 골라야 하므로 계정 관리 권한으로도 읽을 수 있다
  @RequirePermission(["role.manage", "account.manage"])
  @ApiOperation({ operationId: "getAffiliation", summary: "소속 상세" })
  @ApiOkResponse({ type: AffiliationDto })
  detail(@Param("affiliationId", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Post()
  @ApiOperation({ operationId: "createAffiliation", summary: "소속 만들기" })
  @ApiCreatedResponse({ type: AffiliationDto })
  @ApiBody({ type: NameDto })
  create(@Body() dto: NameDto) {
    return this.service.save(dto.name);
  }
  @Patch(":affiliationId")
  @ApiOperation({ operationId: "updateAffiliation", summary: "소속 이름 수정" })
  @ApiOkResponse({ type: AffiliationDto })
  @ApiBody({ type: NameDto })
  update(
    @Param("affiliationId", ParseUUIDPipe) id: string,
    @Body() dto: NameDto,
  ) {
    return this.service.save(dto.name, id);
  }
  @Delete(":affiliationId")
  @HttpCode(204)
  @ApiOperation({
    operationId: "deleteAffiliation",
    summary: "계정이 없는 소속 삭제",
  })
  @ApiNoContentResponse()
  remove(@Param("affiliationId", ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
