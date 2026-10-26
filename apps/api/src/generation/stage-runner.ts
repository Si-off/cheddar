import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { isCellImage } from "@cheddar/contracts";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { and, eq, sql } from "drizzle-orm";
import { ApiError } from "../common/errors";
import type { CellValue } from "../contracts/test-set.dto";
import {
  featureGroups,
  generationJobs,
  generationSteps,
  reviewItems,
} from "../database/schema";
import { LocalStorage } from "../storage/local-storage";
import { imageMime } from "../temp-uploads/manifest";
import { CaseOperationsService } from "../test-sets/case-operations.service";
import { forbidden } from "../test-sets/test-sets.store";
import { withoutCellImages } from "../test-sets/values";
import { GenerationService, jobFinished } from "./generation.service";
import { guideOf, promptVersion } from "./guides";
import type { Stage } from "./model-config";
import { validateDraft } from "./output-schema";
import { PiInfrastructureError } from "./pi/errors";
import { PiGenerationService } from "./pi/pi.service";
import { AiFailure, type AiRequest } from "./providers/ai-provider";
import { ProviderService } from "./providers/provider.service";
import {
  asScenarioOutput,
  flattenScenarios,
  groupScenarios,
} from "./scenarios";
import { DEFINITIONS } from "./steps";
import {
  emptyCell,
  isAiColumn,
  isEmptyCell,
  isQaRecord,
} from "./steps/column-rules";
import { fillColumn } from "./steps/fill-column";
import type {
  CaseOutput,
  Draft,
  FlowOutput,
  GenerationInput,
  ScenarioOutput,
  ScreenOutput,
} from "./types";
import { AiUsageService } from "./usage.service";
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
    input.columns.filter(isAiColumn).map((c) => {
      const value = isCellImage(draft[c.id]) ? "" : draft[c.id];
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
    @Inject(AiUsageService) private readonly usage: AiUsageService,
    @Inject(GenerationService) readonly generation: GenerationService,
    @Inject(ProviderService) private readonly providers: ProviderService,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
    @Inject(CaseOperationsService)
    private readonly operations: CaseOperationsService,
    @Inject(PiGenerationService) private readonly pi: PiGenerationService,
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
    context = withoutCellImages(context);
    sourceData = withoutCellImages(sourceData);
    const definition =
      stage === "rewrite" && context.fillColumn
        ? fillColumn
        : DEFINITIONS[stage];
    this.shutdown.signal.throwIfAborted();
    const { model, provider } = this.providers.forStage(stage);
    await this.db
      .insert(generationSteps)
      .values({
        jobId,
        stage,
        workKey,
        input: sourceData,
        promptVersion: promptVersion(definition, guideOf(context)),
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
          {
            generate: (request) =>
              this.usage.generate(
                { jobId, stepId: saved.id, fake: this.providers.config.fake },
                provider,
                request,
              ),
          },
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
          undefined,
          async () => {
            repairUsed = true;
            await this.db
              .update(generationSteps)
              .set({ repairCount: sql`${generationSteps.repairCount} + 1` })
              .where(where);
          },
          !repairUsed,
        );
        const result = flattenScenarios(
          context.columns,
          response.value as ScenarioOutput,
        );
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
        throw new Error("frameId에는 입력 프레임의 ID를 그대로 쓰세요.");
    } else if (stage === "flows") {
      const groups = (value as FlowOutput).groups;
      // 다시 쓰기 요청에 그대로 들어가므로 어느 값을 고칠지 알 수 있게 쓴다.
      if (
        groups.some((g) =>
          g.screenIds.some((id) => !input.frames.some((f) => f.id === id)),
        )
      )
        throw new Error(
          "screenIds에는 화면에 적힌 화면 ID가 아니라 입력 화면 카드의 frameId만 쓰세요.",
        );
      if (
        new Set(groups.map((g) => g.key)).size !== groups.length ||
        groups.some(
          (g) =>
            !g.key ||
            (input.featureGroups.length &&
              !input.featureGroups.some((f) => f.id === g.key)),
        )
      )
        throw new Error(
          input.featureGroups.length
            ? "그룹 key에는 프로젝트 기능 그룹 ID를 겹치지 않게 쓰세요."
            : "그룹 key를 비우지 말고 겹치지 않게 쓰세요.",
        );
    } else if (stage === "rewrite") {
      if (input.fillColumn) {
        for (const cell of Object.values(value as Record<string, CellValue>))
          validateDraft([input.fillColumn], { [input.fillColumn.id]: cell });
      } else validateDraft(input.columns, value);
    } else {
      const tree = value as ScenarioOutput;
      if (
        stage === "finish" &&
        (!Array.isArray(tree.scenarios) ||
          [...tree.scenarios, ...tree.reviews].some(
            (item) => !Object.hasOwn(item, "groupKey"),
          ))
      )
        throw new Error(
          "시나리오와 확인 필요 항목의 기능 그룹 키를 확인하세요.",
        );
      const output = flattenScenarios(input.columns, tree);
      for (const draft of [
        ...output.cases,
        ...output.reviews.map((r) => r.draft),
      ]) {
        validateDraft(input.columns, draft);
        const title = input.columns.find((c) => c.systemKey === "title");
        if (title && !(draft[title.id] as string)?.trim())
          throw new Error("케이스 제목을 작성하세요.");
      }
      const ids = output.coverage.map((c) => c.viewpointId);
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => !input.viewpoints.some((r) => r.id === id)) ||
        (stage === "finish" && ids.length !== input.viewpoints.length)
      )
        throw new Error("점검 관점 ID별 반영 여부를 확인하세요.");
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
      if (job.currentStage !== stage) {
        // pi는 한 큐 작업 안에서 cases로 진행하므로 최초 screens 작업의 재시도를 허용한다.
        const [piStep] = await this.db
          .select({ id: generationSteps.id })
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.workKey, "pi-agent"),
            ),
          );
        if (!(piStep && stage === "screens" && job.currentStage === "cases"))
          return;
      }
      if (job.status === "running" && job.expiresAt <= new Date()) {
        await this.generation.fail(jobId, "GENERATION_EXPIRED");
        return;
      }
      await this.usage.markUnknown(jobId);
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
        .set({
          status: "running",
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + 600_000),
        })
        .where(eq(generationJobs.id, jobId));
      if (
        input.pi?.engine === "pi" &&
        ["initial", "append"].includes(job.kind)
      ) {
        const output = await this.pi.run(jobId, input, this.shutdown.signal);
        try {
          await this.finish(job, input, output);
        } catch (error) {
          if (error instanceof ApiError || error instanceof AiFailure)
            throw error;
          throw new PiInfrastructureError(error);
        }
        await this.generation.cleanupJob(jobId);
        return;
      }
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
            styleExamples: groupScenarios(
              input.columns,
              input.styleExamples.map((c) => c.values),
            ),
          }),
        );
        next = "finish";
      } else if (stage === "finish") {
        const grouped = await this.db
          .select()
          .from(generationSteps)
          .where(
            and(
              eq(generationSteps.jobId, jobId),
              eq(generationSteps.stage, "cases"),
              eq(generationSteps.status, "completed"),
            ),
          )
          .orderBy(generationSteps.workKey);
        const output = (await this.step(jobId, stage, "all", input, {
          outputs: grouped.map((s) => ({
            ...asScenarioOutput(
              input.columns,
              s.output as ScenarioOutput | CaseOutput,
            ),
            groupKey: s.workKey,
          })),
          screens: await outputs<ScreenOutput>("screens"),
          flows: await outputs<FlowOutput>("flows"),
          memo: input.memo,
          existingCases: input.existingCases,
        })) as ScenarioOutput;
        await this.finish(job, input, flattenScenarios(input.columns, output));
      } else if (job.kind === "fill_column") {
        const output = (await this.step(jobId, stage, "all", input, {
          cases: input.existingCases,
          targetColumn: input.fillColumn,
          memo: input.memo,
          screenStructure: input.screenStructure,
        })) as Record<string, CellValue>;
        await this.finishFill(job, input, output);
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
              ...jobFinished(),
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
          .set({
            currentStage: next,
            status: "pending",
            updatedAt: new Date(),
            expiresAt: new Date(Date.now() + 600_000),
          })
          .where(eq(generationJobs.id, jobId));
        await this.generation.dispatch(jobId, next);
      } else await this.generation.cleanupJob(jobId);
    } catch (error) {
      if (this.shutdown.signal.aborted) return;
      if (error instanceof PiInfrastructureError) throw error;
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
  async finishFill(
    job: typeof generationJobs.$inferSelect,
    input: GenerationInput,
    output: Record<string, CellValue>,
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
      if (!fresh || ["completed", "failed"].includes(fresh.status)) return;
      const column = (
        await this.generation.store.columns(job.testSetId, tx)
      ).find((c) => c.id === input.fillColumn?.id);
      if (!column) throw new Error("대상 열이 삭제되었습니다.");
      const originals = new Map(input.existingCases.map((c) => [c.id, c]));
      const current = await this.generation.store.cases(job.testSetId, tx);
      const ops = current.flatMap((c) => {
        const original = originals.get(c.id);
        const value = output[c.id];
        // 요청 시점과 저장 시점 모두 비어 있는 셀만 채운다. false는 사용자가 정한 값이다.
        if (
          !original ||
          !isEmptyCell(original.values[column.id]) ||
          !isEmptyCell(c.values[column.id]) ||
          isEmptyCell(value)
        )
          return [];
        return [
          {
            type: "set_cell" as const,
            caseId: c.id,
            columnId: column.id,
            value,
          },
        ];
      });
      for (let offset = 0; offset < ops.length; offset += 500)
        await this.operations.applyInTransaction(
          tx,
          job.testSetId,
          job.requestedBy,
          { ops: ops.slice(offset, offset + 500) },
        );
      await tx
        .update(generationJobs)
        .set({
          status: "completed",
          ...jobFinished(),
          currentStage: null,
          updatedAt: new Date(),
        })
        .where(eq(generationJobs.id, job.id));
    });
    await this.generation.store.events.publish({
      type: "resync",
      testSetId: job.testSetId,
    });
  }
  async finish(
    job: typeof generationJobs.$inferSelect,
    input: GenerationInput,
    output: CaseOutput,
  ) {
    await this.db.transaction(async (tx) => {
      await this.generation.assertActor(job.testSetId, job.requestedBy, tx);
      const { access, row } = await this.generation.store.visible(
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
      // 스냅샷 이후 삭제된 그룹과 제안용 키는 연결하지 않는다.
      const groups = await tx
        .select({ id: featureGroups.id })
        .from(featureGroups)
        .where(eq(featureGroups.projectId, row.projectId))
        .for("key share");
      const groupIds = new Set(groups.map((g) => g.id));
      const groupId = (key: string | null | undefined) =>
        key && groupIds.has(key) ? key : null;
      const existing = await this.generation.store.cases(job.testSetId, tx);
      const seen = new Set(existing.map((c) => fingerprint(input, c.values)));
      let merged = 0;
      const cases = output.cases.flatMap((draft, index) => {
        const key = fingerprint(input, draft);
        if (seen.has(key)) {
          merged++;
          return [];
        }
        seen.add(key);
        return [
          { draft, featureGroupId: groupId(output.caseGroupKeys?.[index]) },
        ];
      });
      let afterCaseId = existing.at(-1)?.id ?? null;
      const ops = cases.map(({ draft, featureGroupId }) => {
        const values = {
          ...draft,
          ...Object.fromEntries(
            input.columns.filter(isQaRecord).map((c) => [c.id, emptyCell(c)]),
          ),
        };
        const caseId = randomUUID();
        const op = {
          type: "add_case" as const,
          caseId,
          afterCaseId,
          values,
          featureGroupId,
        };
        afterCaseId = caseId;
        return op;
      });
      // 시나리오로 받은 행은 전체 개수 상한이 없어 연산 한도로 나눠 저장한다.
      for (let offset = 0; offset < ops.length; offset += 500)
        await this.operations.applyInTransaction(
          tx,
          job.testSetId,
          job.requestedBy,
          { ops: ops.slice(offset, offset + 500) },
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
            featureGroupId: groupId(output.reviewGroupKeys?.[position]),
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
          ...jobFinished(),
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
