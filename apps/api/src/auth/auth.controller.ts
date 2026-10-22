import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request, Response } from "express";
import {
  AllowPluginToken,
  CurrentAccount,
  Public,
  sessionCookie,
} from "../authorization/guards";
import { API_ENV, type ApiEnv } from "../config/env";
import {
  LoginDto,
  MeDto,
  SetPasswordDto,
  TokenInfoDto,
  TokenQueryDto,
} from "../contracts/identity.dto";
import { AuthService, SESSION_COOKIE, SESSION_SECONDS } from "./auth.service";

@ApiTags("인증")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly service: AuthService,
    @Inject(API_ENV) private readonly config: ApiEnv,
  ) {}
  @Public()
  @Post("login")
  @HttpCode(200)
  @ApiOperation({ operationId: "login", summary: "아이디와 비밀번호로 로그인" })
  @ApiOkResponse({ type: MeDto })
  @ApiBody({ type: LoginDto })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.login(dto.loginId, dto.password);
    response.cookie(SESSION_COOKIE, result.token, {
      httpOnly: true,
      sameSite: this.config.cookieSameSite,
      secure: this.config.production === true,
      path: "/",
      maxAge: SESSION_SECONDS * 1000,
    });
    return result.account;
  }
  @Public()
  @Post("logout")
  @HttpCode(204)
  @ApiOperation({ operationId: "logout", summary: "현재 세션 로그아웃" })
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.service.logout(sessionCookie(request));
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: this.config.cookieSameSite,
      secure: this.config.production === true,
      path: "/",
    });
  }
  @Get("me")
  @AllowPluginToken()
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ operationId: "getMe", summary: "내 계정과 유효 권한 조회" })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentAccount() id: string) {
    return this.service.me(id);
  }
  @Public()
  @Get("invitations")
  @ApiOperation({ operationId: "inspectInvitation", summary: "초대 링크 확인" })
  @ApiOkResponse({ type: TokenInfoDto })
  @ApiQuery({ type: TokenQueryDto })
  invitation(@Query() dto: TokenQueryDto) {
    return this.service.inspectToken(dto.token, "invite");
  }
  @Public()
  @Post("invitations/accept")
  @HttpCode(204)
  @ApiOperation({
    operationId: "acceptInvitation",
    summary: "초대 수락과 비밀번호 설정",
  })
  @ApiNoContentResponse()
  @ApiBody({ type: SetPasswordDto })
  accept(@Body() dto: SetPasswordDto) {
    return this.service.setPassword(dto.token, dto.password, "invite");
  }
  @Public()
  @Get("password-resets")
  @ApiOperation({
    operationId: "inspectPasswordReset",
    summary: "비밀번호 재설정 링크 확인",
  })
  @ApiOkResponse({ type: TokenInfoDto })
  @ApiQuery({ type: TokenQueryDto })
  resetInfo(@Query() dto: TokenQueryDto) {
    return this.service.inspectToken(dto.token, "reset");
  }
  @Public()
  @Post("password-resets")
  @HttpCode(204)
  @ApiOperation({ operationId: "resetPassword", summary: "비밀번호 재설정" })
  @ApiNoContentResponse()
  @ApiBody({ type: SetPasswordDto })
  reset(@Body() dto: SetPasswordDto) {
    return this.service.setPassword(dto.token, dto.password, "reset");
  }
}
