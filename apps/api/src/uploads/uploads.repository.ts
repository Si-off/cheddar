import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, inArray, lt, or } from "drizzle-orm";
import { invalid, notFound } from "../common/errors";
import { decodeCursor, encodeCursor } from "../common/pagination";
import type { PageQueryDto } from "../contracts/common.dto";
import type { CreateUploadDto } from "../contracts/uploads.dto";
import { DatabaseService } from "../database/database.service";
import { files, uploadFrames, uploads } from "../database/schema";

@Injectable()
export class UploadsRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async create(projectId: string, input: CreateUploadDto, requestHash: string) {
    return this.database.db.transaction(async (tx) => {
      // A conflicting INSERT waits for the winner's transaction. The following
      // read therefore observes the complete bundle, never an in-flight parent.
      const [inserted] = await tx
        .insert(uploads)
        .values({
          projectId,
          name: input.name,
          clientRequestId: input.clientRequestId,
          requestHash,
        })
        .onConflictDoNothing({
          target: [uploads.projectId, uploads.clientRequestId],
        })
        .returning();
      if (!inserted) {
        const [existing] = await tx
          .select()
          .from(uploads)
          .where(
            and(
              eq(uploads.projectId, projectId),
              eq(uploads.clientRequestId, input.clientRequestId),
            ),
          );
        if (!existing) throw new Error("Upload request disappeared.");
        const frames = await tx
          .select()
          .from(uploadFrames)
          .where(
            and(
              eq(uploadFrames.projectId, projectId),
              eq(uploadFrames.uploadId, existing.id),
            ),
          )
          .orderBy(asc(uploadFrames.position));
        return { created: false, row: existing, frames };
      }
      const ids = [
        ...new Set(
          input.frames.flatMap((frame) => [
            frame.imageFileId,
            frame.dataFileId,
          ]),
        ),
      ];
      const rows = await tx
        .select()
        .from(files)
        .where(
          and(
            eq(files.projectId, projectId),
            eq(files.status, "ready"),
            inArray(files.id, ids),
          ),
        );
      const ready = new Map(rows.map((row) => [row.id, row]));
      for (const [index, frame] of input.frames.entries()) {
        const image = ready.get(frame.imageFileId);
        const data = ready.get(frame.dataFileId);
        if (!image || !data) throw notFound();
        if (
          !image.mediaType?.startsWith("image/") ||
          data.mediaType !== "application/json"
        )
          throw invalid([
            { field: `frames.${index}`, code: "invalidFileType" },
          ]);
      }
      const records = input.frames.map((frame, position) => ({
        ...frame,
        projectId,
        uploadId: inserted.id,
        position,
      }));
      // Respect PostgreSQL's parameter limit without imposing a frame-count cap.
      for (let offset = 0; offset < records.length; offset += 500)
        await tx
          .insert(uploadFrames)
          .values(records.slice(offset, offset + 500));
      const frames = await tx
        .select()
        .from(uploadFrames)
        .where(eq(uploadFrames.uploadId, inserted.id))
        .orderBy(asc(uploadFrames.position));
      return { created: true, row: inserted, frames };
    });
  }

  async get(projectId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(uploads)
      .where(and(eq(uploads.projectId, projectId), eq(uploads.id, id)));
    if (!row) return undefined;
    const frames = await this.database.db
      .select()
      .from(uploadFrames)
      .where(
        and(
          eq(uploadFrames.projectId, projectId),
          eq(uploadFrames.uploadId, id),
        ),
      )
      .orderBy(asc(uploadFrames.position));
    return { row, frames };
  }

  async list(projectId: string, query: PageQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.database.db
      .select({
        id: uploads.id,
        projectId: uploads.projectId,
        name: uploads.name,
        createdAt: uploads.createdAt,
        frameCount: count(uploadFrames.id),
      })
      .from(uploads)
      .innerJoin(
        uploadFrames,
        and(
          eq(uploadFrames.projectId, uploads.projectId),
          eq(uploadFrames.uploadId, uploads.id),
        ),
      )
      .where(
        and(
          eq(uploads.projectId, projectId),
          cursor
            ? or(
                lt(uploads.createdAt, cursor.createdAt),
                and(
                  eq(uploads.createdAt, cursor.createdAt),
                  lt(uploads.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .groupBy(uploads.id)
      .orderBy(desc(uploads.createdAt), desc(uploads.id))
      .limit(query.limit + 1);
    const items = rows.slice(0, query.limit);
    return {
      items,
      nextCursor:
        rows.length > query.limit
          ? encodeCursor(items[items.length - 1])
          : null,
    };
  }
}
