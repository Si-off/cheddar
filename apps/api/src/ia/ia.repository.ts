import { Inject, Injectable } from "@nestjs/common";
import { and, asc, eq } from "drizzle-orm";
import { notFound } from "../common/errors";
import type { CreateIaItemDto, UpdateIaItemDto } from "../contracts/ia.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import { iaItems, projects, testCaseIaLinks } from "../database/schema";

export type IaRow = typeof iaItems.$inferSelect;

@Injectable()
export class IaRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

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

  async list(projectId: string) {
    return this.database.db.transaction(
      async (tx) => {
        const [project] = await tx
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, projectId));
        if (!project) throw notFound();
        return this.rows(tx, projectId);
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }

  rows(tx: DatabaseTransaction, projectId: string) {
    return tx
      .select()
      .from(iaItems)
      .where(eq(iaItems.projectId, projectId))
      .orderBy(asc(iaItems.position), asc(iaItems.id));
  }

  async insert(
    tx: DatabaseTransaction,
    projectId: string,
    input: CreateIaItemDto,
  ) {
    const [row] = await tx
      .insert(iaItems)
      .values({ ...input, projectId })
      .returning();
    return row;
  }

  async update(tx: DatabaseTransaction, row: IaRow, input: UpdateIaItemDto) {
    const { expectedRevision: _revision, ...patch } = input;
    const [updated] = await tx
      .update(iaItems)
      .set({ ...patch, revision: row.revision + 1, updatedAt: new Date() })
      .where(
        and(
          eq(iaItems.projectId, row.projectId),
          eq(iaItems.id, row.id),
          eq(iaItems.revision, row.revision),
        ),
      )
      .returning();
    return updated;
  }

  async references(tx: DatabaseTransaction, projectId: string, itemId: string) {
    const [child] = await tx
      .select({ id: iaItems.id })
      .from(iaItems)
      .where(
        and(eq(iaItems.projectId, projectId), eq(iaItems.parentId, itemId)),
      )
      .limit(1);
    const [link] = await tx
      .select({ id: testCaseIaLinks.caseId })
      .from(testCaseIaLinks)
      .where(
        and(
          eq(testCaseIaLinks.projectId, projectId),
          eq(testCaseIaLinks.iaItemId, itemId),
        ),
      )
      .limit(1);
    return [...(child ? ["children"] : []), ...(link ? ["cases"] : [])];
  }

  async delete(tx: DatabaseTransaction, projectId: string, itemId: string) {
    await tx
      .delete(iaItems)
      .where(and(eq(iaItems.projectId, projectId), eq(iaItems.id, itemId)));
  }
}
