import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { AccountsService } from "../accounts/accounts.service";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError } from "../common/errors";
import { DatabaseService } from "../database/database.service";
import { accounts, pluginConnections, sessions } from "../database/schema";
import {
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
} from "./credentials";
import { revokeAccountPluginTokens } from "./plugin-tokens";

export const SESSION_COOKIE = "cheddar_session";
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
export const unauthenticated = () =>
  new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
@Injectable()
export class AuthService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AccountsService) private readonly accountsService: AccountsService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async login(loginId: string, password: string) {
    const [initial] = await this.database.db
      .select()
      .from(accounts)
      .where(eq(accounts.loginId, loginId.trim().toLowerCase()));
    const valid = await verifyPassword(password, initial?.passwordHash ?? null);
    if (!initial || !valid || initial.status !== "active")
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "아이디와 비밀번호를 확인해주세요. 계속 로그인할 수 없다면 관리자에게 문의해주세요.",
      );
    return this.authorization.mutate(async (tx) => {
      const current = await this.accountsService.row(initial.id, tx);
      if (
        current.passwordHash !== initial.passwordHash ||
        current.status !== "active"
      )
        throw unauthenticated();
      const token = newToken();
      await tx.insert(sessions).values({
        accountId: current.id,
        tokenHash: hashToken(token),
        expiresAt: sql`now() + interval '30 days'`,
      });
      return { token, account: await this.me(current.id, tx) };
    }, false);
  }
  async authenticate(token?: string) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthenticated();
    const [row] = await this.database.db
      .select({
        id: accounts.id,
        status: accounts.status,
      })
      .from(sessions)
      .innerJoin(accounts, eq(accounts.id, sessions.accountId))
      .where(
        and(
          eq(sessions.tokenHash, hashToken(token)),
          gt(sessions.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    if (row?.status !== "active") throw unauthenticated();
    return row.id;
  }
  async logout(token?: string) {
    if (token)
      await this.database.db
        .delete(sessions)
        .where(eq(sessions.tokenHash, hashToken(token)));
  }
  async authenticatePlugin(token: string) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw unauthenticated();
    const [row] = await this.database.db
      .select({
        accountId: accounts.id,
        status: accounts.status,
        pluginConnectionId: pluginConnections.id,
      })
      .from(pluginConnections)
      .innerJoin(accounts, eq(accounts.id, pluginConnections.accountId))
      .where(
        and(
          eq(pluginConnections.tokenHash, hashToken(token)),
          eq(pluginConnections.status, "approved"),
          isNull(pluginConnections.revokedAt),
          gt(pluginConnections.tokenExpiresAt, sql`now()`),
        ),
      )
      .limit(1);
    if (row?.status !== "active") throw unauthenticated();
    return {
      accountId: row.accountId,
      pluginConnectionId: row.pluginConnectionId,
    };
  }
  async me(id: string, db: IdentityDatabase = this.database.db) {
    const {
      id: accountId,
      name,
      loginId,
      role,
      status,
    } = await this.accountsService.detail(id, db);
    return { id: accountId, name, loginId, role, status };
  }
  async changePassword(
    id: string,
    token: string | undefined,
    currentPassword: string,
    newPassword: string,
  ) {
    const initial = await this.accountsService.row(id);
    if (!(await verifyPassword(currentPassword, initial.passwordHash)))
      throw new ApiError(
        400,
        "CURRENT_PASSWORD_INCORRECT",
        "현재 비밀번호를 확인해주세요.",
      );
    const passwordHash = await hashPassword(newPassword);
    await this.authorization.mutate(async (tx) => {
      const current = await this.authorization.active(id, tx);
      // 비밀번호 확인 중 관리자 재설정이나 다른 변경이 먼저 완료되면 이 요청은 거부한다.
      if (current.passwordHash !== initial.passwordHash || !token)
        throw unauthenticated();
      const [session] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.accountId, id),
            eq(sessions.tokenHash, hashToken(token)),
            gt(sessions.expiresAt, sql`now()`),
          ),
        );
      if (!session) throw unauthenticated();
      await tx
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, id));
      await tx
        .delete(sessions)
        .where(and(eq(sessions.accountId, id), ne(sessions.id, session.id)));
      await revokeAccountPluginTokens(tx, id);
    });
  }
}
