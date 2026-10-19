import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, sql } from "drizzle-orm";
import { AuthService, unauthenticated } from "../auth/auth.service";
import { hashToken, newToken } from "../auth/credentials";
import {
  AuthorizationService,
  activeAccount,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import { DatabaseService } from "../database/database.service";
import { accounts, pluginConnections } from "../database/schema";

const expired = () =>
  new ApiError(
    410,
    "PLUGIN_CONNECTION_EXPIRED",
    "플러그인 연결 요청이 만료되었거나 사용할 수 없습니다.",
  );

@Injectable()
export class PluginConnectionsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}
  async create() {
    const requestToken = newToken();
    const [row] = await this.database.db
      .insert(pluginConnections)
      .values({
        requestTokenHash: hashToken(requestToken),
        expiresAt: sql`now() + interval '10 minutes'`,
      })
      .returning();
    return { requestToken, expiresAt: row.expiresAt.toISOString() };
  }
  private async request(requestToken: string, db: IdentityDatabase) {
    const [row] = await db
      .select({
        connection: pluginConnections,
        unexpired: sql<boolean>`${pluginConnections.expiresAt} > now()`,
      })
      .from(pluginConnections)
      .where(eq(pluginConnections.requestTokenHash, hashToken(requestToken)));
    return row;
  }
  async inspect(requestToken: string) {
    const row = await this.request(requestToken, this.database.db);
    if (!row) throw notFound();
    return {
      status:
        !row.unexpired || row.connection.status === "revoked"
          ? "expired"
          : row.connection.status,
    };
  }
  async approve(requestToken: string, accountId: string) {
    await this.authorization.mutate(async (tx) => {
      const [account] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), activeAccount()));
      if (!account) throw unauthenticated();
      const row = await this.request(requestToken, tx);
      if (!row) throw notFound();
      if (!row.unexpired || row.connection.status === "revoked")
        throw expired();
      if (row.connection.status !== "pending")
        throw new ApiError(
          409,
          "PLUGIN_CONNECTION_ALREADY_APPROVED",
          "이미 승인된 플러그인 연결입니다.",
        );
      await tx
        .update(pluginConnections)
        .set({ accountId, status: "approved", approvedAt: sql`now()` })
        .where(eq(pluginConnections.id, row.connection.id));
    }, false);
  }
  async exchange(requestToken: string) {
    // 2초 간격의 승인 대기 조회는 계정 변경 이벤트를 발행하지 않는다.
    const pending = await this.request(requestToken, this.database.db);
    if (pending?.unexpired && pending.connection.status === "pending")
      return { status: "pending" as const };
    return this.authorization.mutate(async (tx) => {
      const row = await this.request(requestToken, tx);
      if (
        !row?.unexpired ||
        row.connection.status === "revoked" ||
        row.connection.tokenHash
      )
        throw expired();
      if (row.connection.status === "pending")
        return { status: "pending" as const };
      const accountId = row.connection.accountId;
      if (!accountId) throw expired();
      const [account] = await tx
        .select({ id: accounts.id })
        .from(accounts)
        .where(and(eq(accounts.id, accountId), activeAccount()));
      if (!account) throw expired();
      const token = newToken();
      await tx
        .update(pluginConnections)
        .set({
          tokenHash: hashToken(token),
          tokenExpiresAt: sql`now() + interval '30 days'`,
        })
        .where(eq(pluginConnections.id, row.connection.id));
      return { token, account: await this.auth.me(accountId, tx) };
    }, false);
  }
  async revoke(connectionId: string) {
    await this.database.db
      .update(pluginConnections)
      .set({ status: "revoked", revokedAt: sql`now()` })
      .where(
        and(
          eq(pluginConnections.id, connectionId),
          gt(pluginConnections.tokenExpiresAt, sql`now()`),
        ),
      );
  }
}
