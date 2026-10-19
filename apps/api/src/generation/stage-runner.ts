import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import {
  generationJobs,
  generationSteps,
  reviewItems,
} from "../database/schema";
import { LocalStorage } from "../storage/local-storage";
import { imageMime } from "../temp-uploads/manifest";
import { CaseOperationsService } from "../test-sets/case-operations.service";
import { forbidden } from "../test-sets/test-sets.store";
import { GenerationService } from "./generation.service";
import type { Stage } from "./model-config";
import { validateDraft } from "./output-schema";
import { costFor } from "./pricing";
import { AiFailure, type AiRequest, type Usage } from "./providers/ai-provider";
import { ProviderService } from "./providers/provider.service";
import { DEFINITIONS } from "./steps";
import type {
  CaseOutput,
  Draft,
  FlowOutput,
  GenerationInput,
  ScreenOutput,
} from "./types";
import { validatedOutput } from "./validated-output";

export async function boundedMap<T, R>(
  items: T[],
  work: (item: T) => Promise<R>,
  concurrency = 3,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0,
    failed = false;
  const workers = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (!failed) {
        const index = cursor++;
        if (index >= items.length) return;
        try {
          results[index] = await work(items[index]);
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }),
  );
  const error = workers.find((r) => r.status === "rejected");
  if (error?.status === "rejected") throw error.reason;
  return results;
}
export function fingerprint(input: GenerationInput, draft: Draft) {
  return JSON.stringify(
    input.columns
      .filter((c) => c.systemKey !== "test_id")
      .map((c) => {
        const value = draft[c.id];
        return Array.isArray(value) ? [...value].sort() : (value ?? null);
      }),
  );
}
@Injectable()
export class StageRunner implements OnModuleDestroy {
  private readonly shutdown = new AbortController();
  onModuleDestroy() {
    this.shutdown.abort();
  }
  constructor(
    @Inject(GenerationService) readonly generation: GenerationService,
    @Inject(ProviderService) private readonly providers: ProviderService,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
    @Inject(CaseOperationsService)
    private readonly operations: CaseOperationsService,
  ) {}
  get db() {
    return this.generation.store.database.db;
  }
  async step(
    jobId: string,
    stage: Stage,
    workKey: string,
    context: GenerationInput,
    sourceData: unknown,
  ) {
    const definition = DEFINITIONS[stage];
    this.shutdown.signal.throwIfAborted();
    const { model, provider } = this.providers.forStage(stage);
    await this.db
      .insert(generationSteps)
      .values({
        jobId,
        stage,
        workKey,
        input: sourceData,
        promptVersion: definition.version,
        model: this.providers.config.fake
          ? "fake"
          : `${model.provider}:${model.model}`,
      })
      .onConflictDoNothing();
    const where = and(
      eq(generationSteps.jobId, jobId),
      eq(generationSteps.stage, stage),
      eq(generationSteps.workKey, workKey),
    );
    const [saved] = await this.db.select().from(generationSteps).where(where);
    if (saved.status === "completed") return saved.output;
    if (saved.status === "failed" || saved.attempts >= definition.retries + 1)
      throw new AiFailure(saved.failureCode ?? "AI_RETRIES_EXHAUSTED", false);
    const started = Date.now();
    let repairUsed = saved.repairCount > 0;
    const images: AiRequest["images"] = [];
    if (stage === "screens")
      for (const frame of context.frames)
        for (const key of frame.imageStorageKeys) {
          const handle = await this.storage.open(key);
          try {
            const bytes = await handle.readFile();
            const mediaType = imageMime(bytes);
            if (!mediaType) throw new AiFailure("INVALID_IMAGE", false);
            images.push({ mediaType, data: bytes.toString("base64") });
          } finally {
            await handle.close();
          }
        }
    const recordUsage = async (usage: Usage) => {
      const cost = costFor(
        `${model.provider}:${model.model}`,
        usage,
        this.providers.config.fake,
      );
      await this.db
        .update(generationSteps)
        .set({
          inputTokens: sql`coalesce(${generationSteps.inputTokens},0) + ${usage.inputTokens}`,
          outputTokens: sql`coalesce(${generationSteps.outputTokens},0) + ${usage.outputTokens}`,
          cacheReadTokens: sql`coalesce(${generationSteps.cacheReadTokens},0) + ${usage.cacheReadTokens}`,
          cacheCreationTokens: sql`coalesce(${generationSteps.cacheCreationTokens},0) + ${usage.cacheCreationTokens}`,
          cost:
            cost === null
              ? null
              : sql`coalesce(${generationSteps.cost},0) + ${cost}::numeric`,
        })
        .where(where);
    };
    for (
      let attempt = saved.attempts;
      attempt <= definition.retries;
      attempt++
    ) {
      await this.db
        .update(generationSteps)
        .set({
          status: "running",
          attempts: attempt + 1,
          startedAt: new Date(),
        })
        .where(where);
      try {
        const response = await validatedOutput(
          provider,
          {
            definition,
            model,
            schema: definition.schema(context),
            context,
            sourceData,
            images,
            signal: this.shutdown.signal,
          },
          (value) => this.validate(stage, context, value),
          recordUsage,
          async () => {
            repairUsed = true;
            await this.db
              .update(generationSteps)
              .set({ repairCount: sql`${generationSteps.repairCount} + 1` })
              .where(where);
          },
          !repairUsed,
        );
        const result = response.value as CaseOutput;
        await this.db
          .update(generationSteps)
          .set({
            status: "completed",
            output: response.value,
            failureCode: null,
            durationMs: Date.now() - started,
            completedAt: new Date(),
            ...(stage === "cases" || stage === "finish"
              ? {
                  requiredCoverage: result.coverage,
                  mergedCount: result.mergedCount,
                  reviewRatio: (
                    result.reviews.length /
                    Math.max(1, result.cases.length + result.reviews.length)
                  ).toFixed(5),
                }
              : {}),
          })
          .where(where);
        return response.value;
      } catch (error) {
        if (this.shutdown.signal.aborted) throw error;
        const failure =
          error instanceof AiFailure
            ? error
            : new AiFailure("AI_STEP_FAILED", false);
        if (error instanceof AiFailure) await recordUsage(error.usage);
        const retry = failure.retryable && attempt < definition.retries;
        await this.db
          .update(generationSteps)
          .set({
            status: retry ? "pending" : "failed",
            failureCode: failure.code,
            durationMs: Date.now() - started,
          })
          .where(where);
        if (!retry) throw failure;
        await delay(1000 * 2 ** attempt, undefined, {
          signal: this.shutdown.signal,
        });
      }
    }
    throw new AiFailure("AI_RETRIES_EXHAUSTED", false);
  }
  validate(stage: Stage, input: GenerationInput, value: unknown) {
    if (stage === "screens") {
      const screens = (value as ScreenOutput).screens;
      if (
        screens.length !== input.frames.length ||
        new Set(screens.map((s) => s.frameId)).size !== screens.length ||
        screens.some((s) => !input.frames.some((f) => f.id === s.frameId))
      )
        throw new Error("입력 화면 ID를 그대로 사용하세요.");
    } else if (stage === "flows") {
      const groups = (value as FlowOutput).groups;
      if (
        new Set(groups.map((g) => g.key)).size !== groups.length ||
        groups.some(
          (g) =>
            !g.key ||
            g.screenIds.some((id) => !input.frames.some((f) => f.id === id)) ||
            (input.featureGroups.length &&
              !input.featureGroups.some((f) => f.id === g.key)),
        )
      )
        throw new Error("기능 그룹과 화면 ID를 확인하세요.");
    } else if (stage === "rewrite") validateDraft(input.columns, value);
    else {
      const output = value as CaseOutput;
      for (const draft of [
        ...output.cases,
        ...output.reviews.map((r) => r.draft),
      ]) {
        validateDraft(input.columns, draft);
        const title = input.columns.find((c) => c.systemKey === "title");
        if (title && !(draft[title.id] as string)?.trim())
          throw new Error("케이스 제목을 작성하세요.");
      }
      const ids = output.coverage.map((c) => c.requiredCaseId);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !input.requiredCases.some((r) => r.id === id)) ||
        (stage === "finish" && ids.length !== input.requiredCases.length)
      )
        throw new Error("필수 케이스별 반영 여부를 확인하세요.");
    }
  }
  async process(jobId: string, stage: Stage) {
    if (this.shutdown.signal.aborted) return;
    const lease = await this.generation.store.database.pool.connect();
    let locked = false;
    try {
      locked = (
        await lease.query<{ locked: boolean }>(
          "select pg_try_advisory_lock(5105, hashtext($1)) as locked",
          [jobId],
        )
      ).rows[0].locked;
      if (!locked) return;
      const [job] = await this.db
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, jobId));
      if (!job) return;
      if (["completed", "failed"].includes(job.status)) {
        await this.generation.cleanupJob(jobId);
        return;
      }
      if (job.currentStage !== stage) return;
      await this.generation.assertActor(job.testSetId, job.requestedBy);
      const [snapshot] = await this.db
        .select()
        .from(generationSteps)
        .where(
          and(
            eq(generationSteps.jobId, jobId),
            eq(generationSteps.stage, "context"),
          ),
        );
      const input = snapshot?.input as GenerationInput | null;
      if (!input) throw new AiFailure("GENERATION_INPUT_MISSING", false);
      await this.db
        .update(generationJobs)
        .set({ status: "running", updatedAt: new Date() })
        .where(eq(generationJobs.id, jobId));
      const outputs = async <T>(key: Stage): Promise<T[]> =>
        (
          await this.db
            .select()
            .from(generationSteps)
            .where(
              and(
                eq(generationSteps.jobId, jobId),
                eq(generationSteps.stage, key),
                eq(generationSteps.status, "completed"),
              ),
            )
            .orderBy(generationSteps.workKey)
        ).map((s) => s.output as T);
      let next: Stage | null = null;
      if (stage === "screens") {
        const frames = input.frames.length ? input.frames : [null];
        await boundedMap(frames, (frame) => {
          const context = { ...input, frames: frame ? [frame] : [] };
          return this.step(jobId, stage, frame?.id ?? "memo", context, {
            frames: context.frames,
            memo: input.memo,
          });
        });
        next = "flows";
      } else if (stage === "flows") {
        const screens: ScreenOutput = {
          screens: (await outputs<ScreenOutput>("screens")).flatMap(
            (o) => o.screens,
          ),
        };
        await this.step(jobId, stage, "all", input, {
          screens,
          memo: input.memo,
          screenStructure: input.screenStructure,
        });
        next = "cases";
      } else if (stage === "cases") {
        const [flows] = await outputs<FlowOutput>("flows");
        const screens = await outputs<ScreenOutput>("screens");
        await boundedMap(flows.groups, (group) =>
          this.step(jobId, stage, group.key, input, {
            group,
            screens,
            memo: input.memo,
            existingCases: input.existingCases,
            styleExamples: input.styleExamples,
          }),
        );
        next = "finish";
      } else if (stage === "finish") {
        const output = (await this.step(jobId, stage, "all", input, {
          outputs: await outputs<CaseOutput>("cases"),
          screens: await outputs<ScreenOutput>("screens"),
          flows: await outputs<FlowOutput>("flows"),
          memo: input.memo,
          existingCases: input.existingCases,
        })) as CaseOutput;
        await this.finish(job, input, output);
      } else {
        const draft = (await this.step(jobId, stage, "all", input, {
          review: input.review,
          similarCases: input.existingCases,
        })) as Draft;
        await this.db.transaction(async (tx) => {
          await this.generation.assertActor(job.testSetId, job.requestedBy, tx);
          const { access } = await this.generation.store.visible(
            job.testSetId,
            job.requestedBy,
            tx,
            true,
          );
          if (!access.canEdit) throw forbidden();
          const [fresh] = await tx
            .select()
            .from(generationJobs)
            .where(eq(generationJobs.id, jobId))
            .for("update");
          if (!fresh || fresh.status === "completed") return;
          // 생성 동안 양식이 바뀌었으면 현재 양식으로 다시 검증한다.
          validateDraft(
            await this.generation.store.columns(job.testSetId, tx),
            draft,
          );
          await tx
            .update(reviewItems)
            .set({ draft, status: "pending", updatedAt: new Date() })
            .where(
              eq(
                reviewItems.id,
                job.reviewItemId ?? "00000000-0000-0000-0000-000000000000",
              ),
            );
          await this.generation.store.bump(job.testSetId, tx);
          await tx
            .update(generationJobs)
            .set({
              status: "completed",
              currentStage: null,
              updatedAt: new Date(),
            })
            .where(eq(generationJobs.id, jobId));
          await tx
            .update(generationSteps)
            .set({ input: null, output: null })
            .where(eq(generationSteps.jobId, jobId));
        });
        await this.generation.store.events.publish({
          type: "resync",
          testSetId: job.testSetId,
        });
      }
      if (next) {
        await this.db
          .update(generationJobs)
          .set({ currentStage: next, updatedAt: new Date() })
          .where(eq(generationJobs.id, jobId));
        await this.generation.dispatch(jobId, next);
      } else await this.generation.cleanupJob(jobId);
    } catch (error) {
      if (this.shutdown.signal.aborted) return;
      await this.generation.fail(
        jobId,
        error instanceof AiFailure ? error.code : "GENERATION_FAILED",
      );
    } finally {
      try {
        if (locked)
          await lease.query("select pg_advisory_unlock(5105, hashtext($1))", [
            jobId,
          ]);
      } finally {
        lease.release();
      }
    }
  }
  async finish(
    job: typeof generationJobs.$inferSelect,
    input: GenerationInput,
    output: CaseOutput,
  ) {
    await this.db.transaction(async (tx) => {
      await this.generation.assertActor(job.testSetId, job.requestedBy, tx);
      const { access } = await this.generation.store.visible(
        job.testSetId,
        job.requestedBy,
        tx,
        true,
      );
      if (!access.canEdit) throw forbidden();
      const [fresh] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, job.id))
        .for("update");
      if (!fresh || fresh.status === "completed") return;
      const existing = await this.generation.store.cases(job.testSetId, tx);
      const seen = new Set(existing.map((c) => fingerprint(input, c.values)));
      let merged = 0;
      const cases = output.cases.filter((draft) => {
        const key = fingerprint(input, draft);
        if (seen.has(key)) {
          merged++;
          return false;
        }
        seen.add(key);
        return true;
      });
      let afterCaseId = existing.at(-1)?.id ?? null;
      const ops = cases.map((values) => {
        const caseId = randomUUID();
        const op = { type: "add_case" as const, caseId, afterCaseId, values };
        afterCaseId = caseId;
        return op;
      });
      if (ops.length)
        await this.operations.applyInTransaction(
          tx,
          job.testSetId,
          job.requestedBy,
          { ops },
        );
      const columns = await this.generation.store.columns(job.testSetId, tx);
      for (const review of output.reviews) validateDraft(columns, review.draft);
      if (output.reviews.length)
        await tx.insert(reviewItems).values(
          output.reviews.map((r, position) => ({
            testSetId: job.testSetId,
            reason: r.reason,
            screenDescription: r.screenDescription,
            questions: r.question
              ? [{ question: r.question, answer: null }]
              : [],
            draft: r.draft,
            createdAt: new Date(Date.now() + position),
          })),
        );
      if (!ops.length && output.reviews.length)
        await this.generation.store.bump(job.testSetId, tx);
      await tx
        .update(generationSteps)
        .set({ mergedCount: sql`${generationSteps.mergedCount} + ${merged}` })
        .where(
          and(
            eq(generationSteps.jobId, job.id),
            eq(generationSteps.stage, "finish"),
          ),
        );
      await tx
        .update(generationJobs)
        .set({
          status: "completed",
          currentStage: null,
          addedCount: cases.length,
          reviewCount: output.reviews.length,
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, job.id));
      await tx
        .update(generationSteps)
        .set({ input: null, output: null })
        .where(eq(generationSteps.jobId, job.id));
    });
    await this.generation.store.events.publish({
      type: "resync",
      testSetId: job.testSetId,
    });
  }
}
