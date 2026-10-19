import {
  Button,
  Checkbox,
  Dialog,
  Select,
  TextArea,
  TextField,
} from "@cheddar/ui";
import { useEffect, useRef, useState } from "react";
import {
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  readCell,
  type TestCase,
} from "@/entities/test-set";

export interface CaseDialogProps {
  columns: Column[];
  /** 없으면 닫힌다 */
  testCase: TestCase | null;
  readOnly?: boolean;
  onOps: (ops: CaseOp[]) => void;
  onClose: () => void;
}

/** 케이스 하나의 모든 항목. 글자는 칸을 벗어날 때, 그 밖은 고르는 즉시 저장한다. */
export function CaseDialog({
  columns,
  testCase,
  readOnly,
  onOps,
  onClose,
}: CaseDialogProps) {
  return (
    <Dialog.Root
      open={testCase !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Content size="lg">
        {testCase && (
          <CaseFields
            key={testCase.id}
            columns={columns}
            testCase={testCase}
            readOnly={readOnly}
            onOps={onOps}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function CaseFields({
  columns,
  testCase,
  readOnly,
  onOps,
}: {
  columns: Column[];
  testCase: TestCase;
  readOnly?: boolean;
  onOps: (ops: CaseOp[]) => void;
}) {
  const idColumn = columns.find((c) => c.systemKey === "test_id");
  const set = (column: Column, value: CellValue) =>
    onOps([
      { type: "set_cell", caseId: testCase.id, columnId: column.id, value },
    ]);
  return (
    <>
      <Dialog.Header
        title={
          idColumn
            ? cellText(idColumn, testCase.values[idColumn.id]) || "케이스"
            : "케이스"
        }
      />
      <Dialog.Body>
        {columns.map((column) => (
          <Field
            key={column.id}
            column={column}
            value={testCase.values[column.id]}
            readOnly={readOnly}
            onChange={(value) => set(column, value)}
          />
        ))}
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="primary" />}>완료</Dialog.Close>
      </Dialog.Footer>
    </>
  );
}

function Field({
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
