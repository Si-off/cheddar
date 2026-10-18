import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import {
  assertTestScenarioEditable,
  expireGeneration,
} from "../common/generation-lock";
import type {
  AddGeneratedCasesDto,
  GenerationDto,
  ReviewGenerationResultDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  generationJobs,
  iaItems,
  projectAnalysis,
  projects,
  testScenarios as testScenariosTable,
  uploadFrames,
  uploads,
} from "../database/schema";
import {
  revisionConflict,
  TestScenariosRepository,
} from "../test-scenarios/test-scenarios.repository";
import { appendAnalysisLinks } from "../uploads/analysis.service";
import { type GenerationResult, validateContent } from "./result";
export type Job = typeof generationJobs.$inferSelect;
export function present(job: Job): GenerationDto {
  return {
    id: job.id,
    mode: job.request.mode ?? "replace",
    testScenarioId: job.testScenarioId,
    provider: job.provider,
    model: job.model,
    status: job.status,
    error: job.error,
    revision: job.revision,
    caseCount: job.caseCount,
    results: job.results,
    createdAt: job.createdAt.toISOString(),
  };
}
@Injectable()
export class GenerationRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(TestScenariosRepository)
    private readonly testScenarios: TestScenariosRepository,
  ) {}
  private async write<T>(
    projectId: string,
    run: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw notFound();
      return run(tx);
    });
  }
  async start(
    projectId: string,
    testScenarioId: string,
    request: StartGenerationDto,
    model: string,
    concurrency = 2,
  ) {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          testScenarioId,
          mode: request.mode ?? "replace",
          frameIds: request.frameIds ? [...request.frameIds].sort() : null,
          requirementIds: request.requirementIds
            ? [...request.requirementIds].sort()
            : null,
          provider: request.provider,
          expectedRevision: request.expectedRevision,
          uploadId:
            request.uploadId === undefined
              ? "test-scenario-default"
              : request.uploadId,
          description: request.description ?? "",
          exampleTestScenarioId: request.exampleTestScenarioId ?? null,
        }),
      )
      .digest("hex");
    return this.write(projectId, async (tx) => {
      await expireGeneration(tx, testScenarioId);
      const [existing] = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.projectId, projectId),
            eq(generationJobs.clientRequestId, request.clientRequestId),
          ),
        );
      if (existing) {
        if (existing.requestHash !== requestHash)
          throw new ApiError(
            409,
            "REQUEST_REUSED",
            "이 생성 요청은 이미 사용되었습니다. 생성 상태를 확인해주세요.",
          );
        return { job: existing, created: false };
      }
      await assertTestScenarioEditable(tx, testScenarioId);
      const snapshot = await this.testScenarios.readSnapshot(
        tx,
        projectId,
        testScenarioId,
      );
      if (snapshot.contentRevision !== request.expectedRevision)
        throw revisionConflict("content", snapshot.contentRevision);
      const uploadId =
        request.uploadId === undefined ? snapshot.uploadId : request.uploadId;
      if (uploadId) {
        const [upload] = await tx
          .select()
          .from(uploads)
          .where(
            and(eq(uploads.projectId, projectId), eq(uploads.id, uploadId)),
          );
        if (!upload) throw notFound();
      }
      if (request.frameIds) {
        const selected = await tx
          .select({ id: uploadFrames.id })
          .from(uploadFrames)
          .where(
            eq(
              uploadFrames.uploadId,
              uploadId ?? "00000000-0000-4000-8000-000000000000",
            ),
          );
        if (request.frameIds.some((id) => !selected.some((f) => f.id === id)))
          throw invalid([{ field: "frameIds", code: "uploadMismatch" }]);
      }
      if (request.requirementIds) {
        const [analysis] = await tx
          .select()
          .from(projectAnalysis)
          .where(eq(projectAnalysis.projectId, projectId));
        if (
          request.requirementIds.some(
            (id) =>
              !analysis?.items.some(
                (i) =>
                  i.id === id &&
                  (i.kind === "requirement" || i.kind === "question"),
              ),
          )
        )
          throw invalid([{ field: "requirementIds", code: "projectMismatch" }]);
      }
      if (
        !uploadId &&
        !request.description?.trim() &&
        !request.requirementIds?.length
      )
        throw new ApiError(
          400,
          "GENERATION_INPUT_REQUIRED",
          "Figma 자료를 선택하거나 테스트 내용을 설명해주세요.",
        );
      if (request.exampleTestScenarioId)
        await this.testScenarios.readSnapshot(
          tx,
          projectId,
          request.exampleTestScenarioId,
        );
      // Short database-wide admission lock: multiple API processes share the
      // same capacity, and no input files are loaded before admission.
      await tx.execute(sql`select pg_advisory_xact_lock(31015433)`);
      const [active] = await tx
        .select({ count: count() })
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.status, "running"),
            gt(generationJobs.expiresAt, new Date()),
          ),
        );
      if (active.count >= concurrency)
        throw new ApiError(
          429,
          "GENERATION_CAPACITY",
          "현재 생성 요청이 많습니다. 잠시 후 다시 시도해주세요.",
        );
      const [job] = await tx
        .insert(generationJobs)
        .values({
          projectId,
          testScenarioId,
          requestHash,
          clientRequestId: request.clientRequestId,
          provider: request.provider,
          model,
          request: { ...request, uploadId: uploadId ?? undefined },
          snapshot,
          expiresAt: new Date(Date.now() + 600_000),
        })
        .returning();
      return { job, created: true };
    });
  }
  async list(projectId: string, testScenarioId: string) {
    return this.write(projectId, async (tx) => {
      await this.testScenarios.readSnapshot(tx, projectId, testScenarioId);
      await expireGeneration(tx, testScenarioId);
      return {
        items: (
          await tx
            .select()
            .from(generationJobs)
            .where(
              and(
                eq(generationJobs.projectId, projectId),
                eq(generationJobs.testScenarioId, testScenarioId),
              ),
            )
            .orderBy(desc(generationJobs.createdAt), desc(generationJobs.id))
        ).map(present),
      };
    });
  }
  async context(job: Job) {
    let frames = job.request.uploadId
      ? await this.database.db
          .select()
          .from(uploadFrames)
          .where(
            and(
              eq(uploadFrames.projectId, job.projectId),
              eq(uploadFrames.uploadId, job.request.uploadId),
            ),
          )
          .orderBy(asc(uploadFrames.position))
      : [];
    const ia = await this.database.db
      .select({
        id: iaItems.id,
        screenId: iaItems.screenId,
        name: iaItems.name,
        description: iaItems.description,
        parentId: iaItems.parentId,
      })
      .from(iaItems)
      .where(eq(iaItems.projectId, job.projectId));
    const [analysis] = await this.database.db
      .select()
      .from(projectAnalysis)
      .where(eq(projectAnalysis.projectId, job.projectId));
    if (job.request.requirementIds?.length && !job.request.frameIds) {
      const sourceFrames = [
        ...new Set(
          (analysis?.items ?? [])
            .filter(
              (i) => job.request.requirementIds?.includes(i.id) && i.frameId,
            )
            .map((i) => i.frameId as string),
        ),
      ];
      if (sourceFrames.length)
        frames = await this.database.db
          .select()
          .from(uploadFrames)
          .where(
            and(
              eq(uploadFrames.projectId, job.projectId),
              inArray(uploadFrames.id, sourceFrames),
            ),
          )
          .orderBy(asc(uploadFrames.position));
    }
    const example = job.request.exampleTestScenarioId
      ? await this.testScenarios.get(
          job.projectId,
          job.request.exampleTestScenarioId,
        )
      : job.snapshot;
    return {
      frames: job.request.frameIds
        ? frames.filter((f) => job.request.frameIds?.includes(f.id))
        : frames,
      ia,
      example,
      analysis,
    };
  }
  async succeed(job: Job, result: GenerationResult, started: number) {
    await this.write(job.projectId, async (tx) => {
      const [current] = await tx
        .select()
        .from(generationJobs)
        .where(eq(generationJobs.id, job.id));
      if (
        current?.status !== "running" ||
        current.expiresAt.getTime() <= Date.now()
      )
        throw new ApiError(
          409,
          "GENERATION_EXPIRED",
          "생성 시간이 초과되어 결과를 반영하지 않았습니다. 다시 생성해주세요.",
        );
      let results = result.candidates;
      if (result.sources) {
        const [doc] = await tx
          .select()
          .from(projectAnalysis)
          .where(eq(projectAnalysis.projectId, job.projectId));
        if ((doc?.revision ?? 0) !== result.sourceRevision)
          throw new ApiError(
            409,
            "ANALYSIS_CONFLICT",
            "생성 중 분석 결과가 변경되었습니다. 최신 자료로 다시 생성해주세요.",
          );
        await tx
          .insert(projectAnalysis)
          .values({
            projectId: job.projectId,
            revision: (doc?.revision ?? 0) + 1,
            items: result.sources,
            links: doc?.links ?? [],
          })
          .onConflictDoUpdate({
            target: projectAnalysis.projectId,
            set: { revision: (doc?.revision ?? 0) + 1, items: result.sources },
          });
      }
      if (job.request.mode === "review") {
        results = [
          ...result.cases.map((content) => ({
            id: content.id,
            status: "pending" as const,
            kind: "case" as const,
            reason: "",
            content,
            requirementIds:
              result.links?.find((l) => l.caseId === content.id)
                ?.requirementIds ?? [],
          })),
          ...result.candidates.map((c) => ({
            ...c,
            kind: "candidate" as const,
          })),
        ];
      } else if (job.request.mode === "append") {
        const snapshot = await this.testScenarios.readSnapshot(
          tx,
          job.projectId,
          job.testScenarioId,
        );
        const cases = [...snapshot.cases, ...result.cases];
        validateContent(snapshot, cases);
        await this.testScenarios.writeContent(
          tx,
          job.projectId,
          job.testScenarioId,
          {
            expectedRevision: job.snapshot.contentRevision,
            columns: snapshot.columns,
            cases,
          },
        );
        await appendAnalysisLinks(
          tx,
          job.projectId,
          (result.links ?? [])
            .filter((link) => result.cases.some((c) => c.id === link.caseId))
            .flatMap((link) =>
              link.requirementIds.map((requirementId) => ({
                requirementId,
                caseId: link.caseId,
                testScenarioId: job.testScenarioId,
              })),
            ),
        );
        results = [
          ...result.cases.map((content) => ({
            id: content.id,
            status: "added" as const,
            kind: "case" as const,
            reason: "",
            content,
            requirementIds:
              result.links?.find((link) => link.caseId === content.id)
                ?.requirementIds ?? [],
          })),
          ...result.candidates.map((c) => ({
            ...c,
            kind: "candidate" as const,
          })),
        ];
      } else {
        await this.testScenarios.writeContent(
          tx,
          job.projectId,
          job.testScenarioId,
          {
            expectedRevision: job.snapshot.contentRevision,
            columns: job.snapshot.columns,
            cases: result.cases,
          },
        );
        await tx
          .update(testScenariosTable)
          .set({ uploadId: job.request.uploadId ?? null })
          .where(eq(testScenariosTable.id, job.testScenarioId));
        await appendAnalysisLinks(
          tx,
          job.projectId,
          (result.links ?? [])
            .filter((l) => result.cases.some((c) => c.id === l.caseId))
            .flatMap((l) =>
              l.requirementIds.map((requirementId) => ({
                requirementId,
                caseId: l.caseId,
                testScenarioId: job.testScenarioId,
              })),
            ),
          job.testScenarioId,
        );
      }
      await tx
        .update(generationJobs)
        .set({
          status: "succeeded",
          results,
          caseCount: result.cases.length,
          revision: current.revision + 1,
          finishedAt: new Date(),
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        })
        .where(eq(generationJobs.id, job.id));
    });
  }
  async fail(job: Job, message: string, started: number) {
    await this.write(job.projectId, async (tx) => {
      await tx
        .update(generationJobs)
        .set({
          status: "failed",
          error: message,
          finishedAt: new Date(),
          durationMs: Math.max(0, Math.round(performance.now() - started)),
        })
        .where(
          and(
            eq(generationJobs.id, job.id),
            eq(generationJobs.status, "running"),
          ),
        );
    });
  }
  async add(
    projectId: string,
    testScenarioId: string,
    jobId: string,
    input: AddGeneratedCasesDto,
  ) {
    return this.write(projectId, async (tx) => {
      await assertTestScenarioEditable(tx, testScenarioId);
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.id, jobId),
            eq(generationJobs.projectId, projectId),
            eq(generationJobs.testScenarioId, testScenarioId),
          ),
        );
      if (job?.status !== "succeeded") throw notFound();
      if (job.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "GENERATION_RESULT_CONFLICT",
          "결과가 변경되었습니다. 최신 결과를 불러와주세요.",
        );
      const chosen = job.results.filter((c) => input.resultIds.includes(c.id));
      if (
        chosen.length !== input.resultIds.length ||
        chosen.some((c) => c.status !== "pending")
      )
        throw invalid([{ field: "resultIds", code: "unavailable" }]);
      const snapshot = await this.testScenarios.readSnapshot(
        tx,
        projectId,
        testScenarioId,
      );
      if (snapshot.contentRevision !== input.testScenarioRevision)
        throw revisionConflict("content", snapshot.contentRevision);
      const cases = [...snapshot.cases, ...chosen.map((c) => c.content)];
      validateContent(snapshot, cases);
      await this.testScenarios.writeContent(tx, projectId, testScenarioId, {
        expectedRevision: input.testScenarioRevision,
        columns: snapshot.columns,
        cases,
      });
      await appendAnalysisLinks(
        tx,
        projectId,
        chosen.flatMap((c) =>
          (c.requirementIds ?? []).map((requirementId) => ({
            requirementId,
            testScenarioId,
            caseId: c.id,
          })),
        ),
      );
      const [updated] = await tx
        .update(generationJobs)
        .set({
          results: job.results.map((c) =>
            input.resultIds.includes(c.id)
              ? { ...c, status: "added" as const }
              : c,
          ),
          revision: job.revision + 1,
        })
        .where(eq(generationJobs.id, job.id))
        .returning();
      return present(updated);
    });
  }
  async review(
    projectId: string,
    testScenarioId: string,
    jobId: string,
    resultId: string,
    input: ReviewGenerationResultDto,
  ) {
    return this.write(projectId, async (tx) => {
      await assertTestScenarioEditable(tx, testScenarioId);
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.id, jobId),
            eq(generationJobs.projectId, projectId),
            eq(generationJobs.testScenarioId, testScenarioId),
          ),
        );
      if (job?.status !== "succeeded") throw notFound();
      if (job.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "GENERATION_RESULT_CONFLICT",
          "다른 곳에서 생성 결과를 변경했습니다. 최신 결과를 불러와주세요.",
        );
      const results = structuredClone(job.results);
      const candidate = results.find((c) => c.id === resultId);
      if (!candidate) throw notFound();
      if (candidate.status === "added")
        throw new ApiError(
          409,
          "GENERATION_RESULT_ADDED",
          "이미 시나리오에 추가했습니다. 테스트 케이스는 시나리오에서 편집해주세요.",
        );
      const snapshot = await this.testScenarios.readSnapshot(
        tx,
        projectId,
        testScenarioId,
      );
      if (
        input.content &&
        (input.action === "edit" || input.action === "add")
      ) {
        const content = { ...input.content, id: candidate.id, caseCode: "" };
        validateContent(snapshot, [content]);
        candidate.content = content;
      }
      if (input.question) {
        if (input.action !== "add")
          throw invalid([{ field: "question", code: "requiresAdd" }]);
        const [analysis] = await tx
          .select()
          .from(projectAnalysis)
          .where(eq(projectAnalysis.projectId, projectId));
        if (analysis?.revision !== input.question.expectedRevision)
          throw new ApiError(
            409,
            "ANALYSIS_CONFLICT",
            "확인 질문이 변경되었습니다. 최신 자료를 확인해주세요.",
          );
        if (
          !analysis.items.some(
            (i) => i.id === candidate.id && i.kind === "question",
          )
        )
          throw invalid([{ field: "question", code: "unknownQuestion" }]);
        await tx
          .update(projectAnalysis)
          .set({
            revision: analysis.revision + 1,
            items: analysis.items.map((i) =>
              i.id === candidate.id
                ? {
                    ...i,
                    answer: input.question?.answer,
                    useAsRule: input.question?.useAsRule,
                  }
                : i,
            ),
          })
          .where(eq(projectAnalysis.projectId, projectId));
      }
      if (input.action === "edit") {
        if (!input.content) throw invalid();
      } else if (input.action === "add") {
        validateContent(snapshot, [...snapshot.cases, candidate.content]);
        await this.testScenarios.writeContent(tx, projectId, testScenarioId, {
          expectedRevision: snapshot.contentRevision,
          columns: snapshot.columns,
          cases: [...snapshot.cases, candidate.content],
        });
        await appendAnalysisLinks(
          tx,
          projectId,
          (candidate.requirementIds ?? []).map((requirementId) => ({
            requirementId,
            testScenarioId,
            caseId: candidate.id,
          })),
        );
        candidate.status = "added";
      } else
        candidate.status = input.action === "exclude" ? "excluded" : "pending";
      const [updated] = await tx
        .update(generationJobs)
        .set({ results, revision: job.revision + 1 })
        .where(eq(generationJobs.id, job.id))
        .returning();
      return present(updated);
    });
  }
}
