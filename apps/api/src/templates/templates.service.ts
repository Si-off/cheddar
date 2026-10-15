import { Inject, Injectable } from "@nestjs/common";
import { ApiError, invalid } from "../common/errors";
import type { UpdateTemplateDto } from "../contracts/ia.dto";
import { TemplatesRepository } from "./templates.repository";

@Injectable()
export class TemplatesService {
  constructor(
    @Inject(TemplatesRepository)
    private readonly repository: TemplatesRepository,
  ) {}

  get(projectId: string) {
    return this.repository.get(projectId);
  }

  async update(projectId: string, input: UpdateTemplateDto) {
    return this.repository.withProjectLock(projectId, async (tx) => {
      const current = await this.repository.readSnapshot(tx, projectId);
      if (current.revision !== input.expectedRevision)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
          { currentRevision: current.revision },
        );
      for (const original of current.columns) {
        const next = input.columns.find((column) => column.id === original.id);
        if (
          original.kind === "system"
            ? next?.kind !== "system" || next.field !== original.field
            : next &&
              (next.kind !== "custom" || next.valueType !== original.valueType)
        ) {
          throw invalid([
            { field: "columns", code: "immutableColumnIdentity" },
          ]);
        }
      }
      // A system field cannot be removed and recreated with another UUID.
      if (
        input.columns.some(
          (column) =>
            column.kind === "system" &&
            !current.columns.some((original) => original.id === column.id),
        )
      ) {
        throw invalid([{ field: "columns", code: "immutableColumnIdentity" }]);
      }
      if (input.columns.some((column) => !column.name.trim()))
        throw invalid([{ field: "columns", code: "blankName" }]);
      return this.repository.update(tx, projectId, input);
    });
  }
}
