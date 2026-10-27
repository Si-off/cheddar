import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
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
import { ChangePasswordDto, LoginDto, MeDto } from "../contracts/identity.dto";
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
      sameSite: "lax",
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
      sameSite: "lax",
      secure: this.config.production === true,
      path: "/",
    });
  }
  @Get("me")
  @AllowPluginToken()
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ operationId: "getMe", summary: "내 계정 조회" })
  @ApiOkResponse({ type: MeDto })
  me(@CurrentAccount() id: string) {
    return this.service.me(id);
  }
  @Post("password")
  @HttpCode(204)
  @ApiCookieAuth()
  @ApiOperation({
    operationId: "changeMyPassword",
    summary: "내 비밀번호 바꾸기",
  })
  @ApiBody({ type: ChangePasswordDto })
  @ApiNoContentResponse()
  password(
    @CurrentAccount() id: string,
    @Req() request: Request,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.service.changePassword(
      id,
      sessionCookie(request),
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
