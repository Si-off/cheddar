import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

export type QaReference = {
  name: string;
  sha256: string;
  sheets: {
    name: string;
    rows: { row: number; cells: Record<string, string> }[];
    merges: string[];
  }[];
};

/** 원문과 셀 위치·병합을 보존한다. 수식은 실행하지 않고 저장된 표시값만 읽는다. */
export async function readQaReference(
  bytes: Buffer,
  name: string,
  sheets?: string[],
): Promise<QaReference> {
  if (bytes.length > 10 * 1024 * 1024)
    throw new Error("참고 문서는 10MB 이하여야 합니다.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as never);
  if (sheets?.some((sheet) => !workbook.getWorksheet(sheet)))
    throw new Error("지정한 시트를 찾을 수 없습니다.");
  const selected = workbook.worksheets.filter(
    (sheet) => !sheets?.length || sheets.includes(sheet.name),
  );
  let characters = 0;
  const result: QaReference = {
    name,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sheets: selected.map((sheet) => {
      if (sheet.rowCount > 10000 || sheet.columnCount > 100)
        throw new Error(
          "참고 문서 범위가 큽니다. QA 시트만 별도 파일로 등록하세요.",
        );
      const rows: QaReference["sheets"][number]["rows"] = [];
      sheet.eachRow((row, index) => {
        const cells: Record<string, string> = {};
        row.eachCell((cell) => {
          const value = cell.text;
          if (!value) return;
          characters += value.length;
          if (characters > 2_000_000)
            throw new Error("참고 문서의 텍스트가 너무 큽니다.");
          cells[cell.address] = value;
        });
        rows.push({ row: index, cells });
      });
      return { name: sheet.name, rows, merges: sheet.model.merges ?? [] };
    }),
  };
  if (!result.sheets.some((sheet) => sheet.rows.length))
    throw new Error("읽을 수 있는 QA 예시가 없습니다.");
  return result;
}
