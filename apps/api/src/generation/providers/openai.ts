import { Logger } from "@nestjs/common";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "../steps";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  type AiResponse,
  failureLog,
  requestData,
  stableInstructions,
} from "./ai-provider";
import { requestSchema } from "./request-schema";

const logger = new Logger("OpenAIProvider");
export class OpenAiProvider implements AiProvider {
  constructor(private readonly client?: OpenAI) {}
  async generate(r: AiRequest): Promise<AiResponse> {
    const deadline = AbortSignal.timeout(r.definition.timeoutMs);
    try {
      const client = this.client ?? new OpenAI({ maxRetries: 0 });
      const response = await client.responses.create(
        {
          model: r.model.model,
          instructions: `${SYSTEM_PROMPT}\n${r.definition.prompt}\n${stableInstructions(r)}`,
          input: [
            {
              role: "user",
              content: [
                ...r.images.map((image) => ({
                  type: "input_image" as const,
                  image_url: `data:${image.mediaType};base64,${image.data}`,
                  detail: "auto" as const,
                })),
                { type: "input_text", text: requestData(r) },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: `cheddar_${r.definition.key}`,
              strict: true,
              schema: requestSchema(r.schema) as Record<string, unknown>,
            },
          },
          max_output_tokens: r.definition.maxTokens,
          store: false,
        },
        {
          timeout: r.definition.timeoutMs,
          signal: AbortSignal.any([deadline, ...(r.signal ? [r.signal] : [])]),
        },
      );
      const cacheReadTokens =
        response.usage?.input_tokens_details.cached_tokens ?? 0;
      const usage = {
        inputTokens: (response.usage?.input_tokens ?? 0) - cacheReadTokens,
        outputTokens: response.usage?.output_tokens ?? 0,
        cacheReadTokens,
        cacheCreationTokens: 0,
      };
      if (
        response.output.some(
          (item) =>
            item.type === "message" &&
            item.content.some((c) => c.type === "refusal"),
        )
      )
        throw new AiFailure("AI_REFUSAL", false, usage);
      if (response.status === "incomplete")
        throw new AiFailure(
          "AI_INCOMPLETE",
          response.incomplete_details?.reason === "max_output_tokens",
          usage,
        );
      if (response.status !== "completed")
        throw new AiFailure("AI_STOPPED", false, usage);
      return { text: response.output_text, usage };
    } catch (error) {
      if (r.signal?.aborted) throw new AiFailure("AI_ABORTED", false);
      if (deadline.aborted) throw new AiFailure("AI_TIMEOUT", true);
      if (error instanceof AiFailure) throw error;
      logger.warn(
        error instanceof OpenAI.APIError
          ? failureLog(error.status, error.message)
          : failureLog(undefined, String(error)),
      );
      if (
        error instanceof OpenAI.RateLimitError ||
        error instanceof OpenAI.APIConnectionError ||
        (error instanceof OpenAI.APIError && (error.status ?? 0) >= 500)
      )
        throw new AiFailure("AI_UNAVAILABLE", true);
      throw new AiFailure("AI_REQUEST_FAILED", false);
    }
  }
}
