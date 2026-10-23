import { Inject, Injectable } from "@nestjs/common";
import { and, count, eq, ilike, or } from "drizzle-orm";
import { hashPassword } from "../auth/credentials";
import { revokeAccountPluginTokens } from "../auth/plugin-tokens";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  AccountDto,
  AccountQueryDto,
  CreateAccountDto,
  UpdateAccountDto,
} from "../contracts/identity.dto";
import { DatabaseService } from "../database/database.service";
import { accounts, sessions } from "../database/schema";

const cleanName = (value: string) => {
  const name = value.trim();
  if (!name) throw invalid();
  return name;
};
@Injectable()
export class AccountsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  async row(id: string, db: IdentityDatabase = this.database.db) {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, id));
    if (!row) throw notFound();
    return row;
  }
  async detail(
    id: string,
    db: IdentityDatabase = this.database.db,
  ): Promise<AccountDto> {
    const row = await this.row(id, db);
    return {
      id: row.id,
      name: row.name,
      loginId: row.loginId,
      role: row.role,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async list(query: AccountQueryDto) {
    const search = query.search?.replace(/[\\%_]/g, "\\$&");
    const where = and(
      search
        ? or(
            ilike(accounts.name, `%${search}%`),
            ilike(accounts.loginId, `%${search}%`),
          )
        : undefined,
      query.role ? eq(accounts.role, query.role) : undefined,
      query.status ? eq(accounts.status, query.status) : undefined,
    );
    return this.database.db.transaction(
      async (tx) => {
        const [total] = await tx
          .select({ value: count() })
          .from(accounts)
          .where(where);
        const ids = await tx
          .select({ id: accounts.id })
          .from(accounts)
          .where(where)
          .orderBy(accounts.name, accounts.id)
          .limit(query.limit)
          .offset(query.offset);
        return {
          total: total.value,
          items: await Promise.all(ids.map((row) => this.detail(row.id, tx))),
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  async create(dto: CreateAccountDto) {
    const passwordHash = await hashPassword(dto.password);
    return this.authorization.mutate(async (tx) => {
      const [account] = await tx
        .insert(accounts)
        .values({
          name: cleanName(dto.name),
          loginId: dto.loginId.trim().toLowerCase(),
          role: dto.role,
          passwordHash,
          status: "active",
        })
        .returning();
      return this.detail(account.id, tx);
    });
  }
  async update(id: string, dto: UpdateAccountDto) {
    return this.authorization.mutate(async (tx) => {
      await this.row(id, tx);
      await tx
        .update(accounts)
        .set({
          ...(dto.name === undefined ? {} : { name: cleanName(dto.name) }),
          ...(dto.role === undefined ? {} : { role: dto.role }),
          updatedAt: new Date(),
        })
        .where(eq(accounts.id, id));
      return this.detail(id, tx);
    });
  }
  async setActive(id: string, active: boolean) {
    return this.authorization.mutate(async (tx) => {
      const account = await this.row(id, tx);
      if (active && !account.passwordHash)
        throw new ApiError(
          409,
          "PASSWORD_REQUIRED",
          "먼저 비밀번호를 정해주세요.",
        );
      await tx
        .update(accounts)
        .set({ status: active ? "active" : "inactive", updatedAt: new Date() })
        .where(eq(accounts.id, id));
      if (!active) {
        await tx.delete(sessions).where(eq(sessions.accountId, id));
        await revokeAccountPluginTokens(tx, id);
      }
      return this.detail(id, tx);
    });
  }
  async resetPassword(id: string, password: string) {
    const passwordHash = await hashPassword(password);
    await this.authorization.mutate(async (tx) => {
      await this.row(id, tx);
      await tx
        .update(accounts)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(accounts.id, id));
      await tx.delete(sessions).where(eq(sessions.accountId, id));
      await revokeAccountPluginTokens(tx, id);
    });
  }
}
