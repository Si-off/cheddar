import { Inject, Injectable } from "@nestjs/common";
import { ApiError, invalid, notFound } from "../common/errors";
import type { PageQueryDto } from "../contracts/common.dto";
import type {
  CreateProjectDto,
  ProjectDto,
  UpdateProjectDto,
} from "../contracts/projects.dto";
import type { projects } from "../database/schema";
import { ProjectsRepository } from "./projects.repository";

function present(row: typeof projects.$inferSelect): ProjectDto {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
@Injectable()
export class ProjectsService {
  constructor(
    @Inject(ProjectsRepository) private readonly repository: ProjectsRepository,
  ) {}
  async create(input: CreateProjectDto) {
    return present(await this.repository.create(input));
  }
  async get(id: string) {
    const row = await this.repository.get(id);
    if (!row) throw notFound();
    return present(row);
  }
  async list(query: PageQueryDto) {
    const page = await this.repository.list(query);
    return { ...page, items: page.items.map(present) };
  }
  async update(id: string, input: UpdateProjectDto) {
    if (input.name === undefined && input.description === undefined)
      throw invalid([{ field: "body", code: "emptyPatch" }]);
    const updated = await this.repository.update(id, input);
    if (updated) return present(updated);
    const current = await this.get(id);
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
      { currentRevision: current.revision },
    );
  }
}
