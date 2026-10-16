import {
  fromSnapshot,
  SaveError,
  type SaveTransport,
  type Snapshot,
} from "@/entities/test-case";
import {
  addGeneratedCases,
  createProject,
  createTestScenario,
  exportTestScenarioXlsx,
  getTestScenario,
  getUpload,
  listGenerationProviders,
  listGenerations,
  listIaItems,
  listProjects,
  listTestScenarios,
  listUploads,
  reviewGenerationResult,
  startGeneration,
  updateTestScenarioContent,
  updateTestScenarioView,
} from "@/shared/api/generated/sdk.gen";

function failure(error: unknown, status?: number): SaveError {
  const body =
    error && typeof error === "object" && "error" in error
      ? (error.error as { message?: string; details?: unknown })
      : undefined;
  let message =
    body?.message ??
    "요청 결과를 확인하지 못했습니다. 목록과 저장 상태를 확인해주세요.";
  const details = body?.details;
  if (
    status === 422 &&
    details &&
    typeof details === "object" &&
    "row" in details &&
    "column" in details
  )
    message += ` (${String(details.row)}행 ${String(details.column)}열)`;
  return new SaveError(message, status, details);
}
function unwrap<T>(result: {
  data?: T;
  error?: unknown;
  response?: Response;
}): T {
  if (result.error || result.data === undefined)
    throw failure(result.error, result.response?.status);
  return result.data;
}
export async function projectPage(cursor?: string) {
  return unwrap(await listProjects({ query: { cursor, limit: 100 } }));
}
export async function testScenarioPage(projectId: string, cursor?: string) {
  return unwrap(
    await listTestScenarios({
      path: { projectId },
      query: { cursor, limit: 100 },
    }),
  );
}
export async function createEmptyTestScenario(
  projectId: string,
  name: string,
  kind: "unit" | "integration",
) {
  return fromSnapshot(
    unwrap(
      await createTestScenario({ path: { projectId }, body: { name, kind } }),
    ),
  );
}
export async function readTestScenario(
  projectId: string,
  testScenarioId: string,
) {
  return fromSnapshot(
    unwrap(await getTestScenario({ path: { projectId, testScenarioId } })),
  );
}
export function saveTransport(
  projectId: string,
  testScenarioId: string,
): SaveTransport {
  const path = { projectId, testScenarioId };
  return {
    get: () => readTestScenario(projectId, testScenarioId),
    content: async (body) =>
      fromSnapshot(unwrap(await updateTestScenarioContent({ path, body }))),
    view: async (body) =>
      fromSnapshot(unwrap(await updateTestScenarioView({ path, body }))),
  };
}
export async function referenceOptions(projectId: string) {
  const iaItems = unwrap(await listIaItems({ path: { projectId } })).items;
  const uploads: { id: string; name: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = unwrap(
      await listUploads({ path: { projectId }, query: { limit: 100, cursor } }),
    );
    uploads.push(...page.items.map((u) => ({ id: u.id, name: u.name })));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { iaItems, uploads };
}
export async function framesForUpload(projectId: string, uploadId: string) {
  const upload = unwrap(await getUpload({ path: { projectId, uploadId } }));
  return upload.frames.map((f) => ({
    id: f.id,
    uploadId: upload.id,
    figmaFileKey: f.figmaFileKey,
    figmaNodeId: f.figmaNodeId,
    name: f.name,
    imageFileId: f.imageFileId,
    dataFileId: f.dataFileId,
  }));
}
export async function downloadTestScenario(snapshot: Snapshot) {
  const result = await exportTestScenarioXlsx({
    path: { projectId: snapshot.projectId, testScenarioId: snapshot.id },
    query: {
      contentRevision: snapshot.contentRevision,
      viewRevision: snapshot.viewRevision,
    },
    parseAs: "blob",
  });
  const data: unknown = unwrap(result);
  if (!(data instanceof Blob))
    throw new SaveError("내보내기 파일을 읽지 못했습니다. 다시 시도해주세요.");
  const disposition = result.response?.headers.get("Content-Disposition") ?? "";
  const filename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  let name = `${snapshot.name}.xlsx`;
  try {
    if (filename) name = decodeURIComponent(filename);
  } catch {
    /* Use the safe fallback download name. */
  }
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url;
  link.download = name.replaceAll("/", "_").replaceAll("\\", "_");
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function createProjectNamed(name: string) {
  return unwrap(await createProject({ body: { name } }));
}
export async function generationProviders() {
  return unwrap(await listGenerationProviders());
}
export async function generationList(
  projectId: string,
  testScenarioId: string,
) {
  return unwrap(await listGenerations({ path: { projectId, testScenarioId } }));
}
export async function beginGeneration(
  projectId: string,
  testScenarioId: string,
  body: import("@/shared/api/generated").StartGenerationDto,
) {
  return unwrap(
    await startGeneration({ path: { projectId, testScenarioId }, body }),
  );
}
export async function updateCandidate(
  projectId: string,
  testScenarioId: string,
  jobId: string,
  resultId: string,
  body: import("@/shared/api/generated").ReviewGenerationResultDto,
) {
  return unwrap(
    await reviewGenerationResult({
      path: { projectId, testScenarioId, jobId, resultId },
      body,
    }),
  );
}

export async function addGenerationSelection(
  projectId: string,
  testScenarioId: string,
  jobId: string,
  body: import("@/shared/api/generated").AddGeneratedCasesDto,
) {
  return unwrap(
    await addGeneratedCases({
      path: { projectId, testScenarioId, jobId },
      body,
    }),
  );
}
