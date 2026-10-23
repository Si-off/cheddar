import ExcelJS from "exceljs";

export type SourceSheet = { file: string; name: string; rows: string[][] };
export type SourceImage = {
  file: string;
  mediaType: "image/png" | "image/jpeg";
  data: string;
};
export type Sources = {
  sheets: SourceSheet[];
  texts: { file: string; body: string }[];
  images: SourceImage[];
  /** 읽지 못한 파일 이름 */
  unread: string[];
};
export type UploadedSource = { originalname: string; buffer: Buffer };

export const MAX_SOURCE_FILES = 10;
export const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
/** 한 요청의 파일 합계. 이미지는 base64로 한 번 더 메모리에 올라간다. */
export const MAX_SOURCE_TOTAL_BYTES = 30 * 1024 * 1024;
export const MAX_SOURCE_IMAGES = 8;
const MAX_SHEET_ROWS = 5000;
const MAX_TEXT_CHARS = 60000;

// 셀 값은 서식 있는 글자, 링크, 수식 결과가 섞여 있어 글자만 꺼낸다.
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== "object") return String(value);
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("formula" in value || "sharedFormula" in value)
    return cellText((value as { result?: ExcelJS.CellValue }).result ?? null);
  if ("text" in value) return cellText(value.text as ExcelJS.CellValue);
  if ("error" in value) return "";
  return "";
}

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

async function readWorkbook(file: UploadedSource): Promise<SourceSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    file.buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook.worksheets
    .filter((sheet) => sheet.state === "visible")
    .map((sheet) => {
      const rows: string[][] = [];
      sheet.eachRow({ includeEmpty: true }, (row, index) => {
        if (index > MAX_SHEET_ROWS) return;
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, col) => {
          cells[col - 1] = clean(cellText(cell.value));
        });
        rows[index - 1] = Array.from(cells, (c) => c ?? "");
      });
      return {
        file: file.originalname,
        name: sheet.name,
        rows: Array.from(rows, (r) => r ?? []),
      };
    })
    .filter((sheet) => sheet.rows.some((r) => r.some(Boolean)));
}

// 따옴표 안의 쉼표와 줄바꿈을 지키는 CSV 읽기.
function readCsv(body: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(clean(cell));
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && body[i + 1] === "\n") i++;
      row.push(clean(cell));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) rows.push([...row, clean(cell)]);
  return rows.slice(0, MAX_SHEET_ROWS);
}

const extension = (name: string) =>
  name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

/** 붙여 넣은 글자와 올린 파일을 표, 글, 이미지로 나눈다. 읽지 못한 파일은 건너뛰고 이름만 남긴다. */
export async function readSources(
  text: string,
  files: UploadedSource[],
): Promise<Sources> {
  const sources: Sources = { sheets: [], texts: [], images: [], unread: [] };
  if (text.trim())
    sources.texts.push({ file: "", body: text.slice(0, MAX_TEXT_CHARS) });
  for (const file of files) {
    const name = file.originalname;
    const ext = extension(name);
    try {
      if (ext === "xlsx") sources.sheets.push(...(await readWorkbook(file)));
      else if (ext === "csv" || ext === "tsv")
        sources.sheets.push({
          file: name,
          name,
          rows: readCsv(
            file.buffer.toString("utf8").replace(/^﻿/, ""),
            ext === "csv" ? "," : "\t",
          ),
        });
      else if (ext === "txt" || ext === "md")
        sources.texts.push({
          file: name,
          body: file.buffer.toString("utf8").slice(0, MAX_TEXT_CHARS),
        });
      else if (
        (ext === "png" || ext === "jpg" || ext === "jpeg") &&
        sources.images.length < MAX_SOURCE_IMAGES
      )
        sources.images.push({
          file: name,
          mediaType: ext === "png" ? "image/png" : "image/jpeg",
          data: file.buffer.toString("base64"),
        });
      else sources.unread.push(name);
    } catch {
      sources.unread.push(name);
    }
  }
  return sources;
}

/** 시트를 열 번호가 붙은 줄로 바꾼다. AI에 보낼 때만 쓴다. */
export const sheetLines = (rows: string[][], from = 0, count = rows.length) =>
  rows
    .slice(from, from + count)
    .map((row, i) => {
      const cells = row
        .map((value, col) => (value ? `${col + 1}:${value.slice(0, 80)}` : ""))
        .filter(Boolean);
      return cells.length ? `${from + i + 1}| ${cells.join(" | ")}` : "";
    })
    .filter(Boolean)
    .join("\n");
