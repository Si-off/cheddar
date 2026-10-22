import type { TestSetColumnDto } from "../contracts/test-set.dto";
import {
  normalizeValues,
  validateCell,
  validationFailed,
} from "../test-sets/values";
import { scenarioColumns } from "./scenarios";
import { columnRule, isAiColumn } from "./steps/column-rules";
import type { Draft, GenerationInput, JsonSchema } from "./types";

export const text = (maxLength = 20000): JsonSchema => ({
  type: "string",
  maxLength,
});
export const array = (items: JsonSchema, maxItems = 500): JsonSchema => ({
  type: "array",
  items,
  maxItems,
});
export const object = (properties: Record<string, JsonSchema>): JsonSchema => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function formSchema(columns: TestSetColumnDto[]): JsonSchema {
  return object(
    Object.fromEntries(
      columns.filter(isAiColumn).map((c) => [
        c.id,
        {
          ...(c.type === "text"
            ? text()
            : c.type === "checkbox"
              ? { type: "boolean" }
              : c.type === "select"
                ? { type: ["string", "null"], enum: [...c.options, null] }
                : {
                    type: "array",
                    items: { type: "string", enum: c.options },
                    uniqueItems: true,
                  }),
          description: `${c.name} (${c.type}): ${columnRule(c)}`,
        },
      ]),
    ),
  );
}
const groupKey: JsonSchema = { type: ["string", "null"], maxLength: 100 };
// 시나리오 > 하위 시나리오 > 행. 위쪽 값을 한 번만 쓰게 해 펼친 행끼리 글자가 같고 붙어 있게 한다.
function scenariosSchema(input: GenerationInput, grouped: boolean) {
  const { testCase, title, steps } = scenarioColumns(input.columns);
  const row = formSchema(
    input.columns.filter((c) => c !== testCase && c !== title),
  );
  const step = steps && row.properties?.[steps.id];
  if (step)
    row.properties = {
      ...row.properties,
      [steps.id]: {
        ...step,
        type: ["string", "null"],
        description: `${step.description} 같은 시나리오의 바로 윗행과 절차가 같으면 null.`,
      },
    };
  const label = (column: TestSetColumnDto | undefined, fallback: string) => ({
    ...text(),
    minLength: 1,
    description: column
      ? `${column.name} (${column.type}): ${columnRule(column)}`
      : fallback,
  });
  return array(
    object({
      ...(grouped ? { groupKey } : {}),
      name: label(testCase, "시나리오 이름. 표에는 쓰지 않는다."),
      tasks: {
        ...array(
          object({
            title: label(title, "하위 시나리오 이름. 표에는 쓰지 않는다."),
            rows: { ...array(row), minItems: 1 },
          }),
        ),
        minItems: 1,
      },
    }),
  );
}
function reviewsSchema(input: GenerationInput, grouped: boolean) {
  return array(
    object({
      reason: { ...text(2000), minLength: 1 },
      question: { type: ["string", "null"], maxLength: 2000 },
      screenDescription: text(),
      draft: formSchema(input.columns),
      ...(grouped ? { groupKey } : {}),
    }),
  );
}
export function caseSchema(input: GenerationInput): JsonSchema {
  return object({
    scenarios: scenariosSchema(input, false),
    reviews: reviewsSchema(input, false),
    coverage: array(
      object({
        viewpointId: {
          type: "string",
          enum: input.viewpoints.map((v) => v.id),
        },
        status: { type: "string", enum: ["covered", "not_applicable"] },
        explanation: text(2000),
      }),
    ),
    mergedCount: { type: "integer", minimum: 0 },
  });
}
export function finishSchema(input: GenerationInput): JsonSchema {
  return object({
    ...caseSchema(input).properties,
    scenarios: scenariosSchema(input, true),
    reviews: reviewsSchema(input, true),
  });
}
// 제공자의 구조화 출력과 별개로 같은 제한을 서버에서 다시 검사한다.
export function validateSchema(
  schema: JsonSchema,
  value: unknown,
  path = "$",
): void {
  const fail = (why: string): never => {
    throw new Error(`${path}: ${why}`);
  };
  if (schema.anyOf) {
    if (
      !schema.anyOf.some((s) => {
        try {
          validateSchema(s, value, path);
          return true;
        } catch {
          return false;
        }
      })
    )
      fail("허용된 형식이 아닙니다.");
    return;
  }
  const type =
    value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (
    schema.type &&
    !types.some(
      (t) =>
        t === type ||
        (t === "integer" &&
          typeof value === "number" &&
          Number.isSafeInteger(value)),
    )
  )
    fail("형식을 확인하세요.");
  if (schema.enum && !schema.enum.some((v) => v === value))
    fail("선택 값을 확인하세요.");
  if (
    typeof value === "string" &&
    ((schema.maxLength !== undefined && value.length > schema.maxLength) ||
      (schema.minLength !== undefined && value.length < schema.minLength))
  )
    fail("글자 수를 확인하세요.");
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) ||
      (schema.minimum !== undefined && value < schema.minimum))
  )
    fail("숫자 범위를 확인하세요.");
  if (Array.isArray(value)) {
    if (
      (schema.maxItems !== undefined && value.length > schema.maxItems) ||
      (schema.minItems !== undefined && value.length < schema.minItems) ||
      (schema.uniqueItems &&
        new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
    )
      fail("항목 수나 중복을 확인하세요.");
    if (schema.items)
      for (const [i, v] of value.entries())
        validateSchema(schema.items, v, `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (schema.required?.some((k) => !Object.hasOwn(record, k)))
      fail("필수 항목이 없습니다.");
    for (const [key, v] of Object.entries(record)) {
      const child = schema.properties?.[key];
      if (!child && schema.additionalProperties === false)
        fail("알 수 없는 항목입니다.");
      if (child) validateSchema(child, v, `${path}.${key}`);
    }
  }
}
export function validateDraft(
  columns: TestSetColumnDto[],
  value: unknown,
): Draft {
  const values = normalizeValues(value);
  for (const [id, cell] of Object.entries(values)) {
    const column = columns.find((c) => c.id === id);
    if (!column) return validationFailed("양식의 항목을 확인해주세요.");
    validateCell(column, cell);
  }
  return values;
}
