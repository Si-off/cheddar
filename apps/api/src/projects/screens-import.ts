import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import { ApiError } from "../common/errors";
import type { ScreenDto } from "../contracts/project.dto";

export async function readScreens(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      "XLSX 파일을 읽을 수 없습니다.",
    );
  }
  const sheet = workbook.worksheets[0];
  const keys = [
    "screen id",
    "type",
    "module",
    "1depth",
    "2depth",
    "3depth",
    "4depth",
    "5depth",
    "note",
  ];
  let header = 0;
  const columns = new Map<string, number>();
  sheet?.eachRow((row, index) => {
    if (header) return;
    const found = new Map<string, number>();
    row.eachCell((cell, col) => {
      const text = cell.text.trim().toLowerCase();
      const key = text.startsWith("screen id") ? "screen id" : text;
      if (keys.includes(key) && !found.has(key)) found.set(key, col);
    });
    if (keys.every((key) => found.has(key))) {
      header = index;
      for (const [key, col] of found) columns.set(key, col);
    }
  });
  if (!sheet || !header)
    throw new ApiError(
      400,
      "IMPORT_HEADER_NOT_FOUND",
      "IA 머리글을 찾을 수 없습니다.",
    );
  const rows: {
    id: string;
    screenId: string;
    name: string;
    parentName: string;
    depth: number;
    type: ScreenDto["type"];
    description: string;
  }[] = [];
  let skipped = 0;
  for (let index = header + 1; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index);
    const value = (key: string) =>
      row.getCell(columns.get(key) as number).text.trim();
    const screenId = value("screen id");
    if (!screenId) {
      skipped++;
      continue;
    }
    const depths = [1, 2, 3, 4, 5].map((n) => value(`${n}depth`));
    let depth = 0;
    depths.forEach((value, i) => {
      if (value) depth = i + 1;
    });
    const name = depth ? depths[depth - 1] : value("module");
    const description = value("note");
    const typeValue = value("type").toLowerCase();
    const type: ScreenDto["type"] = ["pop-up", "popup"].includes(typeValue)
      ? "popup"
      : ["bottom sheet", "bt"].includes(typeValue)
        ? "bottom_sheet"
        : typeValue === "tab"
          ? "tab"
          : "page";
    rows.push({
      id: randomUUID(),
      screenId,
      name,
      depth,
      parentName: depth > 1 ? depths[depth - 2] : "",
      type,
      description,
    });
  }
  return { rows, skipped };
}
