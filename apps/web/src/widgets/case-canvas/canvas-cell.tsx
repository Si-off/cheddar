import { Checkbox, Menu } from "@cheddar/ui";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  CellImageThumb,
  type CellValue,
  type Column,
  cellImage,
  cellText,
  emptyValue,
  OptionChip,
  readCell,
} from "@/entities/test-set";

/**
 * 상세 카드 안의 값 칸. 표의 셀처럼 그 자리에서 고친다.
 * 글자는 칸을 벗어나거나 Enter로 마치고(Shift+Enter는 줄바꿈), Esc로 되돌린다.
 * 선택과 태그는 누르면 목록이 열리고 Delete로 비운다.
 */
export function CanvasCell({
  column,
  value,
  readOnly,
  onChange,
}: {
  column: Column;
  value: CellValue | undefined;
  readOnly?: boolean;
  onChange: (value: CellValue) => void;
}) {
  // 이미지는 카드에서 보기만 한다. 넣고 바꾸기는 표의 셀 도구로 한다.
  const image = cellImage(column, value);
  if (image) return <CellImageThumb imageId={image.image} />;
  if (readOnly)
    return (
      <span className="whitespace-pre-wrap break-words">
        {cellText(column, value)}
      </span>
    );
  if (column.type === "checkbox")
    return (
      <Checkbox
        aria-label={column.name}
        checked={readCell(column, value) === true}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  if (column.type === "select" || column.type === "tags")
    return <OptionCell column={column} value={value} onChange={onChange} />;
  return <TextCell column={column} value={value} onChange={onChange} />;
}

function TextCell({
  column,
  value,
  onChange,
}: {
  column: Column;
  value: CellValue | undefined;
  onChange: (value: CellValue) => void;
}) {
  const saved = cellText(column, value);
  const [text, setText] = useState(saved);
  // 고치기 시작할 때의 값. 고치는 중이 아니면 null이고 다른 사람이 바꾼 값을 따른다.
  const start = useRef<string | null>(null);
  useEffect(() => {
    if (start.current === null) setText(saved);
  }, [saved]);
  // 실제로 고친 경우에만 저장한다. 고치지 않았으면 그사이 바뀐 값을 보여준다.
  const commit = () => {
    if (start.current !== null && text !== start.current) onChange(text);
    else setText(saved);
    start.current = null;
  };
  return (
    <textarea
      aria-label={column.name}
      rows={1}
      value={text}
      onFocus={() => {
        start.current = text;
      }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          const el = e.currentTarget;
          start.current = null;
          setText(saved);
          el.blur();
        }
      }}
      className="field-sizing-content block w-full resize-none border-0 bg-transparent p-0 font-sans text-body-sm text-fg outline-none"
    />
  );
}

function OptionCell({
  column,
  value,
  onChange,
}: {
  column: Column;
  value: CellValue | undefined;
  onChange: (value: CellValue) => void;
}) {
  const current = readCell(column, value);
  const tags = Array.isArray(current) ? current : [];
  const inList = (v: string) => column.options.includes(v);
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== "Delete" && e.key !== "Backspace") return;
    e.preventDefault();
    onChange(emptyValue(column));
  };
  const shown =
    column.type === "tags" ? (
      <span className="flex flex-wrap gap-1">
        {tags.map((t) =>
          inList(t) ? (
            <OptionChip key={t} column={column} option={t} />
          ) : (
            <span key={t}>{t}</span>
          ),
        )}
      </span>
    ) : typeof current === "string" && current ? (
      inList(current) ? (
        <OptionChip column={column} option={current} />
      ) : (
        <span>{current}</span>
      )
    ) : null;
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={`${column.name}: ${cellText(column, value) || "비어 있음"}`}
        onKeyDown={onKeyDown}
        className="flex min-h-5 w-full items-center border-0 bg-transparent p-0 text-left text-body-sm text-fg outline-none"
      >
        {shown}
      </Menu.Trigger>
      <Menu.Popup align="start">
        {column.options.map((option) =>
          column.type === "tags" ? (
            <Menu.CheckboxItem
              key={option}
              checked={tags.includes(option)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [
                        ...column.options.filter(
                          (o) => o === option || tags.includes(o),
                        ),
                        ...tags.filter((t) => !inList(t)),
                      ]
                    : tags.filter((t) => t !== option),
                )
              }
            >
              {option}
            </Menu.CheckboxItem>
          ) : (
            <Menu.CheckboxItem
              key={option}
              closeOnClick
              checked={current === option}
              onCheckedChange={() => onChange(option)}
            >
              {option}
            </Menu.CheckboxItem>
          ),
        )}
      </Menu.Popup>
    </Menu.Root>
  );
}
