import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { AccountsService, accountState } from "../accounts/accounts.service";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError } from "../common/errors";
import { DatabaseService } from "../database/database.service";
import {
  accounts,
  authTokens,
  pluginConnections,
  sessions,
} from "../database/schema";
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
const invalidToken = () =>
  new ApiError(
    410,
    "INVALID_AUTH_TOKEN",
    "링크가 만료되었거나 사용할 수 없습니다.",
  );
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
    if (!initial || !valid || accountState(initial) !== "active")
      throw new ApiError(
        401,
        "INVALID_CREDENTIALS",
        "아이디와 비밀번호를 확인해주세요. 계속 로그인할 수 없다면 관리자에게 문의해주세요.",
      );
    return this.authorization.mutate(async (tx) => {
      const current = await this.accountsService.row(initial.id, tx);
      if (
        current.passwordHash !== initial.passwordHash ||
        accountState(current) !== "active"
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
        expiresAt: accounts.expiresAt,
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
    if (!row || accountState(row) !== "active") throw unauthenticated();
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
        expiresAt: accounts.expiresAt,
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
    if (!row || accountState(row) !== "active") throw unauthenticated();
    return {
      accountId: row.accountId,
      pluginConnectionId: row.pluginConnectionId,
    };
  }
  async me(id: string, db: IdentityDatabase = this.database.db) {
    return {
      ...(await this.accountsService.detail(id, db)),
      permissions: await this.authorization.effective(id, db),
    };
  }
  private async tokenRecord(
    token: string,
    purpose: "invite" | "reset",
    db: IdentityDatabase,
  ) {
    const [row] = await db
      .select({ token: authTokens, account: accounts })
      .from(authTokens)
      .innerJoin(accounts, eq(accounts.id, authTokens.accountId))
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, sql`now()`),
        ),
      )
      .limit(1);
    if (
      !row ||
      (purpose === "invite"
        ? row.account.status !== "invited"
        : accountState(row.account) !== "active") ||
      (row.account.expiresAt && row.account.expiresAt.getTime() <= Date.now())
    )
      throw invalidToken();
    return row;
  }
  async inspectToken(token: string, purpose: "invite" | "reset") {
    const row = await this.tokenRecord(token, purpose, this.database.db);
    return {
      name: row.account.name,
      loginId: row.account.loginId,
      expiresAt: row.token.expiresAt.toISOString(),
    };
  }
  async setPassword(
    token: string,
    password: string,
    purpose: "invite" | "reset",
  ) {
    // Cheap validity check before the expensive hash; recheck under the write lock.
    await this.tokenRecord(token, purpose, this.database.db);
    const passwordHash = await hashPassword(password);
    await this.authorization.mutate(async (tx) => {
      const row = await this.tokenRecord(token, purpose, tx);
      await tx
        .update(accounts)
        .set({ passwordHash, status: "active", updatedAt: new Date() })
        .where(eq(accounts.id, row.account.id));
      await tx
        .update(authTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(authTokens.accountId, row.account.id),
            isNull(authTokens.consumedAt),
          ),
        );
      await tx.delete(sessions).where(eq(sessions.accountId, row.account.id));
      await revokeAccountPluginTokens(tx, row.account.id);
      await this.authorization.validateExpiry(tx, row.account.id);
    }, false);
  }
}
