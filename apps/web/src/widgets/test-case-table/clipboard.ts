import {
  type Column,
  displayValue,
  newCase,
  type Snapshot,
  setValue,
  validate,
} from "@/entities/test-case/model";

export type CellPosition = { rowId: string; columnId: string };
export type CellRange = { anchor: CellPosition; focus: CellPosition };
export function bounds(
  range: CellRange,
  rowIds: string[],
  columnIds: string[],
) {
  const a = rowIds.indexOf(range.anchor.rowId),
    b = rowIds.indexOf(range.focus.rowId);
  const c = columnIds.indexOf(range.anchor.columnId),
    d = columnIds.indexOf(range.focus.columnId);
  if (Math.min(a, b, c, d) < 0) return;
  return {
    firstRow: Math.min(a, b),
    lastRow: Math.max(a, b),
    firstColumn: Math.min(c, d),
    lastColumn: Math.max(c, d),
  };
}
function quoted(value: string) {
  return /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
export function copyRange(
  snapshot: Snapshot,
  rowIds: string[],
  columns: Column[],
  range: CellRange,
) {
  const rect = bounds(
    range,
    rowIds,
    columns.map((c) => c.id),
  );
  if (!rect) return "";
  return rowIds
    .slice(rect.firstRow, rect.lastRow + 1)
    .map((id) => {
      const item = snapshot.cases.find((c) => c.id === id);
      return columns
        .slice(rect.firstColumn, rect.lastColumn + 1)
        .map((c) => quoted(item ? displayValue(snapshot, item, c) : ""))
        .join("\t");
    })
    .join("\n");
}
export function parseTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    field = "",
    quoting = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoting) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoting = false;
        closed = true;
      } else field += c;
    } else if (c === '"' && !field && !closed) quoting = true;
    else if (c === "\t") {
      row.push(field);
      field = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      closed = false;
    } else {
      if (closed) throw new Error("붙여넣을 표의 따옴표 구분을 확인해주세요.");
      field += c;
    }
  }
  if (quoting) throw new Error("붙여넣을 표의 따옴표 구분을 확인해주세요.");
  if (field || row.length || !rows.length || closed) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length || rows.some((r) => r.length !== rows[0].length))
    throw new Error("붙여넣을 표의 행마다 열 수가 같아야 합니다.");
  return rows;
}
export function pasteRange(
  snapshot: Snapshot,
  rowIds: string[],
  columns: Column[],
  range: CellRange,
  text: string,
  filtered: boolean,
): Snapshot {
  const rect = bounds(
    range,
    rowIds,
    columns.map((c) => c.id),
  );
  if (!rect) throw new Error("붙여넣을 셀을 선택해주세요.");
  let values = parseTsv(text);
  const selectedRows = rect.lastRow - rect.firstRow + 1,
    selectedColumns = rect.lastColumn - rect.firstColumn + 1;
  if (values.length === 1 && values[0].length === 1)
    values = Array.from(
      { length: selectedRows },
      () => Array(selectedColumns).fill(values[0][0]) as string[],
    );
  else if (
    (selectedRows !== 1 || selectedColumns !== 1) &&
    (selectedRows !== values.length || selectedColumns !== values[0].length)
  )
    throw new Error("선택한 범위와 붙여넣을 표의 크기를 맞춰주세요.");
  if (rect.firstColumn + values[0].length > columns.length)
    throw new Error("붙여넣을 열이 부족합니다. 필요한 열을 먼저 추가해주세요.");
  if (filtered && rect.firstRow + values.length > rowIds.length)
    throw new Error("검색 중에는 보이는 기존 행에만 붙여넣을 수 있습니다.");
  const cases = [...snapshot.cases],
    targetIds = [...rowIds];
  while (targetIds.length < rect.firstRow + values.length) {
    const item = newCase();
    cases.push(item);
    targetIds.push(item.id);
  }
  for (let r = 0; r < values.length; r++) {
    const index = cases.findIndex((c) => c.id === targetIds[rect.firstRow + r]);
    let item = cases[index];
    for (let c = 0; c < values[r].length; c++)
      item = setValue(item, columns[rect.firstColumn + c], values[r][c]);
    cases[index] = item;
  }
  const next = { ...snapshot, cases };
  const error = validate(next);
  if (error) throw new Error(error);
  return next;
}
