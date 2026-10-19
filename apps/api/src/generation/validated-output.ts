import { validateSchema } from "./output-schema";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
  emptyUsage,
  type Usage,
} from "./providers/ai-provider";
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
