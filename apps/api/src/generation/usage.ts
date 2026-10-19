export type AiProvider = "anthropic" | "openai";
export type NumericUsage = { [key: string]: number | NumericUsage };
export type CallObservation = {
  finishedAt: Date;
  durationMs: number;
  status: "completed" | "failed";
  requestId?: string;
  responseId?: string;
  responseModel?: string;
  serviceTier?: string;
  usage?: unknown;
  usageComplete?: boolean;
  httpStatus?: number;
  errorCode?: string;
};
export type CallHooks = {
  onStart(): Promise<void>;
  onFinish(observation: CallObservation): Promise<void>;
};

const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const count = (value: unknown) =>
  Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : null;

// Store only documented numeric fields. No arbitrary response text or keys.
export function normalizeUsage(provider: AiProvider, value: unknown) {
  const source = object(value);
  const raw: NumericUsage = {};
  const fields =
    provider === "openai"
      ? ["input_tokens", "output_tokens", "total_tokens"]
      : [
          "input_tokens",
          "output_tokens",
          "cache_read_input_tokens",
          "cache_creation_input_tokens",
        ];
  for (const name of fields) {
    const number = count(source[name]);
    if (number !== null) raw[name] = number;
  }
  const nested =
    provider === "openai"
      ? {
          input_tokens_details: ["cached_tokens", "cache_write_tokens"],
          output_tokens_details: ["reasoning_tokens"],
        }
      : {
          cache_creation: [
            "ephemeral_5m_input_tokens",
            "ephemeral_1h_input_tokens",
          ],
        };
  for (const [name, names] of Object.entries(nested)) {
    const detail: NumericUsage = {};
    for (const field of names) {
      const number = count(object(source[name])[field]);
      if (number !== null) detail[field] = number;
    }
    if (Object.keys(detail).length) raw[name] = detail;
  }
  const input = count(source.input_tokens);
  const output = count(source.output_tokens);
  const optionalZero = input !== null && output !== null ? 0 : undefined;
  const details = object(source.input_tokens_details);
  const cached = count(
    provider === "openai"
      ? (details.cached_tokens ?? optionalZero)
      : (source.cache_read_input_tokens ?? optionalZero),
  );
  const written = count(
    provider === "openai"
      ? (details.cache_write_tokens ?? optionalZero)
      : (source.cache_creation_input_tokens ?? optionalZero),
  );
  const writes = object(source.cache_creation);
  const write5m = count(writes.ephemeral_5m_input_tokens ?? 0);
  const write1h = count(writes.ephemeral_1h_input_tokens ?? 0);
  const valid =
    input !== null &&
    output !== null &&
    cached !== null &&
    written !== null &&
    (provider !== "openai" || cached + written <= input) &&
    (provider !== "anthropic" ||
      (write5m !== null &&
        write1h !== null &&
        (!Object.keys(writes).length || write5m + write1h === written)));
  const inputTotal = valid
    ? provider === "openai"
      ? input
      : input + cached + written
    : null;
  return {
    raw,
    known: valid && Number.isSafeInteger(inputTotal),
    inputTokens:
      inputTotal !== null && Number.isSafeInteger(inputTotal)
        ? inputTotal
        : null,
    outputTokens: output,
    cachedInputTokens: cached,
    cacheWriteTokens: written,
    reasoningTokens:
      provider === "openai"
        ? count(object(source.output_tokens_details).reasoning_tokens)
        : null,
    write1hTokens: write1h,
  };
}

export type NormalizedUsage = ReturnType<typeof normalizeUsage>;
// Convert decimal cents/dollars exactly; never multiply money using float arithmetic.
export function money(value: unknown, cents = false): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value));
  if (!match) throw new Error("Invalid cost amount");
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const decimals = Math.max(12, fraction.length - exponent + (cents ? 2 : 0));
  const shift = decimals + exponent - fraction.length - (cents ? 2 : 0);
  if (
    !Number.isSafeInteger(shift) ||
    shift > 100 ||
    decimals > 100 ||
    match[2].length + fraction.length > 100
  )
    throw new Error("Invalid cost precision");
  const digits = BigInt(match[2] + fraction);
  const amount = digits * 10n ** BigInt(shift);
  const scale = 10n ** BigInt(decimals);
  return `${match[1]}${amount / scale}.${String(amount % scale).padStart(decimals, "0")}`;
}
