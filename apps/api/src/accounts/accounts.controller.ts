import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import { AdminOnly } from "../authorization/guards";
import {
  AccountDto,
  AccountPageDto,
  AccountQueryDto,
  CreateAccountDto,
  PasswordDto,
  UpdateAccountDto,
} from "../contracts/identity.dto";
import { AccountsService } from "./accounts.service";
@ApiTags("계정")
@ApiCookieAuth()
@AdminOnly()
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
    summary: "계정 만들기",
  })
  @ApiCreatedResponse({ type: AccountDto })
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
    summary: "계정 이름과 등급 수정",
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
  @Put(":accountId/password")
  @HttpCode(204)
  @ApiOperation({
    operationId: "resetAccountPassword",
    summary: "계정 비밀번호 다시 정하기",
  })
  @ApiNoContentResponse()
  @ApiBody({ type: PasswordDto })
  reset(
    @Param("accountId", ParseUUIDPipe) id: string,
    @Body() dto: PasswordDto,
  ) {
    return this.service.resetPassword(id, dto.password);
  }
}
