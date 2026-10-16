import { Inject, Injectable } from "@nestjs/common";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  CreateIaItemDto,
  IaItemDto,
  UpdateIaItemDto,
} from "../contracts/ia.dto";
import { IaRepository, type IaRow } from "./ia.repository";

function present(row: IaRow): IaItemDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
function checkRevision(row: IaRow, expected: number) {
  if (row.revision !== expected)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
      { currentRevision: row.revision },
    );
}
function checkParent(
  rows: IaRow[],
  parentId: string | null | undefined,
  itemId?: string,
) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const visited = new Set<string>();
  let current = parentId;
  while (current) {
    if (current === itemId || visited.has(current))
      throw invalid([{ field: "parentId", code: "cycle" }]);
    visited.add(current);
    const parent = byId.get(current);
    if (!parent) throw notFound();
    current = parent.parentId;
  }
}
function checkScreenId(
  rows: IaRow[],
  screenId: string | undefined,
  itemId?: string,
) {
  if (rows.some((row) => row.screenId === screenId && row.id !== itemId)) {
    throw new ApiError(
      409,
      "SCREEN_ID_CONFLICT",
      "화면 ID가 이미 사용 중입니다. 다른 ID를 입력해주세요.",
      { field: "screenId" },
    );
  }
}

@Injectable()
export class IaService {
  constructor(
    @Inject(IaRepository) private readonly repository: IaRepository,
  ) {}

  async list(projectId: string) {
    return { items: (await this.repository.list(projectId)).map(present) };
  }

  async create(projectId: string, input: CreateIaItemDto) {
    if (input.position > 2147483647)
      throw invalid([{ field: "position", code: "max" }]);
    return this.repository.withProjectLock(projectId, async (tx) => {
      const rows = await this.repository.rows(tx, projectId);
      checkParent(rows, input.parentId);
      checkScreenId(rows, input.screenId);
      return present(await this.repository.insert(tx, projectId, input));
    });
  }

  async update(projectId: string, itemId: string, input: UpdateIaItemDto) {
    if (input.position !== undefined && input.position > 2147483647)
      throw invalid([{ field: "position", code: "max" }]);
    if (
      ![
        input.screenId,
        input.name,
        input.description,
        input.parentId,
        input.position,
      ].some((v) => v !== undefined)
    ) {
      throw invalid([{ field: "body", code: "emptyPatch" }]);
    }
    return this.repository.withProjectLock(projectId, async (tx) => {
      const rows = await this.repository.rows(tx, projectId);
      const current = rows.find((row) => row.id === itemId);
      if (!current) throw notFound();
      checkRevision(current, input.expectedRevision);
      checkParent(
        rows,
        input.parentId === undefined ? current.parentId : input.parentId,
        itemId,
      );
      checkScreenId(rows, input.screenId, itemId);
      return present(await this.repository.update(tx, current, input));
    });
  }

  async delete(projectId: string, itemId: string, expectedRevision: number) {
    try {
      await this.repository.withProjectLock(projectId, async (tx) => {
        const rows = await this.repository.rows(tx, projectId);
        const current = rows.find((row) => row.id === itemId);
        if (!current) throw notFound();
        checkRevision(current, expectedRevision);
        const references = await this.repository.references(
          tx,
          projectId,
          itemId,
        );
        if (references.length) throw this.inUse(references);
        await this.repository.delete(tx, projectId, itemId);
      });
    } catch (error) {
      // Restrict FKs remain authoritative if a writer outside this lock protocol adds a reference.
      const cause = error instanceof Error ? error.cause : undefined;
      if (
        cause &&
        typeof cause === "object" &&
        "code" in cause &&
        cause.code === "23503"
      )
        throw this.inUse(["references"]);
      throw error;
    }
  }

  private inUse(references: string[]) {
    return new ApiError(
      409,
      "REFERENCE_IN_USE",
      "항목 연결이 있습니다. 연결 해제 후 삭제해주세요.",
      { references },
    );
  }
}
