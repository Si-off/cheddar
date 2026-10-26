import type { AssistantMessage, ProviderResponse } from "@earendil-works/pi-ai";
import { type CallObservation, normalizeUsage } from "../usage";

export type PiCall = {
  id: string;
  startedAt: number;
  observation?: CallObservation;
};
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const string = (value: unknown) =>
  typeof value === "string" ? value : undefined;

/** 프롬프트·응답 본문·헤더 전체를 보관하지 않고 과금 근거만 수집한다. */
export class PiObservation {
  private requestId?: string;
  private httpStatus?: number;
  private response: Record<string, unknown> = {};
  private raw: Record<string, unknown> | undefined;
  private complete = false;
  constructor(
    private readonly started: number,
    private readonly monotonic = performance.now(),
  ) {}
  headers(response: ProviderResponse) {
    this.httpStatus = response.status;
    this.requestId =
      response.headers["x-request-id"] ?? response.headers["request-id"];
  }
  event(value: unknown) {
    const event = object(value);
    if (
      ["response.completed", "response.incomplete", "response.failed"].includes(
        String(event.type),
      )
    ) {
      this.response = object(event.response);
      this.raw = object(this.response.usage);
      this.complete = this.response.usage != null;
    }
    if (event.type === "message_start") {
      this.response = object(event.message);
      this.raw = object(this.response.usage);
    }
    if (event.type === "message_delta" && event.usage) {
      this.raw = { ...this.raw, ...object(event.usage) };
      this.complete = true;
    }
  }
  finish(
    message: Pick<AssistantMessage, "stopReason"> &
      Partial<Pick<AssistantMessage, "responseId" | "responseModel">>,
  ): CallObservation {
    return {
      finishedAt: new Date(Math.max(this.started, Date.now())),
      durationMs: Math.max(0, Math.round(performance.now() - this.monotonic)),
      status: ["error", "aborted"].includes(message.stopReason)
        ? "failed"
        : "completed",
      requestId: this.requestId,
      responseId: string(this.response.id) ?? message.responseId,
      responseModel: string(this.response.model) ?? message.responseModel,
      serviceTier: string(this.response.service_tier),
      httpStatus: this.httpStatus,
      usage: this.raw
        ? normalizeUsage(
            "cache_creation_input_tokens" in this.raw ||
              "cache_read_input_tokens" in this.raw
              ? "anthropic"
              : "openai",
            this.raw,
          ).raw
        : undefined,
      usageComplete: this.complete,
      errorCode: ["error", "aborted"].includes(message.stopReason)
        ? "AI_AGENT_CALL_FAILED"
        : undefined,
    };
  }
}
