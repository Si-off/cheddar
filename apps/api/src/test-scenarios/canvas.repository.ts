import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { ApiError, invalid, notFound } from "../common/errors";
import type {
  CanvasLayoutDto,
  CanvasSnapshotDto,
  ReplaceFlowDto,
  RestoreFlowDto,
  SaveCanvasLayoutDto,
  SaveFlowDto,
} from "../contracts/canvas.dto";
import type { TestScenarioSnapshotDto } from "../contracts/test-scenarios.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import {
  projects,
  scenarioCanvases,
  scenarioFlowJobs,
} from "../database/schema";
import {
  emptyFlow,
  emptyLayout,
  flowSources,
  validateFlow,
} from "./canvas-state";
import { TestScenariosRepository } from "./test-scenarios.repository";

export function checkCanvasRevision(
  resource: string,
  expected: number,
  actual: number,
) {
  if (expected !== actual)
    throw new ApiError(
      409,
      "REVISION_CONFLICT",
      "다른 변경 사항이 저장되어 있습니다. 최신 내용을 확인해주세요.",
      { resource, currentRevision: actual },
    );
}
function checkLayout(
  layout: CanvasLayoutDto,
  snapshot: TestScenarioSnapshotDto,
) {
  if (layout.groupBy && !snapshot.columns.some((c) => c.id === layout.groupBy))
    throw invalid([{ field: "groupBy", code: "UNKNOWN_COLUMN" }]);
}
@Injectable()
export class CanvasRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(TestScenariosRepository)
    private readonly scenarios: TestScenariosRepository,
  ) {}

  async read(tx: DatabaseTransaction, id: string): Promise<CanvasSnapshotDto> {
    const [row] = await tx
      .select()
      .from(scenarioCanvases)
      .where(eq(scenarioCanvases.testScenarioId, id));
    return row
      ? {
          flowRevision: row.flowRevision,
          layoutRevision: row.layoutRevision,
          flow: row.flow,
          layout: row.layout,
          previous: row.previous,
        }
      : {
          flowRevision: 1,
          layoutRevision: 1,
          flow: emptyFlow(),
          layout: emptyLayout(),
          previous: null,
        };
  }
  async locked<T>(
    projectId: string,
    id: string,
    run: (
      tx: DatabaseTransaction,
      snapshot: TestScenarioSnapshotDto,
      canvas: CanvasSnapshotDto,
    ) => Promise<T>,
  ): Promise<T> {
    return this.database.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, projectId))
        .for("update");
      if (!project) throw notFound();
      const snapshot = await this.scenarios.readSnapshot(tx, projectId, id);
      await tx
        .insert(scenarioCanvases)
        .values({ testScenarioId: id })
        .onConflictDoNothing();
      return run(tx, snapshot, await this.read(tx, id));
    });
  }
  get(projectId: string, id: string) {
    return this.database.db.transaction(
      async (tx) => {
        await this.scenarios.readSnapshot(tx, projectId, id);
        return this.read(tx, id);
      },
      { isolationLevel: "repeatable read" },
    );
  }
  saveFlow(projectId: string, id: string, input: SaveFlowDto) {
    return this.locked(projectId, id, async (tx, snapshot, canvas) => {
      checkCanvasRevision(
        "content",
        input.contentRevision,
        snapshot.contentRevision,
      );
      checkCanvasRevision("flow", input.expectedRevision, canvas.flowRevision);
      validateFlow(input.flow, new Set(snapshot.cases.map((c) => c.id)));
      await tx
        .update(scenarioCanvases)
        .set({ flow: input.flow, flowRevision: canvas.flowRevision + 1 })
        .where(eq(scenarioCanvases.testScenarioId, id));
      return this.read(tx, id);
    });
  }
  saveLayout(projectId: string, id: string, input: SaveCanvasLayoutDto) {
    return this.locked(projectId, id, async (tx, snapshot, canvas) => {
      checkCanvasRevision(
        "layout",
        input.expectedRevision,
        canvas.layoutRevision,
      );
      checkLayout(input.layout, snapshot);
      await tx
        .update(scenarioCanvases)
        .set({
          layout: input.layout,
          layoutRevision: canvas.layoutRevision + 1,
        })
        .where(eq(scenarioCanvases.testScenarioId, id));
      return this.read(tx, id);
    });
  }
  replace(projectId: string, id: string, input: ReplaceFlowDto) {
    return this.locked(projectId, id, async (tx, snapshot, canvas) => {
      checkCanvasRevision(
        "content",
        input.contentRevision,
        snapshot.contentRevision,
      );
      checkCanvasRevision("flow", input.flowRevision, canvas.flowRevision);
      checkCanvasRevision(
        "layout",
        input.layoutRevision,
        canvas.layoutRevision,
      );
      validateFlow(input.flow, new Set(snapshot.cases.map((c) => c.id)));
      checkLayout(input.layout, snapshot);
      if (input.jobId) {
        const [job] = await tx
          .select()
          .from(scenarioFlowJobs)
          .where(
            and(
              eq(scenarioFlowJobs.id, input.jobId),
              eq(scenarioFlowJobs.testScenarioId, id),
            ),
          );
        if (job?.status !== "succeeded") throw invalid();
        if (job.sourceHash !== (await flowSources(tx, snapshot)).hash)
          throw new ApiError(
            409,
            "REVISION_CONFLICT",
            "연결 자료가 변경되었습니다. 최신 자료로 다시 생성해주세요.",
          );
        checkCanvasRevision(
          "content",
          job.contentRevision,
          snapshot.contentRevision,
        );
        checkCanvasRevision("flow", job.flowRevision, canvas.flowRevision);
        checkCanvasRevision(
          "layout",
          job.layoutRevision,
          canvas.layoutRevision,
        );
      }
      await tx
        .update(scenarioCanvases)
        .set({
          flow: input.flow,
          layout: {
            ...canvas.layout,
            positions: [
              ...canvas.layout.positions.filter((p) => !p.id.startsWith("f:")),
              ...input.layout.positions.filter((p) => p.id.startsWith("f:")),
            ],
          },
          flowRevision: canvas.flowRevision + 1,
          layoutRevision: canvas.layoutRevision + 1,
          previous: {
            id: randomUUID(),
            flow: canvas.flow,
            layout: canvas.layout,
            caseLabels: Object.fromEntries(
              snapshot.cases.map((c) => [c.id, `${c.caseCode} ${c.title}`]),
            ),
          },
        })
        .where(eq(scenarioCanvases.testScenarioId, id));
      return this.read(tx, id);
    });
  }
  restore(projectId: string, id: string, input: RestoreFlowDto) {
    return this.locked(projectId, id, async (tx, snapshot, canvas) => {
      checkCanvasRevision(
        "content",
        input.contentRevision,
        snapshot.contentRevision,
      );
      checkCanvasRevision("flow", input.flowRevision, canvas.flowRevision);
      checkCanvasRevision(
        "layout",
        input.layoutRevision,
        canvas.layoutRevision,
      );
      if (!canvas.previous || input.backupId !== canvas.previous.id)
        throw new ApiError(
          409,
          "REVISION_CONFLICT",
          "복원할 흐름이 변경되었습니다. 다시 확인해주세요.",
        );
      const ids = new Set(snapshot.cases.map((c) => c.id));
      const previous = canvas.previous;
      await tx
        .update(scenarioCanvases)
        .set({
          flow: {
            ...previous.flow,
            steps: previous.flow.steps.map((s) => ({
              ...s,
              caseIds: s.caseIds.filter((id) => ids.has(id)),
            })),
          },
          layout: {
            ...canvas.layout,
            positions: [
              ...canvas.layout.positions.filter((p) => !p.id.startsWith("f:")),
              ...previous.layout.positions.filter((p) => p.id.startsWith("f:")),
            ],
          },
          flowRevision: canvas.flowRevision + 1,
          layoutRevision: canvas.layoutRevision + 1,
          previous: null,
        })
        .where(eq(scenarioCanvases.testScenarioId, id));
      return this.read(tx, id);
    });
  }
}
