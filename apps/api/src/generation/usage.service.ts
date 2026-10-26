import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { aiCallUsage, generationSteps } from "../database/schema";
import { costFor, pricingFor } from "./pricing";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  type ProviderObservation,
  type Usage,
} from "./providers/ai-provider";
import { type CallObservation, normalizeUsage } from "./usage";

export type UsageTarget =
  | { jobId: string; stepId: string; fake: boolean }
  | { projectId: string; purpose: string; fake: boolean };
const owner = (target: UsageTarget) =>
  "jobId" in target
    ? { jobId: target.jobId, stepId: target.stepId }
    : { projectId: target.projectId, purpose: target.purpose };

@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async markUnknown(jobId: string) {
    try {
      await this.database.db.transaction(async (tx) => {
        const unknown = await tx
          .update(aiCallUsage)
          .set({ status: "unknown" })
          .where(
            and(
              eq(aiCallUsage.jobId, jobId),
              eq(aiCallUsage.status, "running"),
            ),
          )
          .returning({ stepId: aiCallUsage.stepId });
        if (unknown.length)
          await tx
            .update(generationSteps)
            .set({
              cost: null,
              inputTokens: sql`coalesce(${generationSteps.inputTokens}, 0)`,
            })
            .where(
              inArray(
                generationSteps.id,
                unknown.flatMap((call) => (call.stepId ? [call.stepId] : [])),
              ),
            );
      });
    } catch {
      process.stderr.write(
        `${JSON.stringify({ event: "ai_usage_write_failed", jobId })}\n`,
      );
    }
  }

  private async write(
    target: UsageTarget,
    callId: string,
    action: () => Promise<unknown>,
  ) {
    try {
      await action();
      return true;
    } catch {
      process.stderr.write(
        `${JSON.stringify({ event: "ai_usage_write_failed", ...owner(target), callId })}\n`,
      );
      return false;
    }
  }

  async generate(
    target: UsageTarget,
    provider: AiProvider,
    request: AiRequest,
  ): Promise<AiResponse> {
    const id = randomUUID(),
      startedAt = new Date();
    const base = {
      id,
      ...owner(target),
      provider: target.fake ? "fake" : request.model.provider,
      requestedModel: request.model.model,
      startedAt,
    };
    await this.write(target, id, () =>
      this.database.db.insert(aiCallUsage).values(base),
    );
    const started = performance.now();
    let response: AiResponse | undefined, failure: unknown;
    try {
      response = await provider.generate(request);
      return response;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const error = failure instanceof AiFailure ? failure : undefined;
      const observation: ProviderObservation | undefined =
        response?.observation ?? error?.observation;
      const supplied = response?.usage ?? error?.usage;
      // 실제 토큰이 없는 통신 실패는 0으로 기록하지 않는다.
      const raw = observation
        ? observation.usage
        : supplied &&
          (request.model.provider === "openai"
            ? {
                input_tokens:
                  supplied.inputTokens +
                  supplied.cacheReadTokens +
                  supplied.cacheCreationTokens,
                output_tokens: supplied.outputTokens,
                input_tokens_details: {
                  cached_tokens: supplied.cacheReadTokens,
                  cache_write_tokens: supplied.cacheCreationTokens,
                },
              }
            : {
                input_tokens: supplied.inputTokens,
                output_tokens: supplied.outputTokens,
                cache_read_input_tokens: supplied.cacheReadTokens,
                cache_creation_input_tokens: supplied.cacheCreationTokens,
              });
      const usage = normalizeUsage(request.model.provider, raw);
      const usageKnown = usage.known && observation?.usageComplete !== false;
      const counts: Usage | null = usageKnown
        ? {
            inputTokens:
              (usage.inputTokens as number) -
              (usage.cachedInputTokens as number) -
              (usage.cacheWriteTokens as number),
            outputTokens: usage.outputTokens as number,
            cacheReadTokens: usage.cachedInputTokens as number,
            cacheCreationTokens: usage.cacheWriteTokens as number,
          }
        : null;
      const model = `${request.model.provider}:${observation?.responseModel ?? request.model.model}`;
      const standard =
        !observation?.serviceTier ||
        ["default", "standard"].includes(observation.serviceTier);
      const cost =
        counts && standard ? costFor(model, counts, target.fake) : null;
      const values = {
        ...base,
        finishedAt: new Date(),
        durationMs: Math.round(performance.now() - started),
        status: response ? "completed" : "failed",
        errorCode: error?.code ?? (failure ? "AI_STEP_FAILED" : null),
        requestId: observation?.requestId,
        responseId: observation?.responseId,
        responseModel: observation?.responseModel,
        serviceTier: observation?.serviceTier,
        httpStatus: observation?.httpStatus,
        usageKnown,
        rawUsage: usage.raw,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        reasoningTokens: usage.reasoningTokens,
        calculatedCostUsd: cost,
        pricing:
          counts && cost !== null
            ? target.fake
              ? { version: "fake", currency: "USD", rates: [0, 0, 0, 0] }
              : pricingFor(model, counts)
            : null,
      };
      await this.write(target, id, () =>
        this.database.db
          .insert(aiCallUsage)
          .values(values)
          .onConflictDoUpdate({ target: aiCallUsage.id, set: values }),
      );
      // 단계 합계는 생성 작업의 호출에만 있다.
      if ("stepId" in target) await this.stepTotals(target, id);
    }
  }

  /** pi의 실제 스트림 시작/종료를 동일한 호출 ID로 저장한다. DB 실패는 재시도 대상으로 전파한다. */
  async recordObserved(
    target: Extract<UsageTarget, { stepId: string }>,
    model: { provider: "openai" | "anthropic"; model: string },
    call: { id: string; startedAt: number; observation?: CallObservation },
  ) {
    const observed = call.observation;
    const usage = normalizeUsage(model.provider, observed?.usage);
    const known = Boolean(observed?.usageComplete && usage.known);
    const counts: Usage | null = known
      ? {
          inputTokens:
            (usage.inputTokens as number) -
            (usage.cachedInputTokens as number) -
            (usage.cacheWriteTokens as number),
          outputTokens: usage.outputTokens as number,
          cacheReadTokens: usage.cachedInputTokens as number,
          cacheCreationTokens: usage.cacheWriteTokens as number,
        }
      : null;
    const responseModel = `${model.provider}:${observed?.responseModel ?? model.model}`;
    const standard =
      model.provider === "anthropic" ||
      ["default", "standard"].includes(observed?.serviceTier ?? "");
    const cost =
      counts && standard ? costFor(responseModel, counts, target.fake) : null;
    const values = {
      id: call.id,
      ...owner(target),
      provider: target.fake ? "fake" : model.provider,
      requestedModel: model.model,
      startedAt: new Date(call.startedAt),
      status: observed?.status ?? "running",
      finishedAt: observed ? new Date(observed.finishedAt) : undefined,
      durationMs: observed?.durationMs,
      requestId: observed?.requestId,
      responseId: observed?.responseId,
      responseModel: observed?.responseModel,
      serviceTier: observed?.serviceTier,
      httpStatus: observed?.httpStatus,
      errorCode: observed?.errorCode,
      usageKnown: known,
      rawUsage: usage.raw,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      reasoningTokens: usage.reasoningTokens,
      calculatedCostUsd: cost,
      pricing:
        counts && cost !== null ? pricingFor(responseModel, counts) : null,
    };
    // 시작 기록을 재전송해도 기존 종료 결과를 덮어쓰지 않는다.
    if (!observed)
      await this.database.db
        .insert(aiCallUsage)
        .values(values)
        .onConflictDoNothing();
    else
      await this.database.db
        .insert(aiCallUsage)
        .values(values)
        .onConflictDoUpdate({ target: aiCallUsage.id, set: values });
    await this.stepTotals(target, call.id);
  }

  private async stepTotals(
    target: Extract<UsageTarget, { stepId: string }>,
    id: string,
  ) {
    const { stepId } = target;
    // 호출 기록에서 다시 합산해 이전 합계 저장 실패도 다음 호출에서 복구한다.
    const totalsSaved = await this.write(target, id, () =>
      this.database.db.transaction(async (tx) => {
        // 같은 단계의 동시 집계가 오래된 합계로 덮어쓰지 않도록 먼저 잠근다.
        await tx
          .select({ id: generationSteps.id })
          .from(generationSteps)
          .where(eq(generationSteps.id, stepId))
          .for("update");
        const [totals] = await tx
          .select({
            inputTokens: sql<
              number | null
            >`sum(${aiCallUsage.inputTokens} - ${aiCallUsage.cachedInputTokens} - ${aiCallUsage.cacheWriteTokens}) filter (where ${aiCallUsage.usageKnown})::integer`,
            outputTokens: sql<
              number | null
            >`sum(${aiCallUsage.outputTokens}) filter (where ${aiCallUsage.usageKnown})::integer`,
            cacheReadTokens: sql<
              number | null
            >`sum(${aiCallUsage.cachedInputTokens}) filter (where ${aiCallUsage.usageKnown})::integer`,
            cacheCreationTokens: sql<
              number | null
            >`sum(${aiCallUsage.cacheWriteTokens}) filter (where ${aiCallUsage.usageKnown})::integer`,
            cost: sql<
              string | null
            >`case when bool_and(${aiCallUsage.status} in ('completed', 'failed') and ${aiCallUsage.calculatedCostUsd} is not null) then sum(${aiCallUsage.calculatedCostUsd}) else null end`,
          })
          .from(aiCallUsage)
          .where(eq(aiCallUsage.stepId, stepId));
        await tx
          .update(generationSteps)
          .set(totals)
          .where(eq(generationSteps.id, stepId));
      }),
    );
    if (!totalsSaved)
      await this.write(target, id, () =>
        this.database.db
          .update(generationSteps)
          .set({
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheCreationTokens: null,
            cost: null,
          })
          .where(eq(generationSteps.id, stepId)),
      );
  }
}
