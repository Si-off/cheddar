import { and, eq, isNull } from "drizzle-orm";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { pluginConnections } from "../database/schema";

export async function revokeAccountPluginTokens(
  db: IdentityDatabase,
  accountId: string,
) {
  await db
    .update(pluginConnections)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(
      and(
        eq(pluginConnections.accountId, accountId),
        isNull(pluginConnections.revokedAt),
      ),
    );
}
