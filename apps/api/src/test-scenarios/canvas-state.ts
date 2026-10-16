import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { invalid } from "../common/errors";
import type { CanvasLayoutDto, FlowDocumentDto } from "../contracts/canvas.dto";
import type { TestScenarioSnapshotDto } from "../contracts/test-scenarios.dto";
import type { DatabaseTransaction } from "../database/database.service";
import { projectAnalysis, scenarioCanvases } from "../database/schema";

export const emptyFlow = (): FlowDocumentDto => ({ steps: [], edges: [] });
export const emptyLayout = (): CanvasLayoutDto => ({
  groupBy: null,
  positions: [],
  collapsed: [],
});
export function validateFlow(flow: FlowDocumentDto, cases: Set<string>) {
  const steps = new Set(flow.steps.map((s) => s.id));
  if (
    flow.steps.some(
      (s) => !s.title.trim() || s.caseIds.some((id) => !cases.has(id)),
    ) ||
    flow.edges.some((e) => !steps.has(e.from) || !steps.has(e.to))
  )
    throw invalid("흐름의 단계와 연결된 테스트 케이스를 확인해주세요.");
}

// Called in the case transaction; this module has no dependency on a repository.
export async function reconcileCanvas(
  tx: DatabaseTransaction,
  scenarioId: string,
  cases: Set<string>,
  columns: Set<string>,
) {
  const [row] = await tx
    .select()
    .from(scenarioCanvases)
    .where(eq(scenarioCanvases.testScenarioId, scenarioId));
  if (!row) return;
  const changed = row.flow.steps.some((s) =>
    s.caseIds.some((id) => !cases.has(id)),
  );
  const removedColumn =
    row.layout.groupBy !== null && !columns.has(row.layout.groupBy);
  if (!changed && !removedColumn) return;
  await tx
    .update(scenarioCanvases)
    .set({
      ...(changed
        ? {
            flow: {
              ...row.flow,
              steps: row.flow.steps.map((s) => ({
                ...s,
                caseIds: s.caseIds.filter((id) => cases.has(id)),
              })),
            },
            flowRevision: row.flowRevision + 1,
          }
        : {}),
      ...(removedColumn
        ? {
            layout: { ...row.layout, groupBy: null },
            layoutRevision: row.layoutRevision + 1,
          }
        : {}),
    })
    .where(eq(scenarioCanvases.testScenarioId, scenarioId));
}

export async function flowSources(
  tx: DatabaseTransaction,
  snapshot: TestScenarioSnapshotDto,
) {
  const [row] = await tx
    .select()
    .from(projectAnalysis)
    .where(eq(projectAnalysis.projectId, snapshot.projectId));
  const links =
    row?.links.filter((link) => link.testScenarioId === snapshot.id) ?? [];
  const ids = new Set(links.map((link) => link.requirementId));
  const frames = new Set(snapshot.references.frames.map((f) => f.id));
  const items =
    row?.items.filter(
      (item) => ids.has(item.id) || (item.frameId && frames.has(item.frameId)),
    ) ?? [];
  const sources = { references: snapshot.references, items, links };
  return {
    sources,
    hash: createHash("sha256").update(JSON.stringify(sources)).digest("hex"),
  };
}
