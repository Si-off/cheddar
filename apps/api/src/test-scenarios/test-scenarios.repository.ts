import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import { assertTestScenarioEditable } from "../common/generation-lock";
import { decodeCursor, encodeCursor } from "../common/pagination";
import type { ProjectTemplateDto } from "../contracts/ia.dto";
import {
  type CreateTestScenarioDto,
  type TestScenarioContentDto,
  type TestScenarioPageQueryDto,
  type TestScenarioSnapshotDto,
  type TestScenarioSummaryDto,
  type TestScenarioViewDto,
  validColumns,
} from "../contracts/test-scenarios.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  iaItems,
  projects,
  testCaseFrameLinks,
  testCaseIaLinks,
  testCases,
  testCaseValues,
  testScenarioColumns,
  testScenarioColumnViews,
  testScenarios,
  uploadFrames,
  uploads,
} from "../database/schema";
import { DEFAULT_COLUMN_WIDTH } from "../projects/default-template";
import { reconcileCanvas } from "./canvas-state";

type TestScenarioRow = typeof testScenarios.$inferSelect;
type TemplateReader = (
  tx: DatabaseTransaction,
  projectId: string,
) => Promise<ProjectTemplateDto>;
function summary(row: TestScenarioRow): TestScenarioSummaryDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    kind: row.kind,
    uploadId: row.uploadId,
    contentRevision: row.contentRevision,
    viewRevision: row.viewRevision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function revisionConflict(
  resource: "content" | "view",
  currentRevision: number,
) {
  return new ApiError(
    409,
    "REVISION_CONFLICT",
    "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
    { resource, currentRevision },
  );
}
async function insertChunks<T>(
  rows: T[],
  insert: (chunk: T[]) => Promise<unknown>,
) {
  for (let start = 0; start < rows.length; start += 200)
    await insert(rows.slice(start, start + 200));
}
function idsMatch(a: string[], b: string[]) {
  return (
    a.length === b.length &&
    new Set(a).size === a.length &&
    a.every((id) => b.includes(id))
  );
}
function check(
  condition: unknown,
  field: string,
  code: string,
): asserts condition {
  if (!condition) throw invalid([{ field, code }]);
}
function pgCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  if ("code" in error && typeof error.code === "string") return error.code;
  return "cause" in error ? pgCode(error.cause) : undefined;
}
@Injectable()
export class TestScenariosRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  private async project(
    tx: DatabaseTransaction,
    projectId: string,
    lock = false,
  ) {
    const query = tx
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    const [project] = await (lock ? query.for("update") : query);
    if (!project) throw notFound();
  }
  private async testScenario(
    tx: DatabaseTransaction,
    projectId: string,
    testScenarioId: string,
    lock = false,
  ) {
    const query = tx
      .select()
      .from(testScenarios)
      .where(
        and(
          eq(testScenarios.projectId, projectId),
          eq(testScenarios.id, testScenarioId),
        ),
      );
    const [testScenario] = await (lock ? query.for("update") : query);
    if (!testScenario) throw notFound();
    return testScenario;
  }
  private async upload(
    tx: DatabaseTransaction,
    projectId: string,
    uploadId?: string | null,
  ) {
    if (!uploadId) return;
    const [upload] = await tx
      .select({ id: uploads.id })
      .from(uploads)
      .where(and(eq(uploads.projectId, projectId), eq(uploads.id, uploadId)));
    if (!upload) throw notFound();
  }
  private async write<T>(
    projectId: string,
    operation: (tx: DatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.database.db.transaction(async (tx) => {
        await this.project(tx, projectId, true);
        return operation(tx);
      });
    } catch (error) {
      const code = pgCode(error);
      if (code === "23505")
        throw invalid([{ field: "body", code: "duplicateIdentifier" }]);
      if (code === "23503")
        throw new ApiError(
          409,
          "REFERENCE_IN_USE",
          "연결 항목이 변경되어 저장하지 못했습니다. 연결을 확인해주세요.",
        );
      throw error;
    }
  }
  async create(
    projectId: string,
    input: CreateTestScenarioDto,
    readTemplate: TemplateReader,
  ) {
    return this.write(projectId, async (tx) => {
      await this.upload(tx, projectId, input.uploadId);
      const template = await readTemplate(tx, projectId);
      const id = randomUUID();
      const mapping = new Map(
        template.columns.map((column) => [column.id, randomUUID()]),
      );
      check(
        validColumns(template.columns) &&
          template.view.every(
            (c) =>
              Number.isInteger(c.width) &&
              c.width >= 1 &&
              c.width <= 2147483647,
          ) &&
          idsMatch(
            template.view.map((c) => c.columnId),
            template.columns.map((c) => c.id),
          ),
        "template",
        "invalidTemplate",
      );
      await tx.insert(testScenarios).values({
        id,
        projectId,
        name: input.name,
        kind: input.kind,
        uploadId: input.uploadId ?? null,
        sourceTemplateRevision: template.revision,
      });
      await tx.insert(testScenarioColumns).values(
        template.columns.map((column) => ({
          ...column,
          id: mapping.get(column.id) as string,
          projectId,
          testScenarioId: id,
        })),
      );
      await tx.insert(testScenarioColumnViews).values(
        template.view.map((column, position) => ({
          ...column,
          columnId: mapping.get(column.columnId) as string,
          testScenarioId: id,
          position,
        })),
      );
      return this.readSnapshot(tx, projectId, id);
    });
  }
  async list(projectId: string, query: TestScenarioPageQueryDto) {
    return this.database.db.transaction(
      async (tx) => {
        await this.project(tx, projectId);
        await this.upload(tx, projectId, query.uploadId);
        const cursor = decodeCursor(query.cursor);
        const rows = await tx
          .select()
          .from(testScenarios)
          .where(
            and(
              eq(testScenarios.projectId, projectId),
              query.uploadId
                ? eq(testScenarios.uploadId, query.uploadId)
                : undefined,
              cursor
                ? or(
                    lt(testScenarios.createdAt, cursor.createdAt),
                    and(
                      eq(testScenarios.createdAt, cursor.createdAt),
                      lt(testScenarios.id, cursor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(testScenarios.createdAt), desc(testScenarios.id))
          .limit(query.limit + 1);
        const items = rows.slice(0, query.limit);
        return {
          items: items.map(summary),
          nextCursor:
            rows.length > query.limit
              ? encodeCursor(items[items.length - 1])
              : null,
        };
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  async get(projectId: string, testScenarioId: string) {
    return this.database.db.transaction(
      (tx) => this.readSnapshot(tx, projectId, testScenarioId),
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  async readSnapshot(
    tx: DatabaseTransaction,
    projectId: string,
    testScenarioId: string,
  ): Promise<TestScenarioSnapshotDto> {
    const row = await this.testScenario(tx, projectId, testScenarioId);
    const columns = await tx
      .select()
      .from(testScenarioColumns)
      .where(eq(testScenarioColumns.testScenarioId, testScenarioId))
      .orderBy(asc(testScenarioColumns.id));
    const view = await tx
      .select()
      .from(testScenarioColumnViews)
      .where(eq(testScenarioColumnViews.testScenarioId, testScenarioId))
      .orderBy(asc(testScenarioColumnViews.position));
    const cases = await tx
      .select()
      .from(testCases)
      .where(eq(testCases.testScenarioId, testScenarioId))
      .orderBy(asc(testCases.position));
    const values = await tx
      .select()
      .from(testCaseValues)
      .where(eq(testCaseValues.testScenarioId, testScenarioId));
    const caseIds = cases.map((c) => c.id);
    const frameLinks = await tx
      .select()
      .from(testCaseFrameLinks)
      .where(inArray(testCaseFrameLinks.caseId, caseIds))
      .orderBy(asc(testCaseFrameLinks.position));
    const iaLinks = await tx
      .select()
      .from(testCaseIaLinks)
      .where(inArray(testCaseIaLinks.caseId, caseIds))
      .orderBy(asc(testCaseIaLinks.position));
    const frames = await tx
      .select()
      .from(uploadFrames)
      .where(
        inArray(uploadFrames.id, [
          ...new Set(frameLinks.map((l) => l.frameId)),
        ]),
      )
      .orderBy(asc(uploadFrames.id));
    const ia = await tx
      .select()
      .from(iaItems)
      .where(inArray(iaItems.id, [...new Set(iaLinks.map((l) => l.iaItemId))]))
      .orderBy(asc(iaItems.id));
    return {
      ...summary(row),
      sourceTemplateRevision: row.sourceTemplateRevision,
      columns: columns.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        ...(c.field ? { field: c.field } : {}),
        ...(c.valueType ? { valueType: c.valueType } : {}),
        ...(c.description !== null ? { description: c.description } : {}),
        ...(c.options !== null ? { options: c.options } : {}),
      })),
      view: view.map((c) => ({ columnId: c.columnId, width: c.width })),
      cases: cases.map((c) => ({
        id: c.id,
        caseCode: c.caseCode,
        title: c.title,
        customValues: Object.fromEntries(
          values
            .filter((v) => v.caseId === c.id)
            .map((v) => [v.columnId, v.value]),
        ),
        relatedFrameIds: frameLinks
          .filter((l) => l.caseId === c.id)
          .map((l) => l.frameId),
        screenIds: iaLinks
          .filter((l) => l.caseId === c.id)
          .map((l) => l.iaItemId),
      })),
      references: {
        frames: frames.map((f) => ({
          id: f.id,
          uploadId: f.uploadId,
          figmaFileKey: f.figmaFileKey,
          figmaNodeId: f.figmaNodeId,
          name: f.name,
          imageFileId: f.imageFileId,
          dataFileId: f.dataFileId,
        })),
        iaItems: ia.map((i) => ({
          id: i.id,
          screenId: i.screenId,
          name: i.name,
        })),
      },
    };
  }
  async updateView(
    projectId: string,
    testScenarioId: string,
    input: TestScenarioViewDto,
  ) {
    return this.write(projectId, async (tx) => {
      const testScenario = await this.testScenario(
        tx,
        projectId,
        testScenarioId,
        true,
      );
      await assertTestScenarioEditable(tx, testScenarioId);
      if (testScenario.viewRevision !== input.expectedRevision)
        throw revisionConflict("view", testScenario.viewRevision);
      const columns = await tx
        .select({ id: testScenarioColumns.id })
        .from(testScenarioColumns)
        .where(eq(testScenarioColumns.testScenarioId, testScenarioId));
      check(
        idsMatch(
          input.columns.map((c) => c.columnId),
          columns.map((c) => c.id),
        ),
        "columns",
        "columnSetMismatch",
      );
      await tx
        .delete(testScenarioColumnViews)
        .where(eq(testScenarioColumnViews.testScenarioId, testScenarioId));
      await tx.insert(testScenarioColumnViews).values(
        input.columns.map((c, position) => ({
          ...c,
          testScenarioId,
          position,
        })),
      );
      await tx
        .update(testScenarios)
        .set({
          viewRevision: testScenario.viewRevision + 1,
          updatedAt: new Date(),
        })
        .where(eq(testScenarios.id, testScenarioId));
      return this.readSnapshot(tx, projectId, testScenarioId);
    });
  }
  async updateContent(
    projectId: string,
    testScenarioId: string,
    input: TestScenarioContentDto,
  ) {
    return this.write(projectId, async (tx) => {
      await assertTestScenarioEditable(tx, testScenarioId);
      return this.writeContent(tx, projectId, testScenarioId, input);
    });
  }
  // Caller owns the project lock and commits its surrounding operation atomically.
  async writeContent(
    tx: DatabaseTransaction,
    projectId: string,
    testScenarioId: string,
    input: TestScenarioContentDto,
  ) {
    const testScenario = await this.testScenario(
      tx,
      projectId,
      testScenarioId,
      true,
    );
    if (testScenario.contentRevision !== input.expectedRevision)
      throw revisionConflict("content", testScenario.contentRevision);
    const existing = await tx
      .select()
      .from(testScenarioColumns)
      .where(eq(testScenarioColumns.testScenarioId, testScenarioId));
    check(validColumns(input.columns), "columns", "invalidColumns");
    check(
      existing
        .filter((c) => c.kind === "system")
        .every((c) =>
          input.columns.some(
            (n) => n.id === c.id && n.field === c.field && n.kind === "system",
          ),
        ),
      "columns",
      "systemColumnChanged",
    );
    check(
      existing.every(
        (c) =>
          !input.columns.some(
            (n) =>
              n.id === c.id &&
              (n.kind !== c.kind || n.field !== (c.field ?? undefined)),
          ),
      ),
      "columns",
      "columnKindChanged",
    );
    const reusedColumns = await tx
      .select()
      .from(testScenarioColumns)
      .where(
        inArray(
          testScenarioColumns.id,
          input.columns.map((c) => c.id),
        ),
      );
    const reusedCases = await tx
      .select()
      .from(testCases)
      .where(
        inArray(
          testCases.id,
          input.cases.map((c) => c.id),
        ),
      );
    check(
      reusedColumns.every((c) => c.testScenarioId === testScenarioId),
      "columns",
      "identifierInAnotherTestScenario",
    );
    check(
      reusedCases.every((c) => c.testScenarioId === testScenarioId),
      "cases",
      "identifierInAnotherTestScenario",
    );
    const frameIds = [
      ...new Set(input.cases.flatMap((c) => c.relatedFrameIds)),
    ];
    const screenIds = [
      ...new Set(input.cases.flatMap((c) => c.screenIds)),
    ].sort();
    const frames = await tx
      .select({ id: uploadFrames.id })
      .from(uploadFrames)
      .where(
        and(
          eq(uploadFrames.projectId, projectId),
          inArray(uploadFrames.id, frameIds),
        ),
      );
    const ia = await tx
      .select({ id: iaItems.id })
      .from(iaItems)
      .where(
        and(eq(iaItems.projectId, projectId), inArray(iaItems.id, screenIds)),
      )
      .orderBy(asc(iaItems.id))
      .for("update");
    check(
      frames.length === frameIds.length,
      "cases.relatedFrameIds",
      "invalidReference",
    );
    check(
      ia.length === screenIds.length,
      "cases.screenIds",
      "invalidReference",
    );
    const existingCases = await tx
      .select()
      .from(testCases)
      .where(eq(testCases.testScenarioId, testScenarioId));
    const existingIds = new Set(existingCases.map((c) => c.id));
    const oldColumnIds = new Set(existing.map((c) => c.id));
    const nextIds = new Set(input.cases.map((c) => c.id));
    const nextColumnIds = new Set(input.columns.map((c) => c.id));
    const structureChanged = !idsMatch([...oldColumnIds], [...nextColumnIds]);
    let nextNumber = testScenario.nextCaseNumber;
    const codes = new Set(input.cases.map((c) => c.caseCode).filter(Boolean));
    const cases = input.cases.map((c) => {
      if (existingIds.has(c.id) || c.caseCode) return c;
      let code: string;
      do {
        code = `TC-${String(nextNumber++).padStart(3, "0")}`;
      } while (codes.has(code));
      codes.add(code);
      return { ...c, caseCode: code };
    });
    await tx
      .delete(testCaseValues)
      .where(eq(testCaseValues.testScenarioId, testScenarioId));
    await tx
      .delete(testCaseFrameLinks)
      .where(inArray(testCaseFrameLinks.caseId, [...existingIds]));
    await tx
      .delete(testCaseIaLinks)
      .where(inArray(testCaseIaLinks.caseId, [...existingIds]));
    await tx.delete(testCases).where(
      inArray(
        testCases.id,
        [...existingIds].filter((id) => !nextIds.has(id)),
      ),
    );
    const view = await tx
      .select()
      .from(testScenarioColumnViews)
      .where(eq(testScenarioColumnViews.testScenarioId, testScenarioId))
      .orderBy(asc(testScenarioColumnViews.position));
    if (structureChanged)
      await tx
        .delete(testScenarioColumnViews)
        .where(eq(testScenarioColumnViews.testScenarioId, testScenarioId));
    await tx.delete(testScenarioColumns).where(
      inArray(
        testScenarioColumns.id,
        [...oldColumnIds].filter((id) => !nextColumnIds.has(id)),
      ),
    );
    for (const column of input.columns.filter((c) => oldColumnIds.has(c.id)))
      await tx
        .update(testScenarioColumns)
        .set({
          name: column.name,
          valueType: column.valueType ?? null,
          description: column.description ?? null,
          options: column.options ?? null,
        })
        .where(
          and(
            eq(testScenarioColumns.testScenarioId, testScenarioId),
            eq(testScenarioColumns.id, column.id),
          ),
        );
    await insertChunks(
      input.columns
        .filter((c) => !oldColumnIds.has(c.id))
        .map((c) => ({ ...c, projectId, testScenarioId })),
      (chunk) => tx.insert(testScenarioColumns).values(chunk),
    );
    if (structureChanged) {
      const retained = view
        .filter((c) => nextColumnIds.has(c.columnId))
        .map((c) => ({ columnId: c.columnId, width: c.width }));
      const added = input.columns
        .filter((c) => !oldColumnIds.has(c.id))
        .map((c) => ({ columnId: c.id, width: DEFAULT_COLUMN_WIDTH }));
      await tx.insert(testScenarioColumnViews).values(
        [...retained, ...added].map((c, position) => ({
          ...c,
          testScenarioId,
          position,
        })),
      );
    }
    const offset =
      Math.max(0, ...existingCases.map((c) => c.position)) + cases.length + 1;
    await tx
      .update(testCases)
      .set({ position: sql`${testCases.position} + ${offset}`, caseCode: "" })
      .where(eq(testCases.testScenarioId, testScenarioId));
    const rows = cases.map(
      (
        {
          customValues: _values,
          relatedFrameIds: _frames,
          screenIds: _screens,
          ...c
        },
        position,
      ) => ({ ...c, projectId, testScenarioId, position }),
    );
    for (const row of rows.filter((c) => existingIds.has(c.id)))
      await tx
        .update(testCases)
        .set(row)
        .where(
          and(
            eq(testCases.testScenarioId, testScenarioId),
            eq(testCases.id, row.id),
          ),
        );
    await insertChunks(
      rows.filter((c) => !existingIds.has(c.id)),
      (chunk) => tx.insert(testCases).values(chunk),
    );
    await insertChunks(
      cases.flatMap((c) =>
        Object.entries(c.customValues).map(([columnId, value]) => ({
          testScenarioId,
          caseId: c.id,
          columnId,
          value,
        })),
      ),
      (chunk) => tx.insert(testCaseValues).values(chunk),
    );
    await insertChunks(
      cases.flatMap((c) =>
        c.relatedFrameIds.map((frameId, position) => ({
          projectId,
          caseId: c.id,
          frameId,
          position,
        })),
      ),
      (chunk) => tx.insert(testCaseFrameLinks).values(chunk),
    );
    await insertChunks(
      cases.flatMap((c) =>
        c.screenIds.map((iaItemId, position) => ({
          projectId,
          caseId: c.id,
          iaItemId,
          position,
        })),
      ),
      (chunk) => tx.insert(testCaseIaLinks).values(chunk),
    );
    await tx
      .update(testScenarios)
      .set({
        contentRevision: testScenario.contentRevision + 1,
        viewRevision: testScenario.viewRevision + (structureChanged ? 1 : 0),
        nextCaseNumber: nextNumber,
        updatedAt: new Date(),
      })
      .where(eq(testScenarios.id, testScenarioId));
    await reconcileCanvas(tx, testScenarioId, nextIds, nextColumnIds);
    return this.readSnapshot(tx, projectId, testScenarioId);
  }
}
