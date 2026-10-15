import { Inject, Injectable } from "@nestjs/common";
import { invalid } from "../common/errors";
import type {
  CreateSheetDto,
  SheetContentDto,
  SheetPageQueryDto,
  SheetViewDto,
} from "../contracts/sheets.dto";
import { TemplatesRepository } from "../templates/templates.repository";
import { SheetsRepository } from "./sheets.repository";

function unique(ids: string[], field: string) {
  if (new Set(ids).size !== ids.length)
    throw invalid([{ field, code: "duplicateIdentifier" }]);
}
@Injectable()
export class SheetsService {
  constructor(
    @Inject(SheetsRepository) private readonly repository: SheetsRepository,
    @Inject(TemplatesRepository)
    private readonly templates: TemplatesRepository,
  ) {}
  create(projectId: string, input: CreateSheetDto) {
    return this.repository.create(
      projectId.toLowerCase(),
      { ...input, uploadId: input.uploadId?.toLowerCase() ?? null },
      (tx, id) => this.templates.readSnapshot(tx, id),
    );
  }
  list(projectId: string, query: SheetPageQueryDto) {
    return this.repository.list(projectId.toLowerCase(), {
      ...query,
      uploadId: query.uploadId?.toLowerCase(),
    });
  }
  get(projectId: string, sheetId: string) {
    return this.repository.get(projectId.toLowerCase(), sheetId.toLowerCase());
  }
  updateContent(projectId: string, sheetId: string, input: SheetContentDto) {
    const columns = input.columns.map((c) => ({
      ...c,
      id: c.id.toLowerCase(),
    }));
    const cases = input.cases.map((c) => {
      const keys = Object.keys(c.customValues).map((id) => id.toLowerCase());
      unique(keys, "cases.customValues");
      const next = {
        ...c,
        id: c.id.toLowerCase(),
        customValues: Object.fromEntries(
          Object.entries(c.customValues).map(([id, value]) => [
            id.toLowerCase(),
            value,
          ]),
        ),
        relatedFrameIds: c.relatedFrameIds.map((id) => id.toLowerCase()),
        screenIds: c.screenIds.map((id) => id.toLowerCase()),
      };
      unique(next.relatedFrameIds, "cases.relatedFrameIds");
      unique(next.screenIds, "cases.screenIds");
      return next;
    });
    unique(
      columns.map((c) => c.id),
      "columns",
    );
    unique(
      cases.map((c) => c.id),
      "cases",
    );
    return this.repository.updateContent(
      projectId.toLowerCase(),
      sheetId.toLowerCase(),
      { ...input, columns, cases },
    );
  }
  updateView(projectId: string, sheetId: string, input: SheetViewDto) {
    const columns = input.columns.map((c) => ({
      ...c,
      columnId: c.columnId.toLowerCase(),
    }));
    unique(
      columns.map((c) => c.columnId),
      "columns",
    );
    return this.repository.updateView(
      projectId.toLowerCase(),
      sheetId.toLowerCase(),
      { ...input, columns },
    );
  }
}
