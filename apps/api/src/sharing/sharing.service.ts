import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { newToken } from "../auth/credentials";
import type { IdentityDatabase } from "../authorization/authorization.service";
import type { PatchSharingDto, SharingDto } from "../contracts/sharing.dto";
import type { DatabaseTransaction } from "../database/database.service";
import { testSets, visitorSessions } from "../database/schema";
import { LiveEvents } from "../live/live-events";
import { TestSetsStore } from "../test-sets/test-sets.store";

@Injectable()
export class SharingService {
  constructor(
    @Inject(TestSetsStore) private readonly store: TestSetsStore,
    @Inject(LiveEvents) private readonly events: LiveEvents,
  ) {}
  async detail(
    id: string,
    accountId: string,
    db: IdentityDatabase = this.store.database.db,
  ): Promise<SharingDto> {
    const { row } = await this.store.visible(id, accountId, db);
    return {
      visibility: row.visibility as "private" | "public",
      linkPermission: row.linkAccess,
      linkToken: row.linkToken,
    };
  }
  private async change(
    id: string,
    accountId: string,
    work: (tx: DatabaseTransaction, state: SharingDto) => Promise<void>,
    reason: string,
    closeLinks = false,
  ) {
    const result = await this.store.database.db.transaction(async (tx) => {
      await this.store.visible(id, accountId, tx, true);
      const state = await this.detail(id, accountId, tx);
      await work(tx, state);
      await this.store.bump(id, tx);
      return this.detail(id, accountId, tx);
    });
    await this.events.publish({
      type: "resync",
      testSetId: id,
      reason,
      closeLinks,
    });
    return result;
  }
  patch(id: string, accountId: string, dto: PatchSharingDto) {
    return this.change(
      id,
      accountId,
      async (tx, state) => {
        const visibility = dto.visibility ?? state.visibility;
        if (visibility !== state.visibility)
          await tx
            .delete(visitorSessions)
            .where(eq(visitorSessions.testSetId, id));
        await tx
          .update(testSets)
          .set({
            visibility,
            linkAccess: dto.linkPermission ?? state.linkPermission,
            linkToken:
              visibility === "private" ? null : (state.linkToken ?? newToken()),
          })
          .where(eq(testSets.id, id));
      },
      "SHARING_CHANGED",
      dto.visibility === "private",
    );
  }
  rotate(id: string, accountId: string) {
    return this.change(
      id,
      accountId,
      async (tx, state) => {
        await tx
          .update(testSets)
          .set({ linkToken: state.visibility === "public" ? newToken() : null })
          .where(eq(testSets.id, id));
        await tx
          .delete(visitorSessions)
          .where(eq(visitorSessions.testSetId, id));
      },
      "LINK_REPLACED",
      true,
    );
  }
}
