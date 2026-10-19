import { Logger } from "@nestjs/common";
import { validateSchema } from "./output-schema";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  emptyUsage,
  type Usage,
} from "./providers/ai-provider";

const logger = new Logger("GenerationOutput");

export async function validatedOutput(
  provider: AiProvider,
  request: AiRequest,
  validate: (value: unknown) => void = () => {},
  onResponse: (usage: Usage) => Promise<void> = async () => {},
  onRepair: () => Promise<void> = async () => {},
  allowRepair = true,
) {
  const usage = emptyUsage();
  let repair = request.repair;
  for (let call = 0; call < 2; call++) {
    const response = await provider.generate({ ...request, repair });
    for (const k of Object.keys(usage) as (keyof Usage)[])
      usage[k] += response.usage[k];
    await onResponse(response.usage);
    try {
      const value: unknown = JSON.parse(response.text);
      validateSchema(request.schema, value);
      validate(value);
      return { value, usage, repairCount: call };
    } catch (error) {
      // 무엇이 형식에 맞지 않았는지 남긴다. 출력 본문은 남기지 않는다.
      logger.warn(
        JSON.stringify({
          event: "ai_output_invalid",
          stage: request.definition.key,
          model: `${request.model.provider}:${request.model.model}`,
          call: request.repair ? "repair" : call ? "repair" : "first",
          outputChars: response.text.length,
          reason: error instanceof Error ? error.message : String(error),
        }),
      );
      if (call || request.repair || !allowRepair)
        throw new AiFailure("AI_OUTPUT_INVALID", false);
      await onRepair();
      repair = {
        output: response.text,
        error:
          error instanceof Error ? error.message : "출력 형식을 확인하세요.",
      };
    }
  }
  throw new AiFailure("AI_OUTPUT_INVALID", false);
}
