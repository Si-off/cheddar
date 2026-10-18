import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { aiCallUsage } from "../database/schema";
import {
  type AiProvider,
  type CallHooks,
  estimateCost,
  normalizeUsage,
} from "./usage";

// A test case generation job or a scenario flow generation job.
export type UsageTarget = {
  kind: "generation" | "flow";
  id: string;
  projectId: string;
  provider: AiProvider;
  model: string;
};

@Injectable()
export class AiUsageService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  hooks(job: UsageTarget): CallHooks {
    const base = {
      id: randomUUID(),
      jobId: job.kind === "generation" ? job.id : null,
      flowJobId: job.kind === "flow" ? job.id : null,
      projectId: job.projectId,
      provider: job.provider,
      requestedModel: job.model,
      startedAt: new Date(),
    };
    const write = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch {
        process.stderr.write(
          `${JSON.stringify({ event: "ai_usage_write_failed", kind: job.kind, jobId: job.id, callId: base.id })}\n`,
        );
      }
    };
    return {
      onStart: () =>
        write(() => this.database.db.insert(aiCallUsage).values(base)),
      onFinish: (observation) =>
        write(async () => {
          const usage = normalizeUsage(job.provider, observation.usage);
          const estimate = estimateCost(
            job.provider,
            observation.responseModel ?? job.model,
            usage,
            observation.serviceTier,
          );
          const values = {
            ...base,
            finishedAt: observation.finishedAt,
            durationMs: observation.durationMs,
            status: observation.status,
            requestId: observation.requestId,
            responseId: observation.responseId,
            responseModel: observation.responseModel,
            serviceTier: observation.serviceTier,
            httpStatus: observation.httpStatus,
            errorCode: observation.errorCode,
            usageKnown: usage.known,
            rawUsage: usage.raw,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            cachedInputTokens: usage.cachedInputTokens,
            cacheWriteTokens: usage.cacheWriteTokens,
            reasoningTokens: usage.reasoningTokens,
            calculatedCostUsd: estimate?.cost ?? null,
            pricing: estimate?.pricing ?? null,
          };
          await this.database.db
            .insert(aiCallUsage)
            .values(values)
            .onConflictDoUpdate({ target: aiCallUsage.id, set: values });
        }),
    };
  }
}
