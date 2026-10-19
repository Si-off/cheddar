import type { JsonSchema } from "../types";

// 두 제공자의 공통 부분집합만 전송한다. 원본은 서버 검증에 그대로 사용한다.
// OpenAI의 fine-tuned 모델도 같은 전송 형식으로 지원한다.
export function requestSchema(schema: JsonSchema): JsonSchema {
  const {
    minLength,
    maxLength,
    minItems,
    maxItems,
    uniqueItems,
    minimum,
    properties,
    items,
    anyOf,
    ...supported
  } = schema;
  const constraints = [
    minLength === undefined ? "" : `최소 ${minLength}자`,
    maxLength === undefined ? "" : `최대 ${maxLength}자`,
    minItems === undefined ? "" : `최소 ${minItems}개`,
    maxItems === undefined ? "" : `최대 ${maxItems}개`,
    uniqueItems ? "중복 항목 금지" : "",
    minimum === undefined ? "" : `최솟값 ${minimum}`,
  ].filter(Boolean);
  return {
    ...supported,
    ...(constraints.length
      ? {
          description: [schema.description, ...constraints]
            .filter(Boolean)
            .join(". "),
        }
      : {}),
    ...(properties
      ? {
          properties: Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [
              key,
              requestSchema(value),
            ]),
          ),
        }
      : {}),
    ...(items ? { items: requestSchema(items) } : {}),
    ...(anyOf ? { anyOf: anyOf.map(requestSchema) } : {}),
  };
}
