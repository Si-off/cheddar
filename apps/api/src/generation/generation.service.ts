import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import {
  activeAccount,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  CreateGenerationDto,
  GenerationCurrentDto,
} from "../contracts/generation.dto";
import type { DatabaseTransaction } from "../database/database.service";
import {
  accounts,
  featureGroups,
  generationJobs,
  generationSteps,
  requiredCases,
  reviewItems,
  screenStructureItems,
  tempUploads,
  testSets,
} from "../database/schema";
import { TempUploadsService } from "../temp-uploads/temp-uploads.service";
import { TestSetsStore } from "../test-sets/test-sets.store";
import { QueueService } from "./queue.service";
import type { GenerationInput } from "./types";

export const generationRunning = () =>
  new ApiError(409, "GENERATION_RUNNING", "이미 케이스를 만들고 있습니다.");
export const generationErrorMessage =
  "케이스를 만들지 못했습니다. 테스트 세트에서 설명으로 케이스 추가 생성을 실행하세요.";
export const rewriteErrorMessage =
  "다시 작성하지 못했습니다. 답변을 확인하고 다시 시도해주세요.";
export function currentDto(
  job: typeof generationJobs.$inferSelect,
): GenerationCurrentDto {
  return {
    jobId: job.id,
    kind: job.kind,
    status:
      job.status === "pending"
        ? "queued"
        : job.status === "completed"
          ? "succeeded"
          : job.status,
    stage: job.kind === "rewrite" ? null : job.currentStage,
    addedCount: job.addedCount,
    reviewCount: job.reviewCount,
    errorMessage:
      job.status === "failed"
        ? job.kind === "rewrite"
          ? rewriteErrorMessage
          : generationErrorMessage
        : null,
  };
}
@Injectable()
export class GenerationService {
  constructor(
    @Inject(TestSetsStore) readonly store: TestSetsStore,
    @Inject(TempUploadsService) private readonly uploads: TempUploadsService,
    @Inject(QueueService) readonly queue: QueueService,
  ) {}
  async assertIdle(testSetId: string, tx: DatabaseTransaction) {
    const [job] = await tx
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.testSetId, testSetId),
          inArray(generationJobs.status, ["pending", "running"]),
        ),
      );
    if (job) throw generationRunning();
  }
  async create(testSetId: string, accountId: string, dto: CreateGenerationDto) {
    const jobId = await this.store.mutate(
      testSetId,
      accountId,
      "canEdit",
      async (tx, row) => {
        await this.assertIdle(testSetId, tx);
        if (!dto.uploadId && (!dto.memo?.trim() || dto.kind === "initial"))
          throw invalid();
        let frames: GenerationInput["frames"] = [];
        if (dto.uploadId) {
          const upload = await this.uploads.owned(
            dto.uploadId,
            accountId,
            tx,
            true,
          );
          if (upload.claimedAt) throw notFound();
          frames = await this.uploads.frames(dto.uploadId, tx);
          await tx
            .update(tempUploads)
            .set({ claimedAt: new Date() })
            .where(eq(tempUploads.id, dto.uploadId));
        }
        // 다른 세트의 스타일 예시도 요청자에게 보이는 자료만 사용한다.
        const recent = await tx
          .select()
          .from(testSets)
          .where(
            and(
              eq(testSets.projectId, row.projectId),
              ne(testSets.id, testSetId),
            ),
          )
          .orderBy(desc(testSets.updatedAt))
          .limit(5);
        const styleExamples: GenerationInput["styleExamples"] = [];
        for (const set of recent) {
          try {
            await this.store.visible(set.id, accountId, tx);
          } catch (error) {
            if (error instanceof ApiError && error.getStatus() === 404)
              continue;
            throw error;
          }
          // 열 UUID는 세트별로 달라 이름과 형식이 같은 현재 열로 매핑한다.
          const oldColumns = await this.store.columns(set.id, tx);
          const columns = await this.store.columns(testSetId, tx);
          for (const c of (await this.store.cases(set.id, tx)).slice(0, 3))
            styleExamples.push({
              id: c.id,
              values: Object.fromEntries(
                columns.flatMap((column) => {
                  const old = oldColumns.find(
                    (o) => o.name === column.name && o.type === column.type,
                  );
                  return old && c.values[old.id] !== undefined
                    ? [[column.id, c.values[old.id]]]
                    : [];
                }),
              ),
            });
          if (styleExamples.length >= 6) break;
        }
        const input: GenerationInput = {
          columns: await this.store.columns(testSetId, tx),
          memo: dto.memo ?? row.memo,
          frames,
          featureGroups: await tx
            .select()
            .from(featureGroups)
            .where(eq(featureGroups.projectId, row.projectId))
            .orderBy(featureGroups.position, featureGroups.id),
          requiredCases: await tx
            .select()
            .from(requiredCases)
            .where(
              and(
                eq(requiredCases.projectId, row.projectId),
                eq(requiredCases.enabled, true),
              ),
            )
            .orderBy(requiredCases.position, requiredCases.id),
          screenStructure: await tx
            .select()
            .from(screenStructureItems)
            .where(eq(screenStructureItems.projectId, row.projectId))
            .orderBy(screenStructureItems.position, screenStructureItems.id),
          styleExamples: styleExamples.slice(0, 6),
          existingCases:
            dto.kind === "append" ? await this.store.cases(testSetId, tx) : [],
        };
        return this.insertJob(
          tx,
          testSetId,
          accountId,
          dto.kind,
          input,
          dto.uploadId,
        );
      },
    );
    await this.dispatch(jobId, "screens");
    return { jobId };
  }
  async insertJob(
    tx: DatabaseTransaction,
    testSetId: string,
    accountId: string,
    kind: "initial" | "append" | "rewrite",
    input: GenerationInput,
    uploadId?: string,
    reviewItemId?: string,
  ) {
    const id = randomUUID();
    await tx.insert(generationJobs).values({
      id,
      testSetId,
      requestedBy: accountId,
      uploadId,
      kind,
      reviewItemId,
      currentStage: kind === "rewrite" ? "rewrite" : "screens",
    });
    await tx.insert(generationSteps).values({
      jobId: id,
      stage: "context",
      workKey: "context",
      status: "completed",
      input,
    });
    return id;
  }
  async dispatch(jobId: string, stage: string) {
    // jobs가 영속 outbox다. 큐 전송 중 종료되거나 연결이 끊겨도 복구 스캔이 다시 넣는다.
    try {
      await this.queue.enqueue(jobId, stage);
    } catch {
      process.stderr.write(`생성 작업 전송 대기: ${jobId}\n`);
    }
  }
  async current(
    testSetId: string,
    accountId: string,
  ): Promise<GenerationCurrentDto | null> {
    await this.store.visible(testSetId, accountId);
    const [row] = await this.store.database.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.testSetId, testSetId))
      .orderBy(
        sql`case when ${generationJobs.status} in ('pending','running') then 0 else 1 end`,
        desc(generationJobs.createdAt),
        desc(generationJobs.id),
      )
      .limit(1);
    return row ? currentDto(row) : null;
  }
  async visibleJob(jobId: string, accountId: string) {
    const [account] = await this.store.database.db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), activeAccount()));
    if (!account) throw notFound();
    const [row] = await this.store.database.db
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, jobId));
    if (!row) throw notFound();
    await this.store.visible(row.testSetId, accountId);
    return currentDto(row);
  }
  async recover() {
    const rows = await this.store.database.db
      .select()
      .from(generationJobs)
      .where(inArray(generationJobs.status, ["pending", "running"]));
    for (const row of rows)
      await this.dispatch(
        row.id,
        row.currentStage ?? (row.kind === "rewrite" ? "rewrite" : "screens"),
      );
  }
  async assertActor(
    testSetId: string,
    accountId: string,
    db: IdentityDatabase = this.store.database.db,
  ) {
    const [account] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.id, accountId), activeAccount()));
    if (!account) throw notFound();
    const { access } = await this.store.visible(testSetId, accountId, db);
    if (!access.canEdit)
      throw new ApiError(403, "FORBIDDEN", "이 작업을 할 권한이 없습니다.");
  }
  async startedStages(jobId: string) {
    const rows = await this.store.database.db
      .select({ stage: generationSteps.stage })
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, jobId),
          sql`${generationSteps.startedAt} is not null`,
        ),
      );
    const stages = new Set(rows.map((r) => r.stage));
    return ["screens", "flows", "cases", "finish"].filter((stage) =>
      stages.has(stage),
    );
  }
  async cleanupJob(jobId: string) {
    await this.store.database.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .for("update");
      if (!row || !["completed", "failed"].includes(row.status)) return;
      await tx
        .update(generationSteps)
        .set({ input: null, output: null })
        .where(eq(generationSteps.jobId, jobId));
      if (row.uploadId) await this.uploads.remove(row.uploadId, tx);
    });
  }
  async fail(jobId: string, code: string) {
    await this.store.database.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .for("update");
      if (!job || ["completed", "failed"].includes(job.status)) return;
      await tx
        .update(generationJobs)
        .set({ status: "failed", errorCode: code, updatedAt: new Date() })
        .where(eq(generationJobs.id, jobId));
      if (job.reviewItemId)
        await tx
          .update(reviewItems)
          .set({ status: "pending", updatedAt: new Date() })
          .where(
            and(
              eq(reviewItems.id, job.reviewItemId),
              eq(reviewItems.status, "rewriting"),
            ),
          );
    });
    await this.cleanupJob(jobId);
  }
}
