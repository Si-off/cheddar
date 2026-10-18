import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { isUUID } from "class-validator";
import type { Request } from "express";
import { AuthService, SESSION_COOKIE } from "../auth/auth.service";
import { ApiError, invalid } from "../common/errors";
import { AuthorizationService } from "./authorization.service";
import type { Permission } from "./permissions";

const PUBLIC = Symbol("public");
const REQUIRED = Symbol("permission");
type Requirement = {
  /** 여러 개면 그중 하나만 있어도 된다 */
  permission: Permission | readonly Permission[];
  project?: { source: "params" | "body"; key: string };
};
export const Public = () => SetMetadata(PUBLIC, true);
export const RequirePermission = (
  permission: Permission | readonly Permission[],
  project?: Requirement["project"],
) => SetMetadata(REQUIRED, { permission, project } satisfies Requirement);
export type AuthenticatedRequest = Request & { accountId: string };
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
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    request.accountId = await this.auth.authenticate(sessionCookie(request));
    const required = this.reflector.getAllAndOverride<Requirement>(
      REQUIRED,
      targets,
    );
    if (required) {
      const projectId = required.project
        ? request[required.project.source]?.[required.project.key]
        : undefined;
      if (
        required.project &&
        (typeof projectId !== "string" || !isUUID(projectId))
      )
        throw invalid();
      const permissions: readonly Permission[] =
        typeof required.permission === "string"
          ? [required.permission]
          : required.permission;
      let allowed = false;
      for (const permission of permissions) {
        if (
          await this.authorization.can(
            request.accountId,
            permission,
            projectId as string | undefined,
          )
        ) {
          allowed = true;
          break;
        }
      }
      if (!allowed)
        throw new ApiError(403, "FORBIDDEN", "접근 권한이 없습니다.");
    }
    return true;
  }
}
