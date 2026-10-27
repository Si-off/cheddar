import { Badge, Icon, type Tone } from "@workspace/ui";
import { ChevronDown } from "lucide-react";
import { type Column, type OptionColor, optionColor } from "./model";

/** 항목 색을 칩 색으로 옮긴다. XLSX의 조건부 서식 색도 같은 토큰 값을 쓴다. */
export const optionTone: Record<OptionColor, Tone> = {
  gray: "neutral",
  red: "danger",
  yellow: "warning",
  green: "success",
  teal: "figma",
  blue: "info",
  purple: "accent",
};

/** 선택과 태그 값의 칩. caret이면 스프레드시트 드롭다운 칩처럼 ▾를 붙여 눌러서 고를 수 있음을 보인다. */
export function OptionChip({
  column,
  option,
  caret,
}: {
  column: Pick<Column, "colors">;
  option: string;
  caret?: boolean;
}) {
  return (
    <Badge tone={optionTone[optionColor(column, option)]}>
      {option}
      {caret && <Icon icon={ChevronDown} size="sm" className="-mr-0.5" />}
    </Badge>
  );
}
