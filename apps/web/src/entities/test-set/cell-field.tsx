import { Checkbox, Select, TextArea, TextField } from "@cheddar/ui";
import { useEffect, useRef, useState } from "react";
import { type CellValue, type Column, cellText, readCell } from "./model";

/** 셀 값 하나를 형식에 맞는 입력으로 고친다. 글자는 칸을 벗어날 때, 그 밖은 고르는 즉시 알린다. */
export function CellField({
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
  const current = readCell(column, value);
  const serverText = cellText(column, value);
  const [text, setText] = useState(serverText);
  // 고치는 중이 아니면 서버 값(예: 나중에 채워진 테스트 ID)을 따른다
  const focused = useRef<string | null>(null);
  useEffect(() => {
    if (focused.current === null) setText(serverText);
  }, [serverText]);
  if (column.type === "checkbox")
    return (
      <Checkbox
        label={column.name}
        checked={current === true}
        disabled={readOnly}
        onCheckedChange={(checked) => onChange(checked)}
      />
    );
  if (column.type === "select")
    return (
      <Select
        label={column.name}
        placeholder="비어 있음"
        disabled={readOnly}
        value={typeof current === "string" ? current : null}
        items={[
          { value: "", label: "비어 있음" },
          ...column.options.map((o) => ({ value: o, label: o })),
        ]}
        onValueChange={(v) => onChange(v || null)}
      />
    );
  if (column.type === "tags") {
    const tags = Array.isArray(current) ? current : [];
    return (
      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-label text-fg">{column.name}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {column.options.map((option) => (
            <Checkbox
              key={option}
              label={option}
              disabled={readOnly}
              checked={tags.includes(option)}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? column.options.filter(
                        (o) => o === option || tags.includes(o),
                      )
                    : tags.filter((t) => t !== option),
                )
              }
            />
          ))}
        </div>
      </fieldset>
    );
  }
  const onFocus = () => {
    focused.current = text;
  };
  // 고친 경우에만 저장한다
  const commit = () => {
    if (focused.current !== null && text !== focused.current) onChange(text);
    // 고치지 않았으면 그사이 바뀐 서버 값(예: 채워진 테스트 ID)을 보여준다
    else setText(serverText);
    focused.current = null;
  };
  if (column.systemKey)
    return (
      <TextField
        label={column.name}
        readOnly={readOnly}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={onFocus}
        onBlur={commit}
      />
    );
  return (
    <TextArea
      label={column.name}
      rows={3}
      readOnly={readOnly}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={onFocus}
      onBlur={commit}
    />
  );
}
