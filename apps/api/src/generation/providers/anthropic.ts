import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT } from "../steps";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  requestData,
  stableInstructions,
} from "./ai-provider";
import { requestSchema } from "./request-schema";

export class AnthropicProvider implements AiProvider {
  constructor(private readonly client?: Anthropic) {}
  async generate(r: AiRequest): Promise<AiResponse> {
    const deadline = AbortSignal.timeout(r.definition.timeoutMs);
    // SDK 자동 재시도를 끄고 단계 실행기의 영속 시도 횟수만 사용한다.
    try {
      const client = this.client ?? new Anthropic({ maxRetries: 0 });
      const response = await client.messages
        .stream(
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
              effort: r.definition.effort,
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
            signal: AbortSignal.any([
              deadline,
              ...(r.signal ? [r.signal] : []),
            ]),
          },
        )
        .finalMessage();
      const usage = {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      };
      if (response.stop_reason === "refusal")
        throw new AiFailure("AI_REFUSAL", false, usage);
      if (response.stop_reason === "max_tokens")
        throw new AiFailure("AI_MAX_TOKENS", true, usage);
      if (response.stop_reason !== "end_turn")
        throw new AiFailure("AI_STOPPED", false, usage);
      return {
        text: response.content
          .filter((c) => c.type === "text")
          .map((c) => c.text)
          .join(""),
        usage,
      };
    } catch (error) {
      if (r.signal?.aborted) throw new AiFailure("AI_ABORTED", false);
      if (deadline.aborted) throw new AiFailure("AI_TIMEOUT", true);
      if (error instanceof AiFailure) throw error;
      if (
        error instanceof Anthropic.RateLimitError ||
        error instanceof Anthropic.APIConnectionError ||
        (error instanceof Anthropic.APIError && (error.status ?? 0) >= 500)
      )
        throw new AiFailure("AI_UNAVAILABLE", true);
      throw new AiFailure("AI_REQUEST_FAILED", false);
    }
  }
}
