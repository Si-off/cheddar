import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ApiError } from "../common/errors";
import { API_ENV, type ApiEnv } from "../config/env";
import type {
  ReviewCandidateDto,
  StartGenerationDto,
} from "../contracts/generation.dto";
import { FilesService } from "../files/files.service";
import {
  GenerationRepository,
  type Job,
  present,
} from "./generation.repository";
import { prepareFrame } from "./prepare-frame";
import { generate, type PreparedInput } from "./provider";
import { type GenerationResult, parseResult } from "./result";

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
  async start(projectId: string, sheetId: string, request: StartGenerationDto) {
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
        "선택한 AI의 API 키가 설정되지 않았습니다. 서버 설정 후 다시 시도해주세요.",
      );
    const { job, created } = await this.repository.start(
      projectId.toLowerCase(),
      sheetId.toLowerCase(),
      {
        ...request,
        clientRequestId: request.clientRequestId.toLowerCase(),
        uploadId:
          request.uploadId === null ? null : request.uploadId?.toLowerCase(),
        exampleSheetId: request.exampleSheetId?.toLowerCase(),
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
  list(projectId: string, sheetId: string) {
    return this.repository.list(projectId.toLowerCase(), sheetId.toLowerCase());
  }
  review(
    projectId: string,
    sheetId: string,
    jobId: string,
    candidateId: string,
    input: ReviewCandidateDto,
  ) {
    return this.repository.review(
      projectId.toLowerCase(),
      sheetId.toLowerCase(),
      jobId.toLowerCase(),
      candidateId.toLowerCase(),
      input,
    );
  }
  private async prepare(job: Job): Promise<PreparedInput> {
    const context = await this.repository.context(job);
    const images: PreparedInput["images"] = [];
    const frames: unknown[] = [];
    let totalBytes = 0;
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
              "업로드 자료가 한 번에 생성할 수 있는 크기를 초과했습니다. 프레임을 나누어 업로드한 뒤 다시 생성해주세요.",
            );
          parts.push(Buffer.from(part));
        }
        buffers.push(Buffer.concat(parts));
      }
      frames.push({
        id: frame.id,
        name: frame.name,
        node: prepareFrame(JSON.parse(buffers[0].toString("utf8"))),
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
        "프레임 데이터와 예시가 너무 큽니다. 업로드 범위나 예시 케이스를 줄여주세요.",
      );
    return {
      text,
      images,
      frameIds: context.frames.map((f) => f.id),
      screenIds: context.ia.map((i) => i.id),
    };
  }
  private async run(job: Job, key: string, abort: AbortSignal) {
    try {
      const signal = AbortSignal.any([abort, AbortSignal.timeout(240_000)]);
      const graph = new StateGraph(State)
        .addNode("prepare", async () => ({ input: await this.prepare(job) }))
        .addNode("generate", async (state) => ({
          raw: await generate(
            job.provider,
            job.model,
            key,
            state.input,
            signal,
          ),
        }))
        .addNode("validate", (state) => ({
          result: parseResult(
            state.raw,
            job.snapshot,
            state.input.frameIds,
            state.input.screenIds,
          ),
        }))
        .addNode("save", async (state) => {
          signal.throwIfAborted();
          await this.repository.succeed(job, state.result);
          return {};
        })
        .addEdge(START, "prepare")
        .addEdge("prepare", "generate")
        .addEdge("generate", "validate")
        .addEdge("validate", "save")
        .addEdge("save", END)
        .compile();
      await graph.invoke({}, { signal });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : "생성을 완료하지 못했습니다. 기존 시트는 유지됩니다. 입력과 서버 연결을 확인한 뒤 다시 생성해주세요.";
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
