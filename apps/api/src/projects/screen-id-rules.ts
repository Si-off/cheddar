import type { ScreenIdRulePartDto } from "../contracts/project.dto";

type Rule = { separator: string; parts: ScreenIdRulePartDto[] };
const firstValue = (part: ScreenIdRulePartDto) =>
  part.kind === "list"
    ? part.codes[0].code
    : part.kind === "fixed"
      ? part.value
      : "1".padStart(part.digits, "0");
export const example = (rule: Rule) =>
  rule.parts.map(firstValue).join(rule.separator);

const accepts = (part: ScreenIdRulePartDto, value: string) =>
  part.kind === "list"
    ? part.codes.some((item) => item.code === value)
    : part.kind === "fixed"
      ? part.value === value
      : new RegExp(`^[0-9]{${part.digits}}$`).test(value);

function pieces(rule: Rule, screenId: string): string[] | null {
  if (rule.separator) {
    const values = screenId.split(rule.separator);
    return values.length === rule.parts.length &&
      values.every((value, index) => accepts(rule.parts[index], value))
      ? values
      : null;
  }
  // 빈 구분 기호는 각 부분의 허용 값과 번호 길이로 경계를 찾는다.
  const visit = (index: number, rest: string): string[] | null => {
    if (index === rule.parts.length) return rest === "" ? [] : null;
    const part = rule.parts[index];
    const candidates =
      part.kind === "list"
        ? part.codes.map((item) => item.code)
        : part.kind === "fixed"
          ? [part.value]
          : [rest.slice(0, part.digits)];
    for (const value of candidates) {
      if (!rest.startsWith(value) || !accepts(part, value)) continue;
      const tail = visit(index + 1, rest.slice(value.length));
      if (tail) return [value, ...tail];
    }
    return null;
  };
  return visit(0, screenId);
}

export const matches = (rule: Rule, screenId: string) =>
  pieces(rule, screenId) !== null;

export function nextScreenId(
  rule: Rule,
  prefixParts: string[],
  existingIds: string[],
): string | null {
  const index = rule.parts.findIndex((part) => part.kind === "number");
  if (
    index < 0 ||
    prefixParts.length !== index ||
    prefixParts.some((value, i) => !accepts(rule.parts[i], value))
  )
    return null;
  let max = 0;
  for (const id of existingIds) {
    const values = pieces(rule, id);
    if (values && prefixParts.every((value, i) => values[i] === value))
      max = Math.max(max, Number(values[index]));
  }
  const next = String(max + 1);
  if (next.length > rule.parts[index].digits) return null;
  return [
    ...prefixParts,
    next.padStart(rule.parts[index].digits, "0"),
    ...rule.parts.slice(index + 1).map(firstValue),
  ].join(rule.separator);
}
