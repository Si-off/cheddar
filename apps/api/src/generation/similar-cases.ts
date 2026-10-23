import type { CaseDto } from "../contracts/test-set.dto";
import { cellText, withoutCellImages } from "../test-sets/values";
import type { Draft } from "./types";
export function similarCases(
  cases: CaseDto[],
  draft: Draft,
  description: string,
): CaseDto[] {
  const terms = [
    ...new Set(
      `${description} ${Object.values(draft).map(cellText).join(" ")}`
        .split(/[^\p{L}\p{N}]+/u)
        .filter((v) => v.length >= 2),
    ),
  ].slice(0, 80);
  return cases
    .map((item, index) => {
      const text = Object.values(item.values).map(cellText).join(" ");
      return {
        item,
        index,
        score: terms.filter((term) => text.includes(term)).length,
      };
    })
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, 10)
    .map((r) => withoutCellImages(r.item));
}
