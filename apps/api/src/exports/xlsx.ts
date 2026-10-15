import ExcelJS from "exceljs";
import { ApiError } from "../common/errors";
import type {
  CaseContentDto,
  SheetColumnDto,
  SheetSnapshotDto,
} from "../contracts/sheets.dto";

const priorities = { high: "높음", medium: "보통", low: "낮음" };
function limit(row: number, column: number, reason: string): never {
  throw new ApiError(
    422,
    "EXPORT_LIMIT_EXCEEDED",
    reason === "rowCount"
      ? "케이스 수가 Excel 한도를 넘었습니다. 시트의 케이스 수를 확인해주세요."
      : reason === "columnCount"
        ? "열 수가 Excel 한도를 넘었습니다. 사용자 열 수를 확인해주세요."
        : "Excel 형식의 한도를 넘어 내보내지 못했습니다. 해당 셀의 내용을 확인해주세요.",
    { row, column, reason },
  );
}
export function displayValue(
  snapshot: SheetSnapshotDto,
  item: CaseContentDto,
  column: SheetColumnDto,
): string {
  if (column.kind === "custom") return item.customValues[column.id] ?? "";
  if (column.field === "priority")
    return item.priority ? priorities[item.priority] : "";
  if (column.field === "relatedFrames") {
    return item.relatedFrameIds
      .map((id) => {
        const frame = snapshot.references.frames.find((f) => f.id === id);
        if (!frame)
          throw new ApiError(
            409,
            "REFERENCE_IN_USE",
            "연결된 프레임을 확인한 뒤 다시 내보내주세요.",
          );
        const duplicate = snapshot.references.frames.some(
          (f) => f.id !== id && f.name === frame.name,
        );
        return duplicate
          ? `${frame.name} (${frame.figmaFileKey}/${frame.figmaNodeId})`
          : frame.name;
      })
      .join("\n");
  }
  if (column.field === "screens")
    return item.screenIds
      .map((id) => {
        const screen = snapshot.references.iaItems.find((i) => i.id === id);
        if (!screen)
          throw new ApiError(
            409,
            "REFERENCE_IN_USE",
            "연결된 IA 화면을 확인한 뒤 다시 내보내주세요.",
          );
        return `${screen.screenId} ${screen.name}`;
      })
      .join("\n");
  const field = column.field;
  return field ? item[field] : "";
}
function checkText(value: string, row: number, column: number) {
  if (value.length > 32767) limit(row, column, "cellCharacters");
  if ((value.match(/\n/g)?.length ?? 0) > 253)
    limit(row, column, "cellLineFeeds");
  // XML 1.0 cannot represent these controls. Reject rather than silently dropping input.
  for (const character of value) {
    const cp = character.codePointAt(0) as number;
    if (
      (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) ||
      (cp >= 0xd800 && cp <= 0xdfff) ||
      cp === 0xfffe ||
      cp === 0xffff
    )
      limit(row, column, "unsupportedCharacter");
  }
}
export async function createXlsx(snapshot: SheetSnapshotDto): Promise<Buffer> {
  if (snapshot.view.length > 16384) limit(1, 16385, "columnCount");
  if (snapshot.cases.length + 1 > 1048576) limit(1048577, 1, "rowCount");
  const columns = snapshot.view.map((v) => {
    const column = snapshot.columns.find((c) => c.id === v.columnId);
    if (!column)
      throw new ApiError(
        409,
        "REVISION_CONFLICT",
        "열 구성이 변경되었습니다. 최신 내용을 확인해주세요.",
      );
    return column;
  });
  const data = [
    columns.map((c) => c.name),
    ...snapshot.cases.map((item) =>
      columns.map((column) => displayValue(snapshot, item, column)),
    ),
  ];
  for (const [r, row] of data.entries())
    for (const [c, text] of row.entries()) checkText(text, r + 1, c + 1);
  const workbook = new ExcelJS.Workbook();
  const name =
    safeName(snapshot.name, "\\/*?:[]", 31).replace(/^'+|'+$/g, "") ||
    "테스트 케이스";
  const worksheet = workbook.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  worksheet.columns = snapshot.view.map((v) => ({
    width: Math.max(1, Math.min(255, Math.round((v.width - 5) / 7))),
  }));
  worksheet.addRows(data);
  worksheet.eachRow((row, index) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.numFmt = "@";
      cell.alignment = { vertical: "top", wrapText: true };
      if (index === 1) cell.font = { bold: true };
    });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
function safeName(value: string, illegal: string, max: number) {
  let result = "";
  for (const character of value) {
    const cp = character.codePointAt(0) as number;
    const clean =
      cp < 32 ||
      cp === 127 ||
      (cp >= 0xd800 && cp <= 0xdfff) ||
      illegal.includes(character)
        ? "_"
        : character;
    if (result.length + clean.length > max) break;
    result += clean;
  }
  return result;
}
export function downloadName(name: string) {
  return `${safeName(name, "\\/", 100) || "test-cases"}.xlsx`;
}
