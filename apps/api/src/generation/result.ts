import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiError } from "../common/errors";
import type { GenerationResultItemDto } from "../contracts/generation.dto";
import {
  type CaseContentDto,
  type TestScenarioColumnDto,
  TestScenarioContentDto,
  type TestScenarioSnapshotDto,
} from "../contracts/test-scenarios.dto";

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
export function createResultSchema(
  frameIds: string[],
  screenIds: string[],
  columns: TestScenarioColumnDto[],
  requirementIds: string[] = [],
) {
  const references = (ids: string[]) => ({
    type: "array",
    items: { type: "string", enum: ids },
  });
  const nonempty = { type: "string", pattern: "\\S" };
  const customProperties = Object.fromEntries(
    columns
      .filter((column) => column.kind === "custom")
      .map((column) => {
        const ids = (column.options ?? []).map((option) => option.id);
        let schema: Record<string, unknown> = { type: "string" };
        if (column.valueType === "checkbox") schema = { type: "boolean" };
        if (column.valueType === "select")
          schema = ids.length
            ? { anyOf: [{ type: "string", enum: ids }, { type: "null" }] }
            : { type: "null" };
        if (column.valueType === "tags")
          schema = {
            type: "array",
            items: ids.length
              ? { type: "string", enum: ids }
              : { type: "string" },
            ...(!ids.length ? { maxItems: 0 } : {}),
          };
        return [
          column.id,
          {
            ...schema,
            description: [column.name, column.description]
              .filter(Boolean)
              .join(": "),
          },
        ];
      }),
  );
  const caseSchema = object({
    ...(requirementIds.length
      ? { requirementIds: references(requirementIds) }
      : {}),
    title: {
      ...nonempty,
      description:
        columns.find((c) => c.field === "title")?.description ?? "테스트 항목",
    },
    ...(frameIds.length ? { relatedFrameIds: references(frameIds) } : {}),
    ...(screenIds.length ? { screenIds: references(screenIds) } : {}),
    customValues: object(customProperties),
  });
  return object({
    cases: { type: "array", items: caseSchema },
    candidates: {
      type: "array",
      items: object({ reason: nonempty, content: caseSchema }),
    },
  });
}
export const invalidResult = (reason = "invalid_structure") =>
  new ApiError(
    422,
    "INVALID_AI_RESULT",
    "생성 결과의 형식이나 화면 연결 정보를 확인하지 못했습니다. 기존 시나리오는 유지됩니다. 입력 확인 후 다시 생성해주세요.",
    { reason },
  );
export type GenerationResult = {
  cases: CaseContentDto[];
  candidates: GenerationResultItemDto[];
  links?: { caseId: string; requirementIds: string[] }[];
  sources?: import("../contracts/analysis.dto").AnalysisItemDto[];
  sourceRevision?: number;
};
export function validateContent(
  snapshot: TestScenarioSnapshotDto,
  cases: CaseContentDto[],
) {
  const input = plainToInstance(TestScenarioContentDto, {
    expectedRevision: snapshot.contentRevision,
    columns: snapshot.columns,
    cases,
  });
  if (
    validateSync(input, { whitelist: true, forbidNonWhitelisted: true }).length
  )
    throw invalidResult("case_fields");
}
export function parseResult(
  raw: string,
  snapshot: TestScenarioSnapshotDto,
  frameIds: string[],
  screenIds: string[],
  requirementIds: string[] = [],
): GenerationResult {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidResult("invalid_json");
  }
  const customColumnIds = snapshot.columns
    .filter((column) => column.kind === "custom")
    .map((column) => column.id);
  function references(
    value: unknown,
    allowed: string[],
    field: string,
  ): string[] {
    if (value === undefined && !allowed.length) return [];
    if (!Array.isArray(value) || value.some((id) => typeof id !== "string"))
      throw invalidResult(field);
    const normalized = [
      ...new Set(value.map((id) => (id as string).trim().toLowerCase())),
    ];
    if (normalized.some((id) => !allowed.includes(id)))
      throw invalidResult(field);
    return normalized;
  }
  if (
    !parsed ||
    !Array.isArray(parsed.cases) ||
    !Array.isArray(parsed.candidates) ||
    Object.keys(parsed).some((k) => !["cases", "candidates"].includes(k))
  )
    throw invalidResult();
  const sourceLinks: { caseId: string; requirementIds: string[] }[] = [];
  function convert(value: Record<string, unknown>): CaseContentDto {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw invalidResult("case_structure");
    const customValues = value.customValues;
    if (
      !customValues ||
      typeof customValues !== "object" ||
      Array.isArray(customValues)
    )
      throw invalidResult("custom_values");
    const keys = Object.keys(customValues);
    if (
      keys.length !== customColumnIds.length ||
      keys.some((id) => !customColumnIds.includes(id))
    )
      throw invalidResult("custom_column_reference");
    const { requirementIds: rawRequirements, ...fields } = value;
    const linkedRequirements = references(
      rawRequirements,
      requirementIds,
      "requirement_reference",
    );
    const content = {
      ...fields,
      id: randomUUID(),
      caseCode: "",
      relatedFrameIds: references(
        value.relatedFrameIds,
        frameIds,
        "frame_reference",
      ),
      screenIds: references(value.screenIds, screenIds, "ia_reference"),
      customValues,
    } as CaseContentDto;
    validateContent(snapshot, [content]);
    if (!content.title.trim()) throw invalidResult("empty_case_text");
    sourceLinks.push({
      caseId: content.id,
      requirementIds: linkedRequirements,
    });
    return content;
  }
  const cases = parsed.cases.map(convert);
  const candidates = parsed.candidates.map(
    (candidate: { reason: string; content: Record<string, unknown> }) => {
      if (
        !candidate ||
        typeof candidate.reason !== "string" ||
        !candidate.reason.trim()
      )
        throw invalidResult("candidate_reason");
      const content = convert(candidate.content);
      return {
        id: content.id,
        status: "pending" as const,
        reason: candidate.reason,
        requirementIds:
          sourceLinks.find((l) => l.caseId === content.id)?.requirementIds ??
          [],
        content,
      };
    },
  );
  if (!cases.length && !candidates.length)
    throw new ApiError(
      422,
      "EMPTY_AI_RESULT",
      "입력에서 테스트 케이스를 만들지 못했습니다. 기존 시나리오는 유지됩니다. 프레임이나 설명을 보완해주세요.",
    );
  return { cases, candidates, links: sourceLinks };
}
