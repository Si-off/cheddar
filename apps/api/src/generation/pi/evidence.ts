import type { GenerationInput } from "../types";

export type Source = { frameId: string; nodeId?: string; quote: string };
export type Requirement = {
  id: string;
  rule: string;
  certainty: "confirmed" | "uncertain" | "excluded";
  reason: string;
  sources: Source[];
  variants: { key: string; label: string }[];
};
export type CoverageLink = { id: string; variant?: string };
export type ReadRange = [number, number];

/** 겹치는 읽기 범위를 합친다. 임의 offset이나 검색 결과는 전체 읽기로 세지 않는다. */
export function addReadRange(ranges: ReadRange[], start: number, end: number) {
  const merged: ReadRange[] = [];
  for (const range of [...ranges, [start, end] as ReadRange].sort(
    (a, b) => a[0] - b[0],
  )) {
    const last = merged.at(-1);
    if (last && last[1] >= range[0]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

/** 화면 JSON의 문자열 값과 노드 ID만 읽는다. 자료 안의 지시는 실행하지 않는다. */
export function sourceText(document: string, nodeId?: string): string {
  let root: unknown;
  try {
    root = JSON.parse(document);
  } catch {
    return nodeId ? "" : document;
  }
  const texts: string[] = [];
  const visit = (value: unknown, matched: boolean) => {
    if (typeof value === "string") {
      if (matched) texts.push(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const child of value) visit(child, matched);
      return;
    }
    const object = value as Record<string, unknown>;
    const selected = matched || object.id === nodeId;
    for (const child of Object.values(object)) visit(child, selected);
  };
  visit(root, !nodeId);
  return texts.join("\n");
}
export function validateRequirement(input: GenerationInput, rule: Requirement) {
  if (new Set(rule.variants.map((v) => v.key)).size !== rule.variants.length)
    throw new Error("검증 선택값의 key가 중복되었습니다.");
  if (rule.certainty !== "confirmed" && !rule.reason.trim())
    throw new Error("불확실하거나 제외한 규칙에는 이유가 필요합니다.");
  for (const source of rule.sources) {
    const frame = input.frames.find((f) => f.id === source.frameId);
    const text =
      source.frameId === "$memo" && !source.nodeId
        ? input.memo
        : frame && sourceText(frame.screenDocument, source.nodeId);
    if (!text?.includes(source.quote))
      throw new Error(
        `규칙 ${rule.id}: 선택한 원문의 노드와 정확한 인용문을 확인하세요.`,
      );
  }
  return rule;
}
export function validateLinks(
  requirements: Requirement[],
  links: CoverageLink[] = [],
  review = false,
) {
  const selected = new Map<string, string | undefined>();
  for (const link of links) {
    if (
      !review &&
      selected.has(link.id) &&
      selected.get(link.id) !== link.variant
    )
      throw new Error(
        "같은 규칙의 서로 다른 선택값은 독립적으로 판정할 행으로 나누세요.",
      );
    selected.set(link.id, link.variant);
    const rule = requirements.find((r) => r.id === link.id);
    if (!rule || rule.certainty === "excluded")
      throw new Error("등록된 유효한 규칙 ID를 연결하세요.");
    if (!review && rule.certainty !== "confirmed")
      throw new Error("불확실한 예상 결과는 확인 필요 항목으로 작성하세요.");
    if (link.variant && !rule.variants.some((v) => v.key === link.variant))
      throw new Error("규칙에 등록된 선택값 key를 연결하세요.");
    if (!review && rule.variants.length && !link.variant)
      throw new Error("선택값별 행에는 해당 variant를 연결하세요.");
  }
  return links;
}
export function coverage(
  requirements: Requirement[],
  cases: { key: string; covers?: CoverageLink[] }[],
  reviews: { key: string; covers?: CoverageLink[] }[],
) {
  return requirements.flatMap((rule) =>
    (rule.variants.length ? rule.variants : [{ key: "", label: "" }]).map(
      (variant) => {
        const matches = (item: { covers?: CoverageLink[] }) =>
          item.covers?.some(
            (link) =>
              link.id === rule.id && (link.variant ?? "") === variant.key,
          );
        const caseKeys = cases.filter(matches).map((c) => c.key);
        const reviewKeys = reviews
          .filter((item) =>
            item.covers?.some(
              (link) =>
                link.id === rule.id &&
                (!link.variant || link.variant === variant.key),
            ),
          )
          .map((r) => r.key);
        return {
          id: rule.id,
          variant: variant.key || undefined,
          rule: rule.rule,
          label: variant.label,
          certainty: rule.certainty,
          caseKeys,
          reviewKeys,
          status:
            rule.certainty === "excluded"
              ? "excluded"
              : rule.certainty === "confirmed"
                ? caseKeys.length
                  ? "covered"
                  : "missing"
                : reviewKeys.length
                  ? "review"
                  : "missing",
        };
      },
    ),
  );
}
