import { and, eq, lte } from "drizzle-orm";
import type { DatabaseTransaction } from "../database/database.service";
import { generationJobs } from "../database/schema";
import { ApiError } from "./errors";

// Call after taking the project's write lock, as all sheet writes do.
export async function expireGeneration(
  tx: DatabaseTransaction,
  sheetId: string,
) {
  await tx
    .update(generationJobs)
    .set({
      status: "failed",
      error:
        "생성 제한 시간이 지났습니다. 기존 시트는 유지됩니다. 다시 생성해주세요.",
    })
    .where(
      and(
        eq(generationJobs.sheetId, sheetId),
        eq(generationJobs.status, "running"),
        lte(generationJobs.expiresAt, new Date()),
      ),
    );
}
export async function assertSheetEditable(
  tx: DatabaseTransaction,
  sheetId: string,
) {
  await expireGeneration(tx, sheetId);
  const [running] = await tx
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.sheetId, sheetId),
        eq(generationJobs.status, "running"),
      ),
    )
    .limit(1);
  if (running)
    throw new ApiError(
      409,
      "GENERATION_RUNNING",
      "AI가 이 시트의 케이스를 생성하고 있습니다. 완료 후 다시 저장해주세요.",
    );
}
