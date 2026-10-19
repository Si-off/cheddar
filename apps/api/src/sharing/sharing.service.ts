import { Inject, Injectable } from "@nestjs/common";
import { and, eq, ilike, notInArray, or } from "drizzle-orm";
import { newToken } from "../auth/credentials";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { activeAccount } from "../authorization/authorization.service";
import { ApiError } from "../common/errors";
import type {
  MemberAccessDto,
  PatchSharingDto,
  SharingDto,
  SharingPersonDto,
} from "../contracts/sharing.dto";
import type { DatabaseTransaction } from "../database/database.service";
import {
  accounts,
  affiliations,
  testSetMembers,
  testSets,
  visitorSessions,
} from "../database/schema";
import { LiveEvents } from "../live/live-events";
import {
  forbidden,
  hasGrant,
  TestSetsStore,
} from "../test-sets/test-sets.store";

const person = {
  id: accounts.id,
  name: accounts.name,
  email: accounts.email,
  affiliation: affiliations.name,
};
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
    const { row, access } = await this.store.visible(id, accountId, db);
    const grants = await this.store.authorization.effective(accountId, db);
    const canInvite =
      access.canEdit && hasGrant(grants, "test_set.invite", row.projectId);
    const canManageLink =
      access.canEdit && hasGrant(grants, "test_set.public_link", row.projectId);
    const [owner] = await db
      .select(person)
      .from(accounts)
      .leftJoin(affiliations, eq(affiliations.id, accounts.affiliationId))
      .where(eq(accounts.id, row.ownerId));
    const members = await db
      .select({ person, access: testSetMembers.access })
      .from(testSetMembers)
      .innerJoin(accounts, eq(accounts.id, testSetMembers.accountId))
      .leftJoin(affiliations, eq(affiliations.id, accounts.affiliationId))
      .where(
        and(
          eq(testSetMembers.testSetId, id),
          notInArray(accounts.id, [row.ownerId]),
        ),
      )
      .orderBy(accounts.name, accounts.id);
    return {
      visibility: row.visibility as "private" | "public",
      linkAccess: row.linkAccess,
      linkToken:
        canManageLink || row.visibility === "public" ? row.linkToken : null,
      canInvite,
      canManageLink,
      owner,
      members,
    };
  }
  async change(
    id: string,
    accountId: string,
    work: (db: DatabaseTransaction, state: SharingDto) => Promise<void>,
    manageLink: boolean,
    reason: string,
    closeLinks = false,
  ) {
    // 응답과 권한 재검사는 같은 세트 행 잠금 안에서 처리한다.
    const result = await this.store.database.db.transaction(async (tx) => {
      await this.store.visible(id, accountId, tx, true);
      const state = await this.detail(id, accountId, tx);
      if (!(manageLink ? state.canManageLink : state.canInvite))
        throw forbidden();
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
            linkAccess: dto.linkAccess ?? state.linkAccess,
            linkToken:
              visibility === "private" ? null : (state.linkToken ?? newToken()),
          })
          .where(eq(testSets.id, id));
      },
      true,
      "SHARING_CHANGED",
      dto.visibility === "private",
    );
  }
  rotate(id: string, accountId: string) {
    return this.change(
      id,
      accountId,
      async (tx) => {
        await tx
          .update(testSets)
          .set({ linkToken: newToken() })
          .where(eq(testSets.id, id));
        await tx
          .delete(visitorSessions)
          .where(eq(visitorSessions.testSetId, id));
      },
      true,
      "LINK_REPLACED",
      true,
    );
  }
  async candidates(
    id: string,
    accountId: string,
    search: string,
  ): Promise<SharingPersonDto[]> {
    const state = await this.detail(id, accountId);
    if (!state.canInvite) throw forbidden();
    const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    return this.store.database.db
      .select(person)
      .from(accounts)
      .leftJoin(affiliations, eq(affiliations.id, accounts.affiliationId))
      .where(
        and(
          activeAccount(),
          notInArray(accounts.id, [
            state.owner.id,
            ...state.members.map((m) => m.person.id),
          ]),
          or(ilike(accounts.name, pattern), ilike(accounts.email, pattern)),
        ),
      )
      .orderBy(accounts.name, accounts.id)
      .limit(20);
  }
  member(
    id: string,
    accountId: string,
    targetId: string,
    dto?: MemberAccessDto,
  ) {
    return this.change(
      id,
      accountId,
      async (tx, state) => {
        if (targetId.toLowerCase() === state.owner.id)
          throw new ApiError(
            409,
            "OWNER_PROTECTED",
            "소유자는 구성원으로 추가하거나 제거할 수 없습니다.",
          );
        if (dto) {
          const [target] = await tx
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(eq(accounts.id, targetId), activeAccount()))
            .for("share");
          if (!target)
            throw new ApiError(
              409,
              "ACCOUNT_NOT_ACTIVE",
              "활성 계정만 초대할 수 있습니다.",
            );
          await tx
            .insert(testSetMembers)
            .values({ testSetId: id, accountId: targetId, access: dto.access })
            .onConflictDoUpdate({
              target: [testSetMembers.testSetId, testSetMembers.accountId],
              set: { access: dto.access },
            });
        } else
          await tx
            .delete(testSetMembers)
            .where(
              and(
                eq(testSetMembers.testSetId, id),
                eq(testSetMembers.accountId, targetId),
              ),
            );
      },
      false,
      "MEMBERSHIP_CHANGED",
    );
  }
}
