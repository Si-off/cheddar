import { Button, Checkbox, Dialog, TextField } from "@workspace/ui";
import { useState } from "react";
import {
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  parseCell,
  type TestCase,
} from "@/entities/test-set";

export interface FindOptions {
  query: string;
  matchCase: boolean;
  /** 셀 내용 전체가 같을 때만 찾는다 */
  wholeCell: boolean;
}

export interface CellRef {
  rowId: string;
  columnId: string;
}

// 글자로 찾고 바꿀 수 있는 열. 체크박스와 서버가 붙이는 테스트 ID는 뺀다.
const searchable = (column: Column) =>
  column.type !== "checkbox" && column.systemKey !== "test_id";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pattern = ({ query, matchCase, wholeCell }: FindOptions) =>
  new RegExp(
    wholeCell ? `^${escapeRegExp(query)}$` : escapeRegExp(query),
    matchCase ? "g" : "gi",
  );

/** 표 순서(행, 열)대로 찾은 셀 */
export function findMatches(
  columns: Column[],
  cases: TestCase[],
  options: FindOptions,
): CellRef[] {
  if (!options.query) return [];
  const re = pattern(options);
  const found: CellRef[] = [];
  for (const row of cases)
    for (const column of columns) {
      if (!searchable(column)) continue;
      re.lastIndex = 0;
      if (re.test(cellText(column, row.values[column.id])))
        found.push({ rowId: row.id, columnId: column.id });
    }
  return found;
}

/** 찾은 셀의 글자를 바꾼 연산. 형식에 맞지 않게 되는 셀은 건너뛴다. */
export function replaceOps(
  columns: Column[],
  cases: TestCase[],
  targets: CellRef[],
  options: FindOptions,
  replacement: string,
): CaseOp[] {
  const re = pattern(options);
  const ops: CaseOp[] = [];
  for (const target of targets) {
    const column = columns.find((c) => c.id === target.columnId);
    const row = cases.find((c) => c.id === target.rowId);
    if (!column || !row) continue;
    const text = cellText(column, row.values[column.id]);
    const next = text.replace(re, () => replacement);
    if (next === text) continue;
    const value: CellValue | undefined = parseCell(column, next);
    if (value === undefined) continue;
    ops.push({
      type: "set_cell",
      caseId: row.id,
      columnId: column.id,
      value,
    });
  }
  return ops;
}

/** 찾기 및 바꾸기. 스프레드시트처럼 찾을 때마다 다음 셀로 옮겨 간다. */
export function FindReplaceDialog({
  open,
  onOpenChange,
  readOnly,
  onFind,
  onReplace,
  onReplaceAll,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly?: boolean;
  /** 다음 셀을 고른다. 없으면 false */
  onFind: (options: FindOptions) => boolean;
  /** 고른 셀이 찾은 셀이면 바꾸고 다음 셀로 간다 */
  onReplace: (options: FindOptions, replacement: string) => void;
  /** 찾은 셀 수와 바꾼 셀 수 */
  onReplaceAll: (
    options: FindOptions,
    replacement: string,
  ) => { found: number; replaced: number };
}) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeCell, setWholeCell] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const options = { query, matchCase, wholeCell };
  const find = () => setResult(onFind(options) ? null : "찾는 내용이 없습니다");
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title="찾기 및 바꾸기" />
        <Dialog.Body>
          <TextField
            label="찾기"
            value={query}
            autoFocus
            onChange={(e) => {
              setQuery(e.target.value);
              setResult(null);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              find();
            }}
          />
          {!readOnly && (
            <TextField
              label="바꾸기"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
            />
          )}
          <div className="flex flex-col gap-2">
            <Checkbox
              label="대소문자 구분"
              checked={matchCase}
              onCheckedChange={(checked) => {
                setMatchCase(checked);
                setResult(null);
              }}
            />
            <Checkbox
              label="전체 셀 내용 일치"
              checked={wholeCell}
              onCheckedChange={(checked) => {
                setWholeCell(checked);
                setResult(null);
              }}
            />
          </div>
          {result && (
            <p role="status" className="m-0 text-body-sm text-fg-muted">
              {result}
            </p>
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="ghost" disabled={!query} onClick={find}>
            찾기
          </Button>
          {!readOnly && (
            <>
              <Button
                variant="ghost"
                disabled={!query}
                onClick={() => onReplace(options, replacement)}
              >
                바꾸기
              </Button>
              <Button
                variant="ghost"
                disabled={!query}
                onClick={() => {
                  const { found, replaced } = onReplaceAll(
                    options,
                    replacement,
                  );
                  setResult(
                    found > 0
                      ? `${replaced}개를 바꿨습니다`
                      : "찾는 내용이 없습니다",
                  );
                }}
              >
                모두 바꾸기
              </Button>
            </>
          )}
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            완료
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
