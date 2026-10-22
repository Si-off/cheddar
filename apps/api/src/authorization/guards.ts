import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import {
  AuthService,
  SESSION_COOKIE,
  unauthenticated,
} from "../auth/auth.service";
import { AuthorizationService } from "./authorization.service";

const PUBLIC = Symbol("public");
const ADMIN_ONLY = Symbol("adminOnly");
const PLUGIN_TOKEN = Symbol("pluginToken");
export const AllowPluginToken = (required = false) =>
  SetMetadata(PLUGIN_TOKEN, { required });
export const Public = () => SetMetadata(PUBLIC, true);
export const AdminOnly = () => SetMetadata(ADMIN_ONLY, true);
export type AuthenticatedRequest = Request & {
  accountId: string;
  pluginConnectionId?: string;
};
export const CurrentAccount = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().accountId,
);
export function sessionCookie(request: Request) {
  return request.headers.cookie
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const plugin = this.reflector.getAllAndOverride<{ required: boolean }>(
      PLUGIN_TOKEN,
      targets,
    );
    if (request.headers.authorization !== undefined) {
      const bearer = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(
        request.headers.authorization,
      );
      if (!plugin || !bearer) throw unauthenticated();
      Object.assign(request, await this.auth.authenticatePlugin(bearer[1]));
    } else {
      if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets))
        return true;
      if (plugin?.required) throw unauthenticated();
      request.accountId = await this.auth.authenticate(sessionCookie(request));
    }
    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets))
      await this.authorization.assertAdmin(request.accountId);
    return true;
  }
}
