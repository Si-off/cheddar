import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Surface,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  getProject,
  getUpload,
  listUploads,
} from "@/shared/api/generated/sdk.gen";
import type {
  CreateTestScenarioDto,
  TestScenarioPageDto,
  TestScenarioSnapshotDto,
} from "@/shared/api/generated/types.gen";
import { LoadingSkeleton } from "@/shared/ui/workspace";
import { FrameDataDownload, FramePreview } from "./frame-preview";
import { uploadError } from "./uploads-api";

export type ProjectUploadsPageProps = {
  projectId: string;
  onOpenUpload: (uploadId: string) => void;
};
export type UploadTestScenarioGateway = {
  list: (cursor?: string) => Promise<TestScenarioPageDto>;
  create: (input: CreateTestScenarioDto) => Promise<TestScenarioSnapshotDto>;
};
export type ProjectUploadDetailPageProps = {
  projectId: string;
  uploadId: string;
  onBack: () => void;
  onOpenTestScenario: (testScenarioId: string) => void;
  testScenarioGateway?: UploadTestScenarioGateway;
};

function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: async ({ signal }) =>
      (await getProject({ path: { projectId }, signal, throwOnError: true }))
        .data,
  });
}
function date(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ProjectUploadsPage({
  projectId,
  onOpenUpload,
}: ProjectUploadsPageProps) {
  const project = useProject(projectId);
  const uploads = useInfiniteQuery({
    queryKey: ["uploads", projectId],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (
        await listUploads({
          path: { projectId },
          query: { limit: 50, cursor: pageParam },
          signal,
          throwOnError: true,
        })
      ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = uploads.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="workspace-uploads-page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label text-muted">{project.data?.name}</p>
          <h1 className="text-title font-heading">Figma 자료</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="자료 새로고침"
          disabled={uploads.isFetching}
          onClick={() => void uploads.refetch()}
        >
          <WorkspaceIcon name="refresh" />
        </Button>
      </div>
      {project.isError && (
        <p role="alert" className="text-danger">
          {uploadError(project.error, "프로젝트를 불러오지 못했습니다.")}
        </p>
      )}
      {uploads.isPending && <LoadingSkeleton />}
      {uploads.isError && (
        <div role="alert" className="space-y-3 text-danger">
          <p>
            {uploadError(
              uploads.error,
              "Figma 자료를 불러오지 못했습니다. 다시 불러와주세요.",
            )}
          </p>
          <Button variant="outline" onClick={() => void uploads.refetch()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {uploads.isSuccess && items.length === 0 && (
        <Surface>
          <p className="text-muted">
            Figma 자료가 없습니다. Figma 플러그인에서 화면을 업로드해주세요.
          </p>
        </Surface>
      )}
      <ul className="workspace-collection">
        {items.map((upload) => (
          <li key={upload.id}>
            <button
              type="button"
              onClick={() => onOpenUpload(upload.id)}
              className="workspace-document-row"
            >
              <span className="workspace-document-symbol">
                <WorkspaceIcon name="image" />
              </span>
              <span>
                <strong>{upload.name}</strong>
                <small>
                  <span>화면 {upload.frameCount}개</span>{" "}
                  <time dateTime={upload.createdAt}>
                    {date(upload.createdAt)}
                  </time>
                </small>
              </span>
              <WorkspaceIcon name="arrow" />
            </button>
          </li>
        ))}
      </ul>
      {uploads.hasNextPage && (
        <Button
          variant="outline"
          disabled={uploads.isFetchingNextPage}
          onClick={() => void uploads.fetchNextPage()}
        >
          자료 더 보기
        </Button>
      )}
    </div>
  );
}

function UploadTestScenarios({
  projectId,
  uploadId,
  uploadName,
  onOpenTestScenario,
  gateway,
}: {
  projectId: string;
  uploadId: string;
  uploadName: string;
  onOpenTestScenario: (testScenarioId: string) => void;
  gateway: UploadTestScenarioGateway;
}) {
  const queryClient = useQueryClient();
  const [newTestScenarioOpen, setNewTestScenarioOpen] = useState(false);
  const [name, setName] = useState(uploadName.slice(0, 100));
  const [kind, setKind] = useState<"unit" | "integration">("unit");
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const testScenarios = useInfiniteQuery({
    queryKey: ["upload-testScenarios", projectId, uploadId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => gateway.list(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  async function create() {
    if (creatingRef.current || uncertain || !name.trim()) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    let testScenarioId: string | undefined;
    try {
      const result = await gateway.create({
        name: name.trim(),
        kind,
        uploadId,
      });
      testScenarioId = result.id;
    } catch (caught) {
      const safeError = uploadError(
        caught,
        "시나리오 생성 결과를 확인하지 못했습니다.",
      );
      if (safeError === "시나리오 생성 결과를 확인하지 못했습니다.") {
        setUncertain(true);
        setError(safeError);
      } else setError(safeError);
    } finally {
      setCreating(false);
      creatingRef.current = false;
    }
    if (testScenarioId) {
      void queryClient.invalidateQueries({
        queryKey: ["upload-testScenarios", projectId, uploadId],
      });
      if (mounted.current) onOpenTestScenario(testScenarioId);
    }
  }
  const items = testScenarios.data?.pages.flatMap((page) => page.items) ?? [];
  async function refresh() {
    const result = await testScenarios.refetch();
    if (result.isSuccess) {
      setUncertain(false);
      setError("");
    }
  }
  return (
    <section
      aria-labelledby="upload-testScenarios"
      className="upload-scenario-strip"
    >
      <h2 id="upload-testScenarios" className="upload-scenario-heading">
        테스트 시나리오
      </h2>
      <div className="upload-scenario-content">
        {testScenarios.isPending && (
          <p role="status" className="text-muted">
            시나리오 조회 중
          </p>
        )}
        {testScenarios.isError && (
          <p role="alert" className="text-danger">
            {uploadError(
              testScenarios.error,
              "시나리오를 불러오지 못했습니다. 다시 불러와주세요.",
            )}
          </p>
        )}
        {testScenarios.isSuccess && items.length === 0 && (
          <p className="text-label text-muted">시나리오 연결이 없습니다.</p>
        )}
        <ul className="upload-scenario-chips">
          {items.map((testScenario) => (
            <li key={testScenario.id}>
              <Button
                variant="ghost"
                size="sm"
                className="upload-scenario-chip"
                onClick={() => onOpenTestScenario(testScenario.id)}
              >
                <span>{testScenario.name}</span>
                <span className="upload-scenario-kind">
                  {testScenario.kind === "unit" ? "단위 테스트" : "통합 테스트"}
                </span>
              </Button>
            </li>
          ))}
        </ul>
        {testScenarios.hasNextPage && (
          <Button
            variant="ghost"
            size="sm"
            disabled={testScenarios.isFetchingNextPage || creating}
            onClick={() => void testScenarios.fetchNextPage()}
          >
            시나리오 더 보기
          </Button>
        )}
      </div>
      <div className="upload-scenario-actions">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setNewTestScenarioOpen(true)}
        >
          <WorkspaceIcon name="plus" />
          시나리오 만들기
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="시나리오 새로고침"
          disabled={testScenarios.isFetching || creating}
          onClick={() => void refresh()}
        >
          <WorkspaceIcon name="refresh" />
        </Button>
      </div>
      <Dialog open={newTestScenarioOpen} onOpenChange={setNewTestScenarioOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>새 시나리오</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-test-scenario-name">시나리오 이름</Label>
                <Input
                  id="new-test-scenario-name"
                  value={name}
                  onValueChange={setName}
                  maxLength={100}
                  required
                  disabled={creating || uncertain}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-test-scenario-kind">시나리오 종류</Label>
                <Select
                  items={[
                    { value: "unit", label: "단위 테스트" },
                    { value: "integration", label: "통합 테스트" },
                  ]}
                  value={kind}
                  onValueChange={(value) => {
                    if (value === "unit" || value === "integration")
                      setKind(value);
                  }}
                  disabled={creating || uncertain}
                >
                  <SelectTrigger id="new-test-scenario-kind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unit">단위 테스트</SelectItem>
                    <SelectItem value="integration">통합 테스트</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {error && (
              <p role="alert" className="text-label text-danger">
                {error}
              </p>
            )}
            {uncertain && (
              <p className="text-label text-muted">
                시나리오 목록을 새로고침해 생성 결과를 확인해주세요. 목록에
                없다면 다시 만들어주세요.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                creating ||
                uncertain ||
                !testScenarios.isSuccess
              }
            >
              {creating ? "시나리오 생성 중" : "시나리오 만들기"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function ProjectUploadDetailPage({
  projectId,
  uploadId,
  onBack,
  onOpenTestScenario,
  testScenarioGateway,
}: ProjectUploadDetailPageProps) {
  const upload = useQuery({
    queryKey: ["upload", projectId, uploadId],
    queryFn: async ({ signal }) =>
      (
        await getUpload({
          path: { projectId, uploadId },
          signal,
          throwOnError: true,
        })
      ).data,
  });
  return (
    <div className="workspace-upload-detail upload-gallery-page">
      <header className="upload-gallery-heading">
        <Button
          variant="outline"
          size="icon"
          aria-label="Figma 자료"
          onClick={onBack}
        >
          <WorkspaceIcon name="back" />
        </Button>
        {upload.data && (
          <>
            <h1 className="upload-gallery-title">{upload.data.name}</h1>
            <p className="upload-gallery-meta">
              <span>화면 {upload.data.frames.length}개</span>
              <time dateTime={upload.data.createdAt}>
                {date(upload.data.createdAt)}
              </time>
            </p>
          </>
        )}
      </header>
      {upload.isPending && <LoadingSkeleton />}
      {upload.isError && (
        <div role="alert" className="space-y-3">
          <p className="text-danger">
            {uploadError(
              upload.error,
              "Figma 자료를 불러오지 못했습니다. 다시 불러와주세요.",
            )}
          </p>
          <Button variant="outline" onClick={() => void upload.refetch()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {upload.data && (
        <>
          {testScenarioGateway && (
            <UploadTestScenarios
              key={`${projectId}/${uploadId}`}
              projectId={projectId}
              uploadId={uploadId}
              uploadName={upload.data.name}
              onOpenTestScenario={onOpenTestScenario}
              gateway={testScenarioGateway}
            />
          )}
          <section
            aria-labelledby="upload-frames"
            className="upload-gallery-frames"
          >
            <h2 id="upload-frames" className="text-heading font-heading">
              화면
            </h2>
            {upload.data.frames.length === 0 && (
              <p className="workspace-empty">화면이 없습니다.</p>
            )}
            <ol className="workspace-frame-gallery">
              {upload.data.frames.map((frame) => (
                <li key={frame.id}>
                  <Surface className="workspace-frame-card">
                    <div>
                      <h3 className="break-words text-heading font-heading">
                        {frame.name}
                      </h3>
                      <p className="text-label text-muted">
                        {Math.round(frame.width)} × {Math.round(frame.height)}
                      </p>
                    </div>
                    <FramePreview
                      projectId={projectId}
                      fileId={frame.imageFileId}
                      name={frame.name}
                    />
                    <FrameDataDownload
                      projectId={projectId}
                      fileId={frame.dataFileId}
                      name={frame.name}
                    />
                  </Surface>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
