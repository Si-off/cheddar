import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../../database/database.service";
import { generationJobs, generationSteps } from "../../database/schema";
import { LocalStorage } from "../../storage/local-storage";
import { imageMime } from "../../temp-uploads/manifest";
import { withoutCellImages } from "../../test-sets/values";
import { AiFailure } from "../providers/ai-provider";
import { ProviderService } from "../providers/provider.service";
import { emptyCell, isAiColumn } from "../steps/column-rules";
import type { GenerationInput } from "../types";
import { AiUsageService } from "../usage.service";
import { PiInfrastructureError } from "./errors";
import { newCheckpoint, type PiCheckpoint, runPi } from "./runtime";
import { PiWorkspace } from "./workspace";

@Injectable()
export class PiGenerationService {
  /** 테스트에서는 같은 도구를 호출하는 합성 실행기로 바꾼다. */
  execute = runPi;
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
    @Inject(ProviderService) private readonly providers: ProviderService,
  ) {}
  async run(jobId: string, raw: GenerationInput, signal: AbortSignal) {
    try {
      return await this.runOnce(jobId, raw, signal);
    } catch (error) {
      if (
        error instanceof AiFailure ||
        error instanceof PiInfrastructureError ||
        signal.aborted
      )
        throw error;
      throw new PiInfrastructureError(error);
    }
  }
  private async runOnce(
    jobId: string,
    raw: GenerationInput,
    signal: AbortSignal,
  ) {
    const input = withoutCellImages(raw),
      config = input.pi;
    if (!config) throw new AiFailure("AI_PI_CONFIG_MISSING", false);
    if (this.providers.config.fake && this.execute === runPi)
      throw new AiFailure("AI_PI_FAKE_UNAVAILABLE", false);
    const db = this.database.db;
    await db
      .insert(generationSteps)
      .values({
        jobId,
        stage: "cases",
        workKey: "pi-agent",
        promptVersion: "pi-agent-1",
        model: `${config.model.provider}:${config.model.model}`,
        status: "running",
        startedAt: new Date(),
      })
      .onConflictDoNothing();
    const [step] = await db
      .select()
      .from(generationSteps)
      .where(
        and(
          eq(generationSteps.jobId, jobId),
          eq(generationSteps.workKey, "pi-agent"),
        ),
      );
    const state = (step.output as PiCheckpoint | null) ?? newCheckpoint();
    if (state.version !== 1) throw new AiFailure("AI_PI_STATE_INVALID", false);
    const persist = async () => {
      await db.transaction(async (tx) => {
        await tx
          .update(generationSteps)
          .set({
            output: state,
            requiredCoverage: {
              version: 1,
              complete: state.draft.complete,
              cases: state.draft.cases.length,
              reviews: state.draft.reviews.length,
            },
          })
          .where(eq(generationSteps.id, step.id));
        await tx
          .update(generationJobs)
          .set({
            expiresAt: new Date(
              Date.now() + Math.max(600000, config.timeoutMs),
            ),
            updatedAt: new Date(),
          })
          .where(eq(generationJobs.id, jobId));
      });
    };
    const image = async (frameId: string, index: number) => {
      const key = input.frames.find((f) => f.id === frameId)?.imageStorageKeys[
        index
      ];
      if (!key) throw new Error("선택한 화면의 이미지를 찾을 수 없습니다.");
      const handle = await this.storage.open(key);
      try {
        const bytes = await handle.readFile(),
          mimeType = imageMime(bytes);
        if (!mimeType) throw new Error("지원하지 않는 이미지입니다.");
        return { data: bytes.toString("base64"), mimeType };
      } finally {
        await handle.close();
      }
    };
    await db
      .update(generationJobs)
      .set({ currentStage: "cases" })
      .where(eq(generationJobs.id, jobId));
    await persist();
    try {
      const output = await this.execute({
        input,
        state,
        signal,
        checkpoint: persist,
        image,
        observe: (call) =>
          this.usage.recordObserved(
            { jobId, stepId: step.id, fake: this.providers.config.fake },
            config.model,
            call,
          ),
        usage: async (message) => {
          const u = message.usage;
          await this.usage
            .generate(
              { jobId, stepId: step.id, fake: this.providers.config.fake },
              {
                generate: async () => {
                  const usage = {
                    inputTokens: u.input,
                    outputTokens: u.output,
                    cacheReadTokens: u.cacheRead,
                    cacheCreationTokens: u.cacheWrite,
                  };
                  if (
                    message.stopReason === "error" ||
                    message.stopReason === "aborted"
                  )
                    throw new AiFailure(
                      "AI_AGENT_CALL_FAILED",
                      false,
                      u.totalTokens ? usage : undefined,
                    );
                  return { text: "", usage };
                },
              },
              {
                definition: {
                  key: "cases",
                  displayStage: "cases",
                  version: "pi-agent-1",
                  prompt: "",
                  maxTokens: config.maxTokens,
                  timeoutMs: config.timeoutMs,
                  retries: 0,
                  schema: () => ({}),
                },
                model: config.model,
                schema: {},
                context: input,
                sourceData: null,
                images: [],
              },
            )
            .catch(() => undefined);
        },
      });
      await db
        .update(generationSteps)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(generationSteps.id, step.id));
      return output;
    } catch (error) {
      if (signal.aborted || !(error instanceof AiFailure)) throw error;
      // 예산·시간 제한으로 끝나도 작성한 초안은 저장하고 미완료 범위를 확인 필요로 남긴다.
      if (!state.draft.cases.length && !state.draft.reviews.length) throw error;
      const draft = Object.fromEntries(
        input.columns
          .filter(isAiColumn)
          .map((c) => [
            c.id,
            c.systemKey === "title"
              ? "생성하지 못한 테스트 범위 확인"
              : emptyCell(c),
          ]),
      );
      // 업로드 정리 이후에도 다시 작성에 사용할 원문을 모두 남긴다.
      const sources = [
        `생성 메모: ${input.memo}`,
        ...input.frames.map(
          (f) => `화면: ${f.name} (${f.id})\n${f.screenDocument}`,
        ),
      ];
      let part = 0;
      for (const source of sources)
        for (let offset = 0; offset < source.length; offset += 18000) {
          state.draft.reviews.push({
            key: `agent-incomplete-${part++}`,
            values: draft,
            reason:
              "일부 테스트를 작성했지만 전체 검토를 마치지 못했습니다. 누락된 항목을 확인해주세요.",
            question: null,
            screenDescription: source.slice(offset, offset + 18000),
          });
        }
      state.draft.complete = true;
      state.draft.audit =
        "전체 검토 미완료: 작성 초안과 원문을 확인 필요 항목으로 보존함";
      await persist();
      await db
        .update(generationSteps)
        .set({
          status: "completed",
          failureCode:
            error instanceof AiFailure ? error.code : "AI_AGENT_INCOMPLETE",
          completedAt: new Date(),
        })
        .where(eq(generationSteps.id, step.id));
      return new PiWorkspace(input, state.draft, image, persist).output();
    }
  }
}
