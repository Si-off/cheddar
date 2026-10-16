import type { GenerationResultItemDto } from "@/shared/api/generated";

export type ResultDraft = {
  content: GenerationResultItemDto["content"];
  revision: number;
  question?: { answer: string; useAsRule: boolean; expectedRevision: number };
};
export type ResultDrafts = Record<string, ResultDraft>;
const key = (projectId: string, scenarioId: string) =>
  `cheddar-confirmation-drafts-v2:${projectId}:${scenarioId}`;
export const resultDraftId = (jobId: string, resultId: string) =>
  `${jobId}/${resultId}`;
export function readResultDrafts(
  projectId: string,
  scenarioId: string,
): ResultDrafts {
  const raw = localStorage.getItem(key(projectId, scenarioId));
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error(
      "확인 항목의 초안을 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요.",
    );
  for (const value of Object.values(parsed)) {
    const draft = value as ResultDraft;
    if (
      !draft?.content ||
      ["id", "caseCode", "title"].some(
        (field) =>
          typeof draft.content[field as keyof ResultDraft["content"]] !==
          "string",
      ) ||
      !Array.isArray(draft.content.relatedFrameIds) ||
      !Array.isArray(draft.content.screenIds) ||
      !draft.content.customValues ||
      typeof draft.content.customValues !== "object" ||
      Object.values(draft.content.customValues).some(
        (value) =>
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "boolean" &&
          !(
            Array.isArray(value) &&
            value.every((entry) => typeof entry === "string")
          ),
      ) ||
      (draft.question !== undefined &&
        (typeof draft.question.answer !== "string" ||
          typeof draft.question.useAsRule !== "boolean" ||
          !Number.isInteger(draft.question.expectedRevision) ||
          draft.question.expectedRevision < 0)) ||
      !Number.isInteger(draft.revision) ||
      draft.revision < 1
    )
      throw new Error(
        "확인 항목의 초안을 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요.",
      );
  }
  return parsed as ResultDrafts;
}
export function writeResultDrafts(
  projectId: string,
  scenarioId: string,
  drafts: ResultDrafts,
) {
  const storageKey = key(projectId, scenarioId);
  const raw = JSON.stringify(drafts);
  localStorage.setItem(storageKey, raw);
  if (localStorage.getItem(storageKey) !== raw)
    throw new Error(
      "확인 항목의 초안을 보관하지 못했습니다. 브라우저 저장 공간을 확인해주세요.",
    );
}
