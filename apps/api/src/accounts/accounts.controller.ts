import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { RequirePermission } from "../authorization/guards";
import {
  AccountDto,
  AccountInvitationDto,
  AccountPageDto,
  AccountQueryDto,
  CreateAccountDto,
  IssuedTokenDto,
  UpdateAccountDto,
} from "../contracts/identity.dto";
import { AccountsService } from "./accounts.service";
@ApiTags("계정")
@ApiCookieAuth()
@RequirePermission("account.manage")
@Controller("api/v1/accounts")
export class AccountsController {
  constructor(
    @Inject(AccountsService) private readonly service: AccountsService,
  ) {}
  @Get()
  @ApiOperation({ operationId: "listAccounts", summary: "계정 검색과 필터" })
  @ApiOkResponse({ type: AccountPageDto })
  @ApiQuery({ type: AccountQueryDto })
  list(@Query() query: AccountQueryDto) {
    return this.service.list(query);
  }
  @Post()
  @ApiOperation({
    operationId: "createAccount",
    summary: "계정 생성과 초대 토큰 발급",
  })
  @ApiCreatedResponse({ type: AccountInvitationDto })
  @ApiBody({ type: CreateAccountDto })
  create(@Body() dto: CreateAccountDto) {
    return this.service.create(dto);
  }
  @Get(":accountId")
  @ApiOperation({ operationId: "getAccount", summary: "계정 상세" })
  @ApiOkResponse({ type: AccountDto })
  detail(@Param("accountId", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
  @Patch(":accountId")
  @ApiOperation({
    operationId: "updateAccount",
    summary: "계정 정보와 역할 할당 수정",
  })
  @ApiOkResponse({ type: AccountDto })
  @ApiBody({ type: UpdateAccountDto })
  update(
    @Param("accountId", ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.service.update(id, dto);
  }
  @Post(":accountId/deactivate")
  @ApiOperation({
    operationId: "deactivateAccount",
    summary: "계정 비활성화와 세션 폐기",
  })
  @ApiCreatedResponse({ type: AccountDto })
  deactivate(@Param("accountId", ParseUUIDPipe) id: string) {
    return this.service.setActive(id, false);
  }
  @Post(":accountId/reactivate")
  @ApiOperation({
    operationId: "reactivateAccount",
    summary: "계정 다시 활성화",
  })
  @ApiCreatedResponse({ type: AccountDto })
  reactivate(@Param("accountId", ParseUUIDPipe) id: string) {
    return this.service.setActive(id, true);
  }
  @Post(":accountId/invitation")
  @ApiOperation({
    operationId: "reissueInvitation",
    summary: "초대 링크 다시 발급",
  })
  @ApiCreatedResponse({ type: IssuedTokenDto })
  invite(@Param("accountId", ParseUUIDPipe) id: string) {
    return this.service.issue(id, "invite");
  }
  @Post(":accountId/password-reset")
  @ApiOperation({
    operationId: "issuePasswordReset",
    summary: "비밀번호 재설정 링크 발급",
  })
  @ApiCreatedResponse({ type: IssuedTokenDto })
  reset(@Param("accountId", ParseUUIDPipe) id: string) {
    return this.service.issue(id, "reset");
  }
}
