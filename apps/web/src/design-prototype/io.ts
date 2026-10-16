import { cellValue, type IAItem, type TestScenario } from "./model";
export function parseDelimited(text: string, separator = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === separator && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
export async function readRows(file: File): Promise<string[][]> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("10 MB 이하의 파일을 선택해 주세요.");
  if (file.name.toLowerCase().endsWith(".csv"))
    return parseDelimited((await file.text()).replace(/^\uFEFF/, ""));
  if (!file.name.toLowerCase().endsWith(".xlsx"))
    throw new Error("XLSX 또는 CSV 파일을 선택해 주세요.");
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const rows: string[][] = [];
  workbook.worksheets[0]?.eachRow((row) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => values.push(cell.text));
    rows.push(values);
  });
  return rows;
}
export async function downloadTestScenario(
  testScenario: TestScenario,
  ia: IAItem[],
) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const page = workbook.addWorksheet("테스트 시나리오");
  const columns = testScenario.columns;
  page.columns = columns.map((c) => ({
    header: c.name,
    key: c.id,
    width: Math.min(60, Math.round(c.width / 8)),
  }));
  for (const item of testScenario.cases)
    page.addRow(columns.map((c) => cellValue(item, c, ia)));
  page.getRow(1).font = { bold: true };
  page.views = [{ state: "frozen", ySplit: 1 }];
  page.eachRow((row) => {
    row.alignment = { vertical: "top", wrapText: true };
  });
  const bytes = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([bytes as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${testScenario.name.replace(/[\\/:*?"<>|]/g, "-") || "테스트"}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
