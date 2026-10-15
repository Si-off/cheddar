import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import {
  assertSheetEditable,
  expireGeneration,
} from "../common/generation-lock";
import type {
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
  projects,
  sheets as sheetsTable,
  uploadFrames,
  uploads,
} from "../database/schema";
import {
  revisionConflict,
  SheetsRepository,
} from "../sheets/sheets.repository";
import { type GenerationResult, validateContent } from "./result";
export type Job = typeof generationJobs.$inferSelect;
export function present(job: Job): GenerationDto {
  return {
    id: job.id,
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
      if (!uploadId && !request.description?.trim())
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
    const frames = job.request.uploadId
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
    const example = job.request.exampleSheetId
      ? await this.sheets.get(job.projectId, job.request.exampleSheetId)
      : job.snapshot;
    return { frames, ia, example };
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
      await this.sheets.writeContent(tx, job.projectId, job.sheetId, {
        expectedRevision: job.snapshot.contentRevision,
        columns: job.snapshot.columns,
        cases: result.cases,
      });
      await tx
        .update(sheetsTable)
        .set({ uploadId: job.request.uploadId ?? null })
        .where(eq(sheetsTable.id, job.sheetId));
      await tx
        .update(generationJobs)
        .set({
          status: "succeeded",
          candidates: result.candidates,
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
