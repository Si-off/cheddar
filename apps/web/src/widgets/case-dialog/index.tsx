import { Button, Dialog } from "@workspace/ui";
import {
  type CaseOp,
  CellField,
  type CellValue,
  type Column,
  cellText,
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
          <CellField
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
