import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ApiError } from "../common/errors";
import { API_ENV, type ApiEnv } from "../config/env";
import type {
  AddGeneratedCasesDto,
  ReviewGenerationResultDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import { FilesService } from "../files/files.service";
import { extractAnalysis } from "../uploads/extract-analysis";
import {
  GenerationRepository,
  type Job,
  present,
} from "./generation.repository";
import { prepareFrame } from "./prepare-frame";
import { generate, type PreparedInput } from "./provider";
import { type GenerationResult, parseResult } from "./result";
import {
  parseSources,
  structureInstructions,
  structureSchema,
} from "./structure-sources";

const State = Annotation.Root({
  input: Annotation<PreparedInput>(),
  raw: Annotation<string>(),
  result: Annotation<GenerationResult>(),
});
@Injectable()
export class GenerationService implements OnModuleDestroy {
  private readonly active = new Map<
    string,
    { abort: AbortController; task: Promise<void> }
  >();
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(GenerationRepository)
    private readonly repository: GenerationRepository,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}
  providers() {
    return {
      items: [
        {
          id: "anthropic" as const,
          model: this.env.ai?.anthropicModel ?? "claude-haiku-5-5",
          configured: Boolean(this.env.ai?.anthropicKey),
        },
        {
          id: "openai" as const,
          model: this.env.ai?.openaiModel ?? "gpt-6-luna",
          configured: Boolean(this.env.ai?.openaiKey),
        },
      ],
    };
  }
  async start(
    projectId: string,
    testScenarioId: string,
    request: StartGenerationDto,
  ) {
    const provider = this.providers().items.find(
      (p) => p.id === request.provider,
    );
    const key =
      request.provider === "anthropic"
        ? this.env.ai?.anthropicKey
        : this.env.ai?.openaiKey;
    if (!provider || !key)
      throw new ApiError(
        503,
        "AI_KEY_MISSING",
        "AI의 API 키가 설정되지 않았습니다. 서버 설정 후 다시 시도해주세요.",
      );
    const { job, created } = await this.repository.start(
      projectId.toLowerCase(),
      testScenarioId.toLowerCase(),
      {
        ...request,
        clientRequestId: request.clientRequestId.toLowerCase(),
        uploadId:
          request.uploadId === null ? null : request.uploadId?.toLowerCase(),
        frameIds: request.frameIds?.map((id) => id.toLowerCase()),
        requirementIds: request.requirementIds?.map((id) => id.toLowerCase()),
        exampleTestScenarioId: request.exampleTestScenarioId?.toLowerCase(),
      },
      provider.model,
    );
    if (created) {
      const abort = new AbortController();
      const task = this.run(job, key, abort.signal).finally(() =>
        this.active.delete(job.id),
      );
      this.active.set(job.id, { abort, task });
    }
    return present(job);
  }
  list(projectId: string, testScenarioId: string) {
    return this.repository.list(
      projectId.toLowerCase(),
      testScenarioId.toLowerCase(),
    );
  }
  add(
    projectId: string,
    testScenarioId: string,
    jobId: string,
    input: AddGeneratedCasesDto,
  ) {
    return this.repository.add(
      projectId.toLowerCase(),
      testScenarioId.toLowerCase(),
      jobId.toLowerCase(),
      input,
    );
  }
  review(
    projectId: string,
    testScenarioId: string,
    jobId: string,
    resultId: string,
    input: ReviewGenerationResultDto,
  ) {
    return this.repository.review(
      projectId.toLowerCase(),
      testScenarioId.toLowerCase(),
      jobId.toLowerCase(),
      resultId.toLowerCase(),
      input,
    );
  }
  private async prepare(job: Job): Promise<PreparedInput> {
    const context = await this.repository.context(job);
    const images: PreparedInput["images"] = [];
    const frames: unknown[] = [];
    let totalBytes = 0;
    const sourceCandidates: import("../contracts/analysis.dto").AnalysisItemDto[] =
      [];
    for (const frame of context.frames) {
      const buffers: Buffer[] = [];
      for (const fileId of [frame.dataFileId, frame.imageFileId]) {
        const download = await this.files.download(job.projectId, fileId);
        const parts: Buffer[] = [];
        for await (const part of download.stream) {
          totalBytes += part.length;
          if (totalBytes > 20 * 1024 * 1024)
            throw new ApiError(
              413,
              "AI_INPUT_TOO_LARGE",
              "Figma 자료가 생성 입력 크기 제한을 초과했습니다. 프레임 분할 업로드 후 다시 생성해주세요.",
            );
          parts.push(Buffer.from(part));
        }
        buffers.push(Buffer.concat(parts));
      }
      const raw = JSON.parse(buffers[0].toString("utf8"));
      if (
        (job.request.mode === "review" || job.request.mode === "append") &&
        !context.analysis?.items.some((i) => i.frameId === frame.id)
      )
        sourceCandidates.push(...extractAnalysis(raw, frame.id));
      frames.push({
        id: frame.id,
        name: frame.name,
        node: prepareFrame(raw),
      });
      images.push({ id: frame.id, data: buffers[1].toString("base64") });
    }
    const text = JSON.stringify({
      kind: job.snapshot.kind,
      description: job.request.description ?? "",
      columns: job.snapshot.columns,
      exampleCases: context.example.cases,
      ia: context.ia,
      frames,
    });
    if (text.length > 350_000)
      throw new ApiError(
        413,
        "AI_INPUT_TOO_LARGE",
        "프레임 데이터와 예시가 너무 큽니다. 업로드 범위나 예시 테스트 케이스를 줄여주세요.",
      );
    return {
      text,
      images,
      sourceCandidates,
      sourceItems: context.analysis?.items ?? [],
      sourceRevision: context.analysis?.revision ?? 0,
      frameIds: context.frames.map((f) => f.id),
      screenIds: context.ia.map((i) => i.id),
      customColumnIds: job.snapshot.columns
        .filter((column) => column.kind === "custom")
        .map((column) => column.id),
    };
  }
  private async structure(
    job: Job,
    input: PreparedInput,
    signal: AbortSignal,
  ): Promise<PreparedInput> {
    let sources = input.sourceItems ?? [];
    if (input.sourceCandidates?.length) {
      const text = JSON.stringify({ sourceCandidates: input.sourceCandidates });
      if (text.length > 350000)
        throw new ApiError(
          413,
          "AI_INPUT_TOO_LARGE",
          "자료의 설명이 분석 한도를 넘었습니다. 화면 선택을 줄여주세요.",
        );
      const raw = await generate(
        job.provider,
        job.model,
        job.provider === "anthropic"
          ? (this.env.ai?.anthropicKey ?? "")
          : (this.env.ai?.openaiKey ?? ""),
        { ...input, text },
        AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
        { schema: structureSchema, instructions: structureInstructions },
      );
      sources = [...sources, ...parseSources(raw, input.sourceCandidates)];
    }
    const requested = job.request.requirementIds;
    const selected = sources.filter((i) =>
      requested?.length
        ? requested.includes(i.id) || i.kind === "relation"
        : !i.frameId || input.frameIds.includes(i.frameId) || i.useAsRule,
    );
    const requirements = selected.filter(
      (i) => i.kind === "requirement" || i.kind === "question",
    );
    const text = JSON.stringify({
      ...JSON.parse(input.text),
      sources: selected.map((i) => ({
        ...i,
        useAsRule: i.useAsRule || requested?.includes(i.id),
        answer: i.useAsRule || requested?.includes(i.id) ? i.answer : undefined,
      })),
    });
    if (text.length > 350000)
      throw new ApiError(
        413,
        "AI_INPUT_TOO_LARGE",
        "자료와 예시가 생성 한도를 넘었습니다. 화면 선택이나 설명을 줄여주세요.",
      );
    return {
      ...input,
      text,
      sourceItems: sources,
      requirementIds: requirements.map((i) => i.id),
    };
  }
  private async run(job: Job, key: string, abort: AbortSignal) {
    try {
      const signal = AbortSignal.any([abort, AbortSignal.timeout(480_000)]);
      const graph = new StateGraph(State)
        .addNode("prepare", async () => ({ input: await this.prepare(job) }))
        .addNode("structure", async (state) => ({
          input: await this.structure(job, state.input, signal),
        }))
        .addNode("generate", async (state) => ({
          raw: await generate(
            job.provider,
            job.model,
            key,
            state.input,
            AbortSignal.any([signal, AbortSignal.timeout(240_000)]),
          ),
        }))
        .addNode("validate", (state) => {
          const result = parseResult(
            state.raw,
            job.snapshot,
            state.input.frameIds,
            state.input.screenIds,
            state.input.requirementIds,
          );
          if (job.request.mode === "review" || job.request.mode === "append") {
            result.sources = [
              ...(state.input.sourceItems ?? []),
              ...result.candidates.map((c) => ({
                id: c.id,
                kind: "question" as const,
                title: c.content.title.slice(0, 255),
                text: c.reason,
                frameId: c.content.relatedFrameIds[0],
                useAsRule: false,
              })),
            ];
            result.sourceRevision = state.input.sourceRevision;
          }
          return { result };
        })
        .addNode("save", async (state) => {
          signal.throwIfAborted();
          await this.repository.succeed(job, state.result);
          return {};
        })
        .addEdge(START, "prepare")
        .addEdge("prepare", "structure")
        .addEdge("structure", "generate")
        .addEdge("generate", "validate")
        .addEdge("validate", "save")
        .addEdge("save", END)
        .compile();
      await graph.invoke({}, { signal });
    } catch (error) {
      // Generation validators/providers only attach categorical diagnostics; no input or keys.
      if (
        error instanceof ApiError &&
        ["INVALID_AI_RESULT", "AI_REQUEST_FAILED"].includes(error.code)
      )
        process.stderr.write(
          `${JSON.stringify({ event: "generation_failed", jobId: job.id, provider: job.provider, code: error.code, details: error.details })}\n`,
        );
      const message =
        error instanceof ApiError
          ? error.message
          : "생성을 완료하지 못했습니다. 기존 시나리오는 유지됩니다. 입력과 서버 연결 확인 후 다시 생성해주세요.";
      await this.repository.fail(job, message).catch(() => {
        process.stderr.write(
          "Generation failure status could not be saved; lease will expire.\n",
        );
      });
    }
  }
  async onModuleDestroy() {
    for (const item of this.active.values()) item.abort.abort();
    await Promise.allSettled(
      [...this.active.values()].map((item) => item.task),
    );
  }
}
