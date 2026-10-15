import { Inject, Injectable } from "@nestjs/common";
import type { SheetExportQueryDto } from "../contracts/sheets.dto";
import {
  revisionConflict,
  SheetsRepository,
} from "../sheets/sheets.repository";
import { createXlsx, downloadName } from "./xlsx";

@Injectable()
export class ExportsService {
  constructor(
    @Inject(SheetsRepository) private readonly sheets: SheetsRepository,
  ) {}
  async export(projectId: string, sheetId: string, query: SheetExportQueryDto) {
    const snapshot = await this.sheets.get(
      projectId.toLowerCase(),
      sheetId.toLowerCase(),
    );
    if (
      query.contentRevision !== undefined &&
      query.contentRevision !== snapshot.contentRevision
    )
      throw revisionConflict("content", snapshot.contentRevision);
    if (
      query.viewRevision !== undefined &&
      query.viewRevision !== snapshot.viewRevision
    )
      throw revisionConflict("view", snapshot.viewRevision);
    return {
      filename: downloadName(snapshot.name),
      bytes: await createXlsx(snapshot),
    };
  }
}
