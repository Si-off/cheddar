import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import {
  assertSheetEditable,
  expireGeneration,
} from "../common/generation-lock";
import type {
  AddGeneratedCasesDto,
  GenerationDto,
  ReviewCandidateDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  generationJobs,
  iaItems,
  projectEvidence,
  projects,
  sheets as sheetsTable,
  uploadFrames,
  uploads,
} from "../database/schema";
import {
  revisionConflict,
  SheetsRepository,
} from "../sheets/sheets.repository";
import { appendEvidenceLinks } from "../uploads/evidence.service";
import { type GenerationResult, validateContent } from "./result";
export type Job = typeof generationJobs.$inferSelect;
export function present(job: Job): GenerationDto {
  return {
    id: job.id,
    mode: job.request.mode ?? "replace",
    sheetId: job.sheetId,
    provider: job.provider,
    model: job.model,
    status: job.status,
    error: job.error,
    revision: job.revision,
    caseCount: job.caseCount,
    candidates: job.candidates,
    createdAt: job.createdAt.toISOString(),
  };
}
@Injectable()
export class GenerationRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(SheetsRepository) private readonly sheets: SheetsRepository,
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
    sheetId: string,
    request: StartGenerationDto,
    model: string,
  ) {
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          sheetId,
          mode: request.mode ?? "replace",
          frameIds: request.frameIds ? [...request.frameIds].sort() : null,
          requirementIds: request.requirementIds
            ? [...request.requirementIds].sort()
            : null,
          provider: request.provider,
          expectedRevision: request.expectedRevision,
          uploadId:
            request.uploadId === undefined ? "sheet-default" : request.uploadId,
          description: request.description ?? "",
          exampleSheetId: request.exampleSheetId ?? null,
        }),
      )
      .digest("hex");
    return this.write(projectId, async (tx) => {
      await expireGeneration(tx, sheetId);
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
      await assertSheetEditable(tx, sheetId);
      const snapshot = await this.sheets.readSnapshot(tx, projectId, sheetId);
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
        const [evidence] = await tx
          .select()
          .from(projectEvidence)
          .where(eq(projectEvidence.projectId, projectId));
        if (
          request.requirementIds.some(
            (id) =>
              !evidence?.items.some(
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
          "업로드 묶음을 선택하거나 테스트할 내용을 설명해주세요.",
        );
      if (request.exampleSheetId)
        await this.sheets.readSnapshot(tx, projectId, request.exampleSheetId);
      const [job] = await tx
        .insert(generationJobs)
        .values({
          projectId,
          sheetId,
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
  async list(projectId: string, sheetId: string) {
    return this.write(projectId, async (tx) => {
      await this.sheets.readSnapshot(tx, projectId, sheetId);
      await expireGeneration(tx, sheetId);
      return {
        items: (
          await tx
            .select()
            .from(generationJobs)
            .where(
              and(
                eq(generationJobs.projectId, projectId),
                eq(generationJobs.sheetId, sheetId),
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
    const [evidence] = await this.database.db
      .select()
      .from(projectEvidence)
      .where(eq(projectEvidence.projectId, job.projectId));
    if (job.request.requirementIds?.length && !job.request.frameIds) {
      const sourceFrames = [
        ...new Set(
          (evidence?.items ?? [])
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
    const example = job.request.exampleSheetId
      ? await this.sheets.get(job.projectId, job.request.exampleSheetId)
      : job.snapshot;
    return {
      frames: job.request.frameIds
        ? frames.filter((f) => job.request.frameIds?.includes(f.id))
        : frames,
      ia,
      example,
      evidence,
    };
  }
  async succeed(job: Job, result: GenerationResult) {
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
      let candidates = result.candidates;
      if (result.sources) {
        const [doc] = await tx
          .select()
          .from(projectEvidence)
          .where(eq(projectEvidence.projectId, job.projectId));
        if ((doc?.revision ?? 0) !== result.sourceRevision)
          throw new ApiError(
            409,
            "EVIDENCE_CONFLICT",
            "생성 중 근거가 변경되었습니다. 최신 자료로 다시 생성해주세요.",
          );
        await tx
          .insert(projectEvidence)
          .values({
            projectId: job.projectId,
            revision: (doc?.revision ?? 0) + 1,
            items: result.sources,
            links: doc?.links ?? [],
          })
          .onConflictDoUpdate({
            target: projectEvidence.projectId,
            set: { revision: (doc?.revision ?? 0) + 1, items: result.sources },
          });
      }
      if (job.request.mode === "review") {
        candidates = [
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
      } else {
        await this.sheets.writeContent(tx, job.projectId, job.sheetId, {
          expectedRevision: job.snapshot.contentRevision,
          columns: job.snapshot.columns,
          cases: result.cases,
        });
        await tx
          .update(sheetsTable)
          .set({ uploadId: job.request.uploadId ?? null })
          .where(eq(sheetsTable.id, job.sheetId));
        await appendEvidenceLinks(
          tx,
          job.projectId,
          (result.links ?? [])
            .filter((l) => result.cases.some((c) => c.id === l.caseId))
            .flatMap((l) =>
              l.requirementIds.map((requirementId) => ({
                requirementId,
                caseId: l.caseId,
                sheetId: job.sheetId,
              })),
            ),
          job.sheetId,
        );
      }
      await tx
        .update(generationJobs)
        .set({
          status: "succeeded",
          candidates,
          caseCount: result.cases.length,
          revision: current.revision + 1,
        })
        .where(eq(generationJobs.id, job.id));
    });
  }
  async fail(job: Job, message: string) {
    await this.write(job.projectId, async (tx) => {
      await tx
        .update(generationJobs)
        .set({ status: "failed", error: message })
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
    sheetId: string,
    jobId: string,
    input: AddGeneratedCasesDto,
  ) {
    return this.write(projectId, async (tx) => {
      await assertSheetEditable(tx, sheetId);
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.id, jobId),
            eq(generationJobs.projectId, projectId),
            eq(generationJobs.sheetId, sheetId),
          ),
        );
      if (job?.status !== "succeeded") throw notFound();
      if (job.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "CANDIDATE_CONFLICT",
          "결과가 변경되었습니다. 최신 결과를 불러와주세요.",
        );
      const chosen = job.candidates.filter((c) =>
        input.candidateIds.includes(c.id),
      );
      if (
        chosen.length !== input.candidateIds.length ||
        chosen.some((c) => c.status !== "pending")
      )
        throw invalid([{ field: "candidateIds", code: "unavailable" }]);
      const snapshot = await this.sheets.readSnapshot(tx, projectId, sheetId);
      if (snapshot.contentRevision !== input.sheetRevision)
        throw revisionConflict("content", snapshot.contentRevision);
      const cases = [...snapshot.cases, ...chosen.map((c) => c.content)];
      validateContent(snapshot, cases);
      await this.sheets.writeContent(tx, projectId, sheetId, {
        expectedRevision: input.sheetRevision,
        columns: snapshot.columns,
        cases,
      });
      await appendEvidenceLinks(
        tx,
        projectId,
        chosen.flatMap((c) =>
          (c.requirementIds ?? []).map((requirementId) => ({
            requirementId,
            sheetId,
            caseId: c.id,
          })),
        ),
      );
      const [updated] = await tx
        .update(generationJobs)
        .set({
          candidates: job.candidates.map((c) =>
            input.candidateIds.includes(c.id)
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
    sheetId: string,
    jobId: string,
    candidateId: string,
    input: ReviewCandidateDto,
  ) {
    return this.write(projectId, async (tx) => {
      await assertSheetEditable(tx, sheetId);
      const [job] = await tx
        .select()
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.id, jobId),
            eq(generationJobs.projectId, projectId),
            eq(generationJobs.sheetId, sheetId),
          ),
        );
      if (job?.status !== "succeeded") throw notFound();
      if (job.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "CANDIDATE_CONFLICT",
          "다른 곳에서 후보를 변경했습니다. 최신 후보를 불러와주세요.",
        );
      const candidates = structuredClone(job.candidates);
      const candidate = candidates.find((c) => c.id === candidateId);
      if (!candidate) throw notFound();
      if (candidate.status === "added")
        throw new ApiError(
          409,
          "CANDIDATE_ADDED",
          "이미 시트에 추가한 후보입니다. 시트에서 편집해주세요.",
        );
      const snapshot = await this.sheets.readSnapshot(tx, projectId, sheetId);
      if (input.action === "edit") {
        if (!input.content) throw invalid();
        const content = { ...input.content, id: candidate.id, caseCode: "" };
        validateContent(snapshot, [content]);
        // References are also checked when this candidate is added to the sheet.
        candidate.content = content;
      } else if (input.action === "add") {
        validateContent(snapshot, [...snapshot.cases, candidate.content]);
        await this.sheets.writeContent(tx, projectId, sheetId, {
          expectedRevision: snapshot.contentRevision,
          columns: snapshot.columns,
          cases: [...snapshot.cases, candidate.content],
        });
        await appendEvidenceLinks(
          tx,
          projectId,
          (candidate.requirementIds ?? []).map((requirementId) => ({
            requirementId,
            sheetId,
            caseId: candidate.id,
          })),
        );
        candidate.status = "added";
      } else
        candidate.status = input.action === "exclude" ? "excluded" : "pending";
      const [updated] = await tx
        .update(generationJobs)
        .set({ candidates, revision: job.revision + 1 })
        .where(eq(generationJobs.id, job.id))
        .returning();
      return present(updated);
    });
  }
}
