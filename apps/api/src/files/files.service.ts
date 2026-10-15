import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { ApiError, invalid, notFound, unavailable } from "../common/errors";
import type { PageQueryDto } from "../contracts/common.dto";
import type { FileDto } from "../contracts/files.dto";
import type { files } from "../database/schema";
import { ProjectsService } from "../projects/projects.service";
import { LocalStorage } from "../storage/local-storage";
import { inspectFile, originalFileName } from "./file-validation";
import { FilesRepository } from "./files.repository";

function present(row: typeof files.$inferSelect): FileDto {
  if (row.status !== "ready" || !row.mediaType || !row.byteSize || !row.sha256)
    throw new Error("Incomplete file.");
  return {
    id: row.id,
    projectId: row.projectId,
    originalName: row.originalName,
    mediaType: row.mediaType,
    byteSize: row.byteSize,
    sha256: row.sha256,
    status: "ready",
    createdAt: row.createdAt.toISOString(),
  };
}
@Injectable()
export class FilesService {
  constructor(
    @Inject(FilesRepository) private readonly repository: FilesRepository,
    @Inject(ProjectsService) private readonly projects: ProjectsService,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
  ) {}
  async create(projectId: string, file?: Express.Multer.File) {
    await this.projects.get(projectId);
    const originalName = file ? originalFileName(file.originalname) : "";
    if (
      !file ||
      !originalName ||
      originalName.length > 255 ||
      /[\r\n\0]/.test(originalName)
    )
      throw invalid([{ field: "file", code: "invalidFile" }]);
    const id = randomUUID();
    await this.repository.pending(id, projectId, originalName);
    try {
      await this.storage.stage(id, file.buffer);
      const metadata = inspectFile(file.buffer, file.mimetype);
      await this.storage.publish(projectId, id);
      return present(await this.repository.ready(id, metadata));
    } catch (error) {
      await this.storage.discardStage(id).catch(() => undefined);
      await this.repository.failed(id).catch(() => undefined);
      if (error instanceof ApiError) throw error;
      throw unavailable();
    }
  }
  async list(projectId: string, query: PageQueryDto) {
    await this.projects.get(projectId);
    const page = await this.repository.list(projectId, query);
    return { ...page, items: page.items.map(present) };
  }
  private async record(projectId: string, id: string) {
    const row = await this.repository.get(projectId, id);
    if (!row) throw notFound();
    return row;
  }
  async get(projectId: string, id: string) {
    return present(await this.record(projectId, id));
  }
  async download(projectId: string, id: string) {
    const row = await this.record(projectId, id);
    try {
      const handle = await this.storage.open(row.storageKey);
      if ((await handle.stat()).size !== row.byteSize) {
        await handle.close();
        throw new Error("Stored size mismatch.");
      }
      return {
        metadata: present(row),
        stream: handle.createReadStream({ autoClose: true }),
      };
    } catch {
      throw unavailable();
    }
  }
}
