import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import {
  AuthorizationService,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import { DatabaseService } from "../database/database.service";
import { accounts, affiliations } from "../database/schema";
@Injectable()
export class AffiliationsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
  ) {}
  list() {
    return this.database.db
      .select({ id: affiliations.id, name: affiliations.name })
      .from(affiliations)
      .orderBy(affiliations.name);
  }
  async detail(id: string, db: IdentityDatabase = this.database.db) {
    const [row] = await db
      .select({ id: affiliations.id, name: affiliations.name })
      .from(affiliations)
      .where(eq(affiliations.id, id));
    if (!row) throw notFound();
    return row;
  }
  async save(name: string, id?: string) {
    if (!name.trim()) throw invalid();
    return this.authorization.mutate(async (tx) => {
      if (id) {
        await this.detail(id, tx);
        await tx
          .update(affiliations)
          .set({ name: name.trim(), updatedAt: new Date() })
          .where(eq(affiliations.id, id));
        return this.detail(id, tx);
      }
      const [row] = await tx
        .insert(affiliations)
        .values({ name: name.trim() })
        .returning();
      return { id: row.id, name: row.name };
    });
  }
  async remove(id: string) {
    await this.authorization.mutate(async (tx) => {
      await this.detail(id, tx);
      if (
        (
          await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(eq(accounts.affiliationId, id))
            .limit(1)
        ).length
      )
        throw new ApiError(
          409,
          "AFFILIATION_IN_USE",
          "계정이 있는 소속은 삭제할 수 없습니다.",
        );
      await tx.delete(affiliations).where(eq(affiliations.id, id));
    });
  }
}
