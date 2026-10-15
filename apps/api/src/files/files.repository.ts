import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, or } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "../common/pagination";
import type { PageQueryDto } from "../contracts/common.dto";
import { DatabaseService } from "../database/database.service";
import { files } from "../database/schema";

@Injectable()
export class FilesRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async pending(id: string, projectId: string, originalName: string) {
    const [row] = await this.database.db
      .insert(files)
      .values({ id, projectId, originalName, storageKey: `${projectId}/${id}` })
      .returning();
    return row;
  }
  async ready(
    id: string,
    metadata: { mediaType: string; byteSize: number; sha256: string },
  ) {
    const [row] = await this.database.db
      .update(files)
      .set({ ...metadata, status: "ready" })
      .where(and(eq(files.id, id), eq(files.status, "pending")))
      .returning();
    if (!row) throw new Error("File state changed.");
    return row;
  }
  async failed(id: string) {
    await this.database.db
      .update(files)
      .set({ status: "failed" })
      .where(and(eq(files.id, id), eq(files.status, "pending")));
  }
  async get(projectId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.projectId, projectId),
          eq(files.id, id),
          eq(files.status, "ready"),
        ),
      );
    return row;
  }
  async list(projectId: string, query: PageQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.database.db
      .select()
      .from(files)
      .where(
        and(
          eq(files.projectId, projectId),
          eq(files.status, "ready"),
          cursor
            ? or(
                lt(files.createdAt, cursor.createdAt),
                and(
                  eq(files.createdAt, cursor.createdAt),
                  lt(files.id, cursor.id),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(files.createdAt), desc(files.id))
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
