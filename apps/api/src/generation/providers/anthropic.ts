import Anthropic from "@anthropic-ai/sdk";
import { Logger } from "@nestjs/common";
import { SYSTEM_PROMPT } from "../steps";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  failureLog,
  type ProviderObservation,
  requestData,
  stableInstructions,
} from "./ai-provider";
import { requestSchema } from "./request-schema";

const logger = new Logger("AnthropicProvider");

export class AnthropicProvider implements AiProvider {
  constructor(private readonly client?: Anthropic) {}
  async generate(r: AiRequest): Promise<AiResponse> {
    const deadline = AbortSignal.timeout(r.definition.timeoutMs);
    // SDK 자동 재시도를 끄고 단계 실행기의 영속 시도 횟수만 사용한다.
    let observation: ProviderObservation | undefined;
    let stream: ReturnType<Anthropic["messages"]["stream"]> | undefined;
    let observedUsage: AiResponse["usage"] | undefined;
    let finalUsageReceived = false;
    try {
      const client = this.client ?? new Anthropic({ maxRetries: 0 });
      stream = client.messages.stream(
        {
          model: r.model.model,
          max_tokens: r.definition.maxTokens,
          system: [
            {
              type: "text",
              text: `${SYSTEM_PROMPT}\n${r.definition.prompt}`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: stableInstructions(r),
              cache_control: { type: "ephemeral" },
            },
          ],
          output_config: {
            ...(r.model.effort === "default" ? {} : { effort: r.model.effort }),
            format: {
              type: "json_schema",
              schema: requestSchema(r.schema) as Record<string, unknown>,
            },
          },
          messages: [
            {
              role: "user",
              content: [
                ...r.images.map((image) => ({
                  type: "image" as const,
                  source: {
                    type: "base64" as const,
                    media_type: image.mediaType,
                    data: image.data,
                  },
                })),
                { type: "text", text: requestData(r) },
              ],
            },
          ],
        },
        {
          timeout: r.definition.timeoutMs,
          signal: AbortSignal.any([deadline, ...(r.signal ? [r.signal] : [])]),
        },
      );
      stream.on("streamEvent", (event: Anthropic.MessageStreamEvent) => {
        if (event.type === "message_delta") finalUsageReceived = true;
      });
      const response: Anthropic.Message = await stream.finalMessage();
      observation = {
        usage: response.usage,
        usageComplete: finalUsageReceived,
        responseId: response.id,
        responseModel: response.model,
        requestId: stream.request_id ?? undefined,
        serviceTier: response.usage.service_tier ?? undefined,
        httpStatus: 200,
      };
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      };
      observedUsage = usage;
      if (response.stop_reason === "refusal")
        throw new AiFailure("AI_REFUSAL", false, usage, observation);
      if (response.stop_reason === "max_tokens")
        throw new AiFailure("AI_MAX_TOKENS", true, usage, observation);
      if (response.stop_reason !== "end_turn")
        throw new AiFailure("AI_STOPPED", false, usage, observation);
      return {
        text: response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
        usage,
        observation,
      };
    } catch (error) {
      if (!observation && stream?.currentMessage) {
        const partial = stream.currentMessage;
        observation = {
          usage: partial.usage,
          usageComplete: finalUsageReceived,
          responseId: partial.id,
          responseModel: partial.model,
          requestId: stream.request_id ?? undefined,
          serviceTier: partial.usage.service_tier ?? undefined,
          httpStatus: 200,
        };
      }
      if (r.signal?.aborted)
        throw new AiFailure("AI_ABORTED", false, observedUsage, observation);
      if (deadline.aborted)
        throw new AiFailure("AI_TIMEOUT", true, observedUsage, observation);
      if (error instanceof AiFailure) throw error;
      if (error instanceof Anthropic.APIError)
        observation = {
          ...observation,
          requestId: error.requestID ?? undefined,
          httpStatus: error.status,
        };
      logger.warn(
        error instanceof Anthropic.APIError
          ? failureLog(error.status, error.message)
          : failureLog(undefined, String(error)),
      );
      if (
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.APIConnectionError ||
        (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500)
      )
        throw new AiFailure("AI_UNAVAILABLE", true, observedUsage, observation);
      throw new AiFailure(
        "AI_REQUEST_FAILED",
        false,
        observedUsage,
        observation,
      );
    }
  }
}
