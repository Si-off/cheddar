import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import {
  AllowPluginToken,
  type AuthenticatedRequest,
  CurrentAccount,
  Public,
} from "../authorization/guards";
import {
  CreatedPluginConnectionDto,
  PendingPluginConnectionDto,
  PluginConnectionRequestDto,
  PluginConnectionStatusDto,
  PluginConnectionTokenDto,
} from "../contracts/plugin-connection.dto";
import { PluginConnectionsService } from "./plugin-connections.service";

@ApiTags("플러그인 연결")
@Controller("api/v1/plugin-connections")
export class PluginConnectionsController {
  constructor(
    @Inject(PluginConnectionsService)
    private readonly service: PluginConnectionsService,
  ) {}
  @Public()
  @Post()
  @ApiOperation({
    operationId: "createPluginConnection",
    summary: "플러그인 연결 요청 만들기",
  })
  @ApiCreatedResponse({ type: CreatedPluginConnectionDto })
  create() {
    return this.service.create();
  }

  @Get("requests/:requestToken")
  @ApiCookieAuth()
  @ApiOperation({
    operationId: "getPluginConnectionRequest",
    summary: "플러그인 연결 요청 확인",
  })
  @ApiOkResponse({ type: PluginConnectionStatusDto })
  inspect(@Param("requestToken") requestToken: string) {
    return this.service.inspect(requestToken);
  }

  @Post("requests/:requestToken/approve")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({
    operationId: "approvePluginConnection",
    summary: "플러그인 연결 승인",
  })
  @ApiNoContentResponse()
  approve(
    @Param("requestToken") requestToken: string,
    @CurrentAccount() accountId: string,
  ) {
    return this.service.approve(requestToken, accountId);
  }

  @Public()
  @Post("token")
  @HttpCode(200)
  @ApiOperation({
    operationId: "exchangePluginConnection",
    summary: "승인한 플러그인 연결 토큰 발급",
  })
  @ApiBody({ type: PluginConnectionRequestDto })
  @ApiOkResponse({ type: PluginConnectionTokenDto })
  @ApiAcceptedResponse({ type: PendingPluginConnectionDto })
  async exchange(
    @Body() dto: PluginConnectionRequestDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.exchange(dto.requestToken);
    if ("status" in result) response.status(202);
    return result;
  }

  @Delete("current")
  @HttpCode(204)
  @AllowPluginToken(true)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: "revokePluginConnection",
    summary: "현재 플러그인 연결 해제",
  })
  @ApiNoContentResponse()
  revoke(@Req() request: AuthenticatedRequest) {
    return this.service.revoke(request.pluginConnectionId as string);
  }
}
