import { Inject, Injectable } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import { accounts } from "../database/schema";
import { LiveEvents } from "../live/live-events";

export type IdentityDatabase = DatabaseService["db"] | DatabaseTransaction;
export const activeAccount = () => eq(accounts.status, "active");
@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(LiveEvents) private readonly events: LiveEvents = new LiveEvents(),
  ) {}
  async active(accountId: string, db: IdentityDatabase = this.database.db) {
    const [account] = await db
      .select()
      .from(accounts)
      .where(and(eq(accounts.id, accountId), activeAccount()));
    if (!account)
      throw new ApiError(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    return account;
  }
  async assertAdmin(
    accountId: string,
    db: IdentityDatabase = this.database.db,
  ) {
    if ((await this.active(accountId, db)).role !== "admin")
      throw new ApiError(403, "FORBIDDEN", "접근 권한이 없습니다.");
  }
  private async assertAdminRemains(tx: DatabaseTransaction) {
    const [admin] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(activeAccount(), eq(accounts.role, "admin")))
      .limit(1);
    if (!admin)
      throw new ApiError(
        409,
        "LAST_ACTIVE_ADMIN",
        "활성 관리자가 한 명은 필요합니다.",
      );
  }
  // 계정 변경과 로그인은 같은 잠금을 사용해 마지막 관리자와 세션 폐기를 직렬화한다.
  async mutate<T>(
    work: (tx: DatabaseTransaction) => Promise<T>,
    protectAdmin = true,
  ): Promise<T> {
    const result = await this.database.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(724381019)`);
      const value = await work(tx);
      if (protectAdmin) await this.assertAdminRemains(tx);
      return value;
    });
    await this.events.publish({ type: "identity" });
    return result;
  }
}
