import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiError } from "../common/errors";
import type { CandidateDto } from "../contracts/generation.dto";
import {
  type CaseContentDto,
  SheetContentDto,
  type SheetSnapshotDto,
} from "../contracts/sheets.dto";

const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const string = { type: "string" };
const strings = { type: "array", items: string };
const caseSchema = object({
  title: string,
  preconditions: string,
  steps: string,
  expectedResult: string,
  priority: { type: ["string", "null"], enum: ["high", "medium", "low", null] },
  relatedFrameIds: strings,
  screenIds: strings,
  customValues: {
    type: "array",
    items: object({ columnId: string, value: string }),
  },
});
export const resultSchema = object({
  cases: { type: "array", items: caseSchema },
  candidates: {
    type: "array",
    items: object({ reason: string, content: caseSchema }),
  },
});
export const invalidResult = () =>
  new ApiError(
    422,
    "INVALID_AI_RESULT",
    "생성 결과의 형식이나 연결된 화면 정보를 확인하지 못했습니다. 기존 시트는 유지됩니다. 입력을 확인한 뒤 다시 생성해주세요.",
  );
export type GenerationResult = {
  cases: CaseContentDto[];
  candidates: CandidateDto[];
};
export function validateContent(
  snapshot: SheetSnapshotDto,
  cases: CaseContentDto[],
) {
  const input = plainToInstance(SheetContentDto, {
    expectedRevision: snapshot.contentRevision,
    columns: snapshot.columns,
    cases,
  });
  if (
    validateSync(input, { whitelist: true, forbidNonWhitelisted: true }).length
  )
    throw invalidResult();
}
export function parseResult(
  raw: string,
  snapshot: SheetSnapshotDto,
  frameIds: string[],
  screenIds: string[],
): GenerationResult {
  const parsed = JSON.parse(raw);
  if (
    !parsed ||
    !Array.isArray(parsed.cases) ||
    !Array.isArray(parsed.candidates) ||
    Object.keys(parsed).some((k) => !["cases", "candidates"].includes(k))
  )
    throw invalidResult();
  function convert(value: Record<string, unknown>): CaseContentDto {
    if (!value || !Array.isArray(value.customValues)) throw invalidResult();
    const entries = value.customValues as { columnId: string; value: string }[];
    if (
      entries.some(
        (e) =>
          !e || typeof e.columnId !== "string" || typeof e.value !== "string",
      ) ||
      new Set(entries.map((e) => e.columnId)).size !== entries.length
    )
      throw invalidResult();
    const content = {
      ...value,
      id: randomUUID(),
      caseCode: "",
      customValues: Object.fromEntries(
        entries.map((e) => [e.columnId, e.value]),
      ),
    } as CaseContentDto;
    validateContent(snapshot, [content]);
    if (
      !content.title.trim() ||
      !content.steps.trim() ||
      !content.expectedResult.trim() ||
      content.relatedFrameIds.some((id) => !frameIds.includes(id)) ||
      content.screenIds.some((id) => !screenIds.includes(id))
    )
      throw invalidResult();
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
        throw invalidResult();
      const content = convert(candidate.content);
      return {
        id: content.id,
        status: "pending" as const,
        reason: candidate.reason,
        content,
      };
    },
  );
  if (!cases.length && !candidates.length)
    throw new ApiError(
      422,
      "EMPTY_AI_RESULT",
      "입력에서 테스트 케이스를 만들지 못했습니다. 기존 시트는 유지됩니다. 프레임이나 설명을 보완해주세요.",
    );
  return { cases, candidates };
}
