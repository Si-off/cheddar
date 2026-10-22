import { eq } from "drizzle-orm";
import type { AuthorizationService } from "../authorization/authorization.service";
import { ApiError, invalid } from "../common/errors";
import { LOGIN_ID_PATTERN } from "../contracts/identity.dto";
import { accounts, roleAssignments, roles } from "../database/schema";
import { DEFAULT_AFFILIATION_ID, seedInitialData } from "../database/seed";
import type { AccountsService } from "./accounts.service";
export async function createFirstAdministrator(
  authorization: AuthorizationService,
  service: AccountsService,
  loginId: string,
  name: string,
) {
  loginId = loginId.trim().toLowerCase();
  name = name.trim();
  if (!LOGIN_ID_PATTERN.test(loginId) || !name || name.length > 100)
    throw invalid();
  return authorization.mutate(async (tx) => {
    await seedInitialData(tx);
    if ((await tx.select({ id: accounts.id }).from(accounts).limit(1)).length)
      throw new ApiError(
        409,
        "ALREADY_BOOTSTRAPPED",
        "첫 관리자 계정이 이미 만들어졌습니다.",
      );
    const [role] = await tx
      .select()
      .from(roles)
      .where(eq(roles.systemKey, "administrator"));
    if (!role) throw new Error("기본 관리자 역할이 없습니다.");
    const [account] = await tx
      .insert(accounts)
      .values({ name, loginId, affiliationId: DEFAULT_AFFILIATION_ID })
      .returning();
    await tx
      .insert(roleAssignments)
      .values({ accountId: account.id, roleId: role.id, scope: "global" });
    return {
      account: await service.detail(account.id, tx),
      ...(await service.issueToken(account.id, "invite", tx)),
    };
  }, false);
}
