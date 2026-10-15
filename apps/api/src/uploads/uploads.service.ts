import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, invalid, notFound } from "../common/errors";
import type { PageQueryDto } from "../contracts/common.dto";
import type {
  CreateUploadDto,
  UploadDto,
  UploadPageDto,
} from "../contracts/uploads.dto";
import type { uploadFrames, uploads } from "../database/schema";
import { ProjectsService } from "../projects/projects.service";
import { UploadsRepository } from "./uploads.repository";

function present(
  row: typeof uploads.$inferSelect,
  frames: (typeof uploadFrames.$inferSelect)[],
): UploadDto {
  if (!frames.length) throw new Error("Incomplete upload.");
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    frames: frames.map(
      ({
        id,
        figmaFileKey,
        figmaNodeId,
        name,
        width,
        height,
        imageFileId,
        dataFileId,
      }) => ({
        id,
        figmaFileKey,
        figmaNodeId,
        name,
        width,
        height,
        imageFileId,
        dataFileId,
      }),
    ),
  };
}

@Injectable()
export class UploadsService {
  constructor(
    @Inject(UploadsRepository) private readonly repository: UploadsRepository,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
  ) {}

  async create(projectId: string, input: CreateUploadDto) {
    await this.projects.get(projectId);
    if (!input.frames.length)
      throw invalid([{ field: "frames", code: "emptyFrames" }]);
    // Keep only contract fields in a fixed order. UUID spelling and surrounding
    // bundle-name whitespace must not change the meaning of an idempotent retry.
    const normalized: CreateUploadDto = {
      clientRequestId: input.clientRequestId.toLowerCase(),
      name: input.name.trim(),
      frames: input.frames.map((frame) => ({
        figmaFileKey: frame.figmaFileKey,
        figmaNodeId: frame.figmaNodeId,
        name: frame.name,
        width: frame.width,
        height: frame.height,
        imageFileId: frame.imageFileId.toLowerCase(),
        dataFileId: frame.dataFileId.toLowerCase(),
      })),
    };
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({ name: normalized.name, frames: normalized.frames }),
      )
      .digest("hex");
    const result = await this.repository.create(
      projectId,
      normalized,
      requestHash,
    );
    if (result.row.requestHash !== requestHash)
      throw new ApiError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "이 업로드 요청은 다른 내용으로 이미 등록되었습니다. 웹에서 등록된 묶음을 확인해주세요.",
      );
    return {
      created: result.created,
      upload: present(result.row, result.frames),
    };
  }

  async get(projectId: string, id: string) {
    const result = await this.repository.get(projectId, id);
    if (!result) throw notFound();
    return present(result.row, result.frames);
  }

  async list(projectId: string, query: PageQueryDto): Promise<UploadPageDto> {
    await this.projects.get(projectId);
    const result = await this.repository.list(projectId, query);
    return {
      ...result,
      items: result.items.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
