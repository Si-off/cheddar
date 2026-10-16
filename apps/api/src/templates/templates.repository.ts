import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { notFound } from "../common/errors";
import type {
  ProjectTemplateDto,
  UpdateTemplateDto,
} from "../contracts/ia.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import { projects, projectTemplates } from "../database/schema";

@Injectable()
export class TemplatesRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  /** Caller holds the project row lock when copying a template into a testScenario. Never initializes on read. */
  async readSnapshot(
    tx: DatabaseTransaction,
    projectId: string,
  ): Promise<ProjectTemplateDto> {
    const [row] = await tx
      .select()
      .from(projectTemplates)
      .where(eq(projectTemplates.projectId, projectId));
    if (!row) throw notFound();
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async get(projectId: string) {
    return this.database.db.transaction(
      (tx) => this.readSnapshot(tx, projectId),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  async withProjectLock<T>(
    projectId: string,
    work: (tx: DatabaseTransaction) => Promise<T>,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw notFound();
      return work(tx);
    });
  }

  async update(
    tx: DatabaseTransaction,
    projectId: string,
    input: UpdateTemplateDto,
  ) {
    await tx
      .update(projectTemplates)
      .set({
        columns: input.columns,
        view: input.view,
        revision: input.expectedRevision + 1,
        updatedAt: new Date(),
      })
      .where(eq(projectTemplates.projectId, projectId));
    return this.readSnapshot(tx, projectId);
  }
}
