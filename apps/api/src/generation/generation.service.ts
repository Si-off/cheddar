import { createHash, randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, count, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";
import {
  activeAccount,
  type IdentityDatabase,
} from "../authorization/authorization.service";
import { ApiError, invalid, notFound } from "../common/errors";
import { API_ENV, type ApiEnv } from "../config/env";
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
  projectMemos,
  reviewItems,
  screenStructureItems,
  tempUploads,
  testSets,
} from "../database/schema";
import { TempUploadsService } from "../temp-uploads/temp-uploads.service";
import { TestSetsStore } from "../test-sets/test-sets.store";
import { QueueService } from "./queue.service";
import { STYLE_BLOCK_ROWS, scenarioBlock } from "./scenarios";
import { isAiColumn } from "./steps/column-rules";
import { applicableViewpoints } from "./steps/viewpoints";
import type { GenerationInput } from "./types";
import { AiUsageService } from "./usage.service";

export const jobFinished = () => ({
  finishedAt: new Date(),
  durationMs: sql`greatest(0, floor(extract(epoch from (now() - ${generationJobs.createdAt})) * 1000))::bigint`,
});

export const generationRunning = () =>
  new ApiError(409, "GENERATION_RUNNING", "이미 케이스를 만들고 있습니다.");
export const generationErrorMessage =
  "케이스를 만들지 못했습니다. 테스트 세트에서 설명으로 케이스 추가 생성을 실행하세요.";
export const rewriteErrorMessage =
  "다시 작성하지 못했습니다. 답변을 확인하고 다시 시도해주세요.";
export const fillColumnErrorMessage =
  "열을 채우지 못했습니다. 작성 기준을 확인하고 다시 시도해주세요.";
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
    stage: ["rewrite", "fill_column"].includes(job.kind)
      ? null
      : job.currentStage,
    addedCount: job.addedCount,
    reviewCount: job.reviewCount,
    errorMessage:
      job.status === "failed"
        ? job.kind === "fill_column"
          ? fillColumnErrorMessage
          : job.kind === "rewrite"
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
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(AiUsageService) readonly usage: AiUsageService,
  ) {}
  async admission(tx: DatabaseTransaction) {
    await tx.execute(sql`select pg_advisory_xact_lock(31015433)`);
    const [active] = await tx
      .select({ count: count() })
      .from(generationJobs)
      .where(inArray(generationJobs.status, ["pending", "running"]));
    if (active.count >= (this.env.generationConcurrency ?? 2))
      throw new ApiError(
        429,
        "GENERATION_CAPACITY",
        "현재 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.",
      );
  }
  requestHash(testSetId: string, request: object) {
    return createHash("sha256")
      .update(JSON.stringify({ testSetId, ...request }))
      .digest("hex");
  }
  async repeated(
    tx: DatabaseTransaction,
    accountId: string,
    clientRequestId: string | undefined,
    hash: string,
  ) {
    if (!clientRequestId) return;
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`generation-request:${accountId}:${clientRequestId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.requestedBy, accountId),
          eq(generationJobs.clientRequestId, clientRequestId),
        ),
      );
    if (existing && existing.requestHash !== hash)
      throw new ApiError(
        409,
        "REQUEST_REUSED",
        "이 생성 요청은 이미 사용되었습니다. 생성 상태를 확인해주세요.",
      );
    return existing?.id;
  }
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
    await this.expireJobs();
    const jobId = await this.store.mutate(
      testSetId,
      accountId,
      "canEdit",
      async (tx, row) => {
        const hash = this.requestHash(testSetId, {
          kind: dto.kind,
          uploadId: dto.uploadId ?? null,
          memo: dto.memo ?? null,
          frameIds: [
            ...new Set(dto.frameIds?.map((id) => id.toLowerCase()) ?? []),
          ].sort(),
        });
        const repeated = await this.repeated(
          tx,
          accountId,
          dto.clientRequestId,
          hash,
        );
        if (repeated) return repeated;
        await this.assertIdle(testSetId, tx);
        await this.admission(tx);
        if (!dto.uploadId && (!dto.memo?.trim() || dto.kind === "initial"))
          throw invalid();
        if (dto.frameIds?.length && !dto.uploadId) throw invalid();
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
          if (dto.frameIds?.length) {
            const selected = new Set(
              dto.frameIds.map((id) => id.toLowerCase()),
            );
            if ([...selected].some((id) => !frames.some((f) => f.id === id)))
              throw invalid();
            frames = frames.filter((frame) => selected.has(frame.id));
          }
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
          const mapped = (await this.store.cases(set.id, tx)).map((c) => ({
            id: c.id,
            featureGroupId: c.featureGroupId,
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
          }));
          // 행을 나누는 방식이 보이도록 여러 행으로 된 시나리오 하나를 통째로 넣는다.
          styleExamples.push(
            ...scenarioBlock(columns, mapped).slice(0, STYLE_BLOCK_ROWS),
          );
          if (styleExamples.length >= STYLE_BLOCK_ROWS) break;
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
          viewpoints: [],
          screenStructure: await tx
            .select()
            .from(screenStructureItems)
            .where(eq(screenStructureItems.projectId, row.projectId))
            .orderBy(screenStructureItems.position, screenStructureItems.id),
          styleExamples: styleExamples.slice(0, STYLE_BLOCK_ROWS * 2),
          existingCases:
            dto.kind === "append" ? await this.store.cases(testSetId, tx) : [],
        };
        input.viewpoints = applicableViewpoints(
          input.frames,
          input.screenStructure,
        );
        return this.insertJob(
          tx,
          testSetId,
          accountId,
          dto.kind,
          input,
          dto.uploadId,
          undefined,
          dto.clientRequestId,
          hash,
        );
      },
    );
    await this.dispatch(jobId, "screens");
    return { jobId };
  }
  async fillColumn(testSetId: string, columnId: string, accountId: string) {
    await this.expireJobs();
    const jobId = await this.store.mutate(
      testSetId,
      accountId,
      "canEdit",
      async (tx, row) => {
        await this.assertIdle(testSetId, tx);
        await this.admission(tx);
        const columns = await this.store.columns(testSetId, tx);
        const column = columns.find((c) => c.id === columnId.toLowerCase());
        if (!column) throw notFound();
        if (!isAiColumn(column))
          throw new ApiError(
            400,
            "COLUMN_NOT_EDITABLE",
            "AI로 작성할 수 없는 열입니다.",
          );
        const [memo] = await tx
          .select()
          .from(projectMemos)
          .where(eq(projectMemos.projectId, row.projectId));
        const input: GenerationInput = {
          columns,
          fillColumn: column,
          memo: memo?.body ?? "",
          frames: [],
          featureGroups: [],
          viewpoints: [],
          screenStructure: await tx
            .select()
            .from(screenStructureItems)
            .where(eq(screenStructureItems.projectId, row.projectId))
            .orderBy(screenStructureItems.position, screenStructureItems.id),
          styleExamples: [],
          existingCases: await this.store.cases(testSetId, tx),
        };
        return this.insertJob(tx, testSetId, accountId, "fill_column", input);
      },
    );
    await this.dispatch(jobId, "rewrite");
    return { jobId };
  }
  async insertJob(
    tx: DatabaseTransaction,
    testSetId: string,
    accountId: string,
    kind: "initial" | "append" | "rewrite" | "fill_column",
    input: GenerationInput,
    uploadId?: string,
    reviewItemId?: string,
    clientRequestId?: string,
    requestHash?: string,
  ) {
    const id = randomUUID();
    await tx.insert(generationJobs).values({
      id,
      testSetId,
      requestedBy: accountId,
      uploadId,
      kind,
      reviewItemId,
      clientRequestId,
      requestHash,
      currentStage: ["rewrite", "fill_column"].includes(kind)
        ? "rewrite"
        : "screens",
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
    await this.expireJobs();
    const rows = await this.store.database.db
      .select()
      .from(generationJobs)
      .where(inArray(generationJobs.status, ["pending", "running"]));
    for (const row of rows)
      await this.dispatch(
        row.id,
        row.currentStage ??
          (["rewrite", "fill_column"].includes(row.kind)
            ? "rewrite"
            : "screens"),
      );
  }
  async expireJobs() {
    const expired = await this.store.database.db
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(
        and(
          inArray(generationJobs.status, ["pending", "running"]),
          lte(generationJobs.expiresAt, new Date()),
        ),
      );
    for (const job of expired) {
      const lease = await this.store.database.pool.connect();
      let locked = false;
      try {
        locked = (
          await lease.query<{ locked: boolean }>(
            "select pg_try_advisory_lock(5105, hashtext($1)) as locked",
            [job.id],
          )
        ).rows[0].locked;
        if (locked) {
          const [fresh] = await this.store.database.db
            .select({ expiresAt: generationJobs.expiresAt })
            .from(generationJobs)
            .where(eq(generationJobs.id, job.id));
          if (fresh && fresh.expiresAt <= new Date())
            await this.fail(job.id, "GENERATION_EXPIRED");
        }
      } finally {
        try {
          if (locked)
            await lease.query("select pg_advisory_unlock(5105, hashtext($1))", [
              job.id,
            ]);
        } finally {
          lease.release();
        }
      }
    }
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
    let changedSetId: string | undefined;
    await this.store.database.db.transaction(async (tx) => {
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId))
        .for("update");
      if (!job || ["completed", "failed"].includes(job.status)) return;
      await tx
        .update(generationJobs)
        .set({
          status: "failed",
          errorCode: code,
          updatedAt: new Date(),
          ...jobFinished(),
        })
        .where(eq(generationJobs.id, jobId));
      if (job.reviewItemId) {
        await tx
          .update(reviewItems)
          .set({ status: "pending", updatedAt: new Date() })
          .where(
            and(
              eq(reviewItems.id, job.reviewItemId),
              eq(reviewItems.status, "rewriting"),
            ),
          );
        await this.store.bump(job.testSetId, tx);
        changedSetId = job.testSetId;
      }
    });
    await this.usage.markUnknown(jobId);
    if (changedSetId)
      await this.store.events.publish({
        type: "resync",
        testSetId: changedSetId,
      });
    await this.cleanupJob(jobId);
  }
}
