import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { decodeCursor, encodeCursor } from "../common/pagination";
import type { PageQueryDto } from "../contracts/common.dto";
import type {
  CreateProjectDto,
  UpdateProjectDto,
} from "../contracts/projects.dto";
import { DatabaseService } from "../database/database.service";
import { projects, projectTemplates } from "../database/schema";

import { createDefaultTemplate } from "./default-template";

@Injectable()
export class ProjectsRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}
  async create(input: CreateProjectDto) {
    return this.database.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(projects)
        .values({ name: input.name, description: input.description ?? null })
        .returning();
      await tx
        .insert(projectTemplates)
        .values({ projectId: row.id, ...createDefaultTemplate() });
      return row;
    });
  }
  async get(id: string) {
    const [row] = await this.database.db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    return row;
  }
  async list(query: PageQueryDto) {
    const cursor = decodeCursor(query.cursor);
    const rows = await this.database.db
      .select()
      .from(projects)
      .where(
        cursor
          ? or(
              lt(projects.createdAt, cursor.createdAt),
              and(
                eq(projects.createdAt, cursor.createdAt),
                lt(projects.id, cursor.id),
              ),
            )
          : undefined,
      )
      .orderBy(desc(projects.createdAt), desc(projects.id))
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
  async update(id: string, input: UpdateProjectDto) {
    const [row] = await this.database.db
      .update(projects)
      .set({
        name: input.name,
        description: input.description,
        revision: sql`${projects.revision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(projects.id, id), eq(projects.revision, input.expectedRevision)),
      )
      .returning();
    return row;
  }
}
