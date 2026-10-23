import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { ApiError, notFound } from "../common/errors";
import type {
  AcceptReviewItemDto,
  PatchReviewItemDto,
  ReviewItemDto,
  RewriteReviewItemDto,
} from "../contracts/generation.dto";
import type { DatabaseTransaction } from "../database/database.service";
import { reviewItems } from "../database/schema";
import { GenerationService } from "../generation/generation.service";
import { validateDraft } from "../generation/output-schema";
import { similarCases } from "../generation/similar-cases";
import type { Draft, GenerationInput } from "../generation/types";
import { CaseOperationsService } from "../test-sets/case-operations.service";
import { TestSetsStore } from "../test-sets/test-sets.store";

type ReviewRow = typeof reviewItems.$inferSelect;
export function reviewDto(row: ReviewRow): ReviewItemDto {
  const qa = row.questions.at(-1);
  return {
    id: row.id,
    reason: row.reason,
    question: qa?.question || null,
    answer: qa?.answer ?? "",
    draft: row.draft as Draft,
    status: row.status as ReviewItemDto["status"],
  };
}
@Injectable()
export class ReviewItemsService {
  constructor(
    @Inject(TestSetsStore) private readonly store: TestSetsStore,
    @Inject(CaseOperationsService)
    private readonly operations: CaseOperationsService,
    @Inject(GenerationService) private readonly generation: GenerationService,
  ) {}
  async list(testSetId: string, accountId: string) {
    await this.store.visible(testSetId, accountId);
    return {
      items: (
        await this.store.database.db
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.testSetId, testSetId))
          .orderBy(reviewItems.createdAt, reviewItems.id)
      ).map(reviewDto),
    };
  }
  async mutate<T>(
    id: string,
    accountId: string,
    work: (tx: DatabaseTransaction, row: ReviewRow) => Promise<T>,
  ) {
    const [row] = await this.store.database.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.id, id));
    if (!row) throw notFound();
    return this.store.mutate(
      row.testSetId,
      accountId,
      "canEdit",
      async (tx) => {
        const [locked] = await tx
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.id, id))
          .for("update");
        if (!locked) throw notFound();
        if (["resolved", "rewriting"].includes(locked.status))
          throw new ApiError(
            409,
            "REVIEW_ITEM_LOCKED",
            "처리 중이거나 추가한 항목은 변경할 수 없습니다.",
          );
        return work(tx, locked);
      },
    );
  }
  patch(id: string, accountId: string, dto: PatchReviewItemDto) {
    return this.mutate(id, accountId, async (tx, row) => {
      const draft =
        dto.draft === undefined
          ? row.draft
          : validateDraft(
              await this.store.columns(row.testSetId, tx),
              dto.draft,
            );
      const questions = [...row.questions];
      if (dto.answer !== undefined) {
        const qa = questions.pop();
        questions.push({ question: qa?.question ?? "", answer: dto.answer });
      }
      const [updated] = await tx
        .update(reviewItems)
        .set({
          draft,
          questions,
          status: dto.status ?? row.status,
          updatedAt: new Date(),
        })
        .where(eq(reviewItems.id, id))
        .returning();
      await this.store.bump(row.testSetId, tx);
      return reviewDto(updated);
    });
  }
  accept(id: string, accountId: string, dto: AcceptReviewItemDto) {
    return this.mutate(id, accountId, async (tx, row) => {
      const draft = validateDraft(
        await this.store.columns(row.testSetId, tx),
        dto.draft,
      );
      const existing = await this.store.cases(row.testSetId, tx);
      const result = await this.operations.applyInTransaction(
        tx,
        row.testSetId,
        accountId,
        {
          ops: [
            {
              type: "add_case",
              caseId: randomUUID(),
              afterCaseId: existing.at(-1)?.id ?? null,
              values: draft,
              featureGroupId: row.featureGroupId,
            },
          ],
        },
      );
      const [updated] = await tx
        .update(reviewItems)
        .set({ draft, status: "resolved", updatedAt: new Date() })
        .where(eq(reviewItems.id, id))
        .returning();
      return {
        item: reviewDto(updated),
        case: result.cases[0],
        version: result.version,
      };
    });
  }
  async rewrite(id: string, accountId: string, dto: RewriteReviewItemDto) {
    await this.generation.expireJobs();
    const [route] = await this.store.database.db
      .select({ testSetId: reviewItems.testSetId })
      .from(reviewItems)
      .where(eq(reviewItems.id, id));
    if (!route) throw notFound();
    const jobId = await this.store.mutate(
      route.testSetId,
      accountId,
      "canEdit",
      async (tx) => {
        const hash = this.generation.requestHash(route.testSetId, {
          kind: "rewrite",
          reviewItemId: id,
          answer: dto.answer,
        });
        const repeated = await this.generation.repeated(
          tx,
          accountId,
          dto.clientRequestId,
          hash,
        );
        if (repeated) return repeated;
        await this.generation.assertIdle(route.testSetId, tx);
        await this.generation.admission(tx);
        const [row] = await tx
          .select()
          .from(reviewItems)
          .where(eq(reviewItems.id, id))
          .for("update");
        if (!row) throw notFound();
        if (["resolved", "rewriting"].includes(row.status))
          throw new ApiError(
            409,
            "REVIEW_ITEM_LOCKED",
            "처리 중이거나 추가한 항목은 변경할 수 없습니다.",
          );
        const previous = reviewDto(row);
        const input: GenerationInput = {
          guide: this.generation.guide,
          columns: await this.store.columns(row.testSetId, tx),
          memo: "",
          frames: [],
          featureGroups: [],
          viewpoints: [],
          screenStructure: [],
          styleExamples: [],
          existingCases: similarCases(
            await this.store.cases(row.testSetId, tx),
            previous.draft,
            row.screenDescription,
          ),
          review: {
            screenDescription: row.screenDescription,
            question: previous.question,
            answer: dto.answer,
            draft: previous.draft,
          },
        };
        const questions = [...row.questions];
        const qa = questions.pop();
        questions.push({ question: qa?.question ?? "", answer: dto.answer });
        await tx
          .update(reviewItems)
          .set({ status: "rewriting", questions, updatedAt: new Date() })
          .where(eq(reviewItems.id, id));
        await this.store.bump(row.testSetId, tx);
        return this.generation.insertJob(
          tx,
          row.testSetId,
          accountId,
          "rewrite",
          input,
          undefined,
          id,
          dto.clientRequestId,
          hash,
        );
      },
    );
    await this.generation.dispatch(jobId, "rewrite");
    return { jobId };
  }
}
