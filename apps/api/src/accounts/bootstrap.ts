import { randomBytes } from "node:crypto";
import { hashPassword } from "../auth/credentials";
import type { AuthorizationService } from "../authorization/authorization.service";
import { ApiError, invalid } from "../common/errors";
import { LOGIN_ID_PATTERN } from "../contracts/identity.dto";
import { accounts } from "../database/schema";
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
  const password = randomBytes(18).toString("base64url");
  const passwordHash = await hashPassword(password);
  return authorization.mutate(async (tx) => {
    if ((await tx.select({ id: accounts.id }).from(accounts).limit(1)).length)
      throw new ApiError(
        409,
        "ALREADY_BOOTSTRAPPED",
        "첫 관리자 계정이 이미 만들어졌습니다.",
      );
    const [account] = await tx
      .insert(accounts)
      .values({ name, loginId, role: "admin", status: "active", passwordHash })
      .returning();
    return { account: await service.detail(account.id, tx), password };
  });
}
