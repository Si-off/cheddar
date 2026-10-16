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
} from "@cheddar/ui";
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
  CreateSheetDto,
  SheetPageDto,
  SheetSnapshotDto,
} from "@/shared/api/generated/types.gen";
import { LoadingSkeleton } from "@/shared/ui/workspace";
import { FrameDataDownload, FramePreview } from "./frame-preview";
import { uploadError } from "./uploads-api";

export type ProjectUploadsPageProps = {
  projectId: string;
  onOpenUpload: (uploadId: string) => void;
};
export type UploadSheetGateway = {
  list: (cursor?: string) => Promise<SheetPageDto>;
  create: (input: CreateSheetDto) => Promise<SheetSnapshotDto>;
};
export type ProjectUploadDetailPageProps = {
  projectId: string;
  uploadId: string;
  onBack: () => void;
  onOpenSheet: (sheetId: string) => void;
  sheetGateway?: UploadSheetGateway;
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label text-muted">{project.data?.name}</p>
          <h1 className="text-display font-heading">화면 자료</h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="자료 새로고침"
          disabled={uploads.isFetching}
          onClick={() => void uploads.refetch()}
        >
          <WorkspaceIcon name="settings" />
        </Button>
      </div>
      {project.isError && (
        <p role="alert" className="text-danger">
          {uploadError(project.error, "프로젝트를 불러오지 못했습니다.")}
        </p>
      )}
      {uploads.isPending && <LoadingSkeleton />}
      {uploads.isError && (
        <p role="alert" className="text-danger">
          {uploadError(
            uploads.error,
            "업로드를 불러오지 못했습니다. 다시 불러와주세요.",
          )}
        </p>
      )}
      {uploads.isSuccess && items.length === 0 && (
        <Surface>
          <p className="text-muted">
            업로드가 없습니다. Figma 플러그인에서 이 프로젝트에 프레임을
            업로드해주세요.
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
                  화면 {upload.frameCount}개 · {date(upload.createdAt)}
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
          업로드 더 보기
        </Button>
      )}
    </div>
  );
}

function UploadSheets({
  projectId,
  uploadId,
  uploadName,
  onOpenSheet,
  gateway,
}: {
  projectId: string;
  uploadId: string;
  uploadName: string;
  onOpenSheet: (sheetId: string) => void;
  gateway: UploadSheetGateway;
}) {
  const queryClient = useQueryClient();
  const [newSheetOpen, setNewSheetOpen] = useState(false);
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
  const sheets = useInfiniteQuery({
    queryKey: ["upload-sheets", projectId, uploadId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => gateway.list(pageParam),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  async function create() {
    if (creatingRef.current || uncertain || !name.trim()) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    let sheetId: string | undefined;
    try {
      const result = await gateway.create({
        name: name.trim(),
        kind,
        uploadId,
      });
      sheetId = result.id;
    } catch (caught) {
      const safeError = uploadError(
        caught,
        "시트 생성 결과를 확인하지 못했습니다.",
      );
      if (safeError === "시트 생성 결과를 확인하지 못했습니다.") {
        setUncertain(true);
        setError(safeError);
      } else setError(safeError);
    } finally {
      setCreating(false);
      creatingRef.current = false;
    }
    if (sheetId) {
      void queryClient.invalidateQueries({
        queryKey: ["upload-sheets", projectId, uploadId],
      });
      if (mounted.current) onOpenSheet(sheetId);
    }
  }
  const items = sheets.data?.pages.flatMap((page) => page.items) ?? [];
  async function refresh() {
    const result = await sheets.refetch();
    if (result.isSuccess) {
      setUncertain(false);
      setError("");
    }
  }
  return (
    <section aria-labelledby="upload-sheets" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id="upload-sheets" className="text-heading font-heading">
          테스트 시트
        </h2>
        <Button
          variant="outline"
          disabled={sheets.isFetching || creating}
          onClick={() => void refresh()}
        >
          시트 새로고침
        </Button>
      </div>
      {sheets.isPending && (
        <p role="status" className="text-muted">
          시트 불러오는 중
        </p>
      )}
      {sheets.isError && (
        <p role="alert" className="text-danger">
          {uploadError(
            sheets.error,
            "시트를 불러오지 못했습니다. 다시 불러와주세요.",
          )}
        </p>
      )}
      {sheets.isSuccess && items.length === 0 && (
        <p className="text-label text-muted">연결된 시트가 없습니다.</p>
      )}
      <ul className="flex flex-wrap gap-2">
        {items.map((sheet) => (
          <li key={sheet.id}>
            <Button variant="outline" onClick={() => onOpenSheet(sheet.id)}>
              {sheet.name} · {sheet.kind === "unit" ? "단위" : "통합"}
            </Button>
          </li>
        ))}
      </ul>
      {sheets.hasNextPage && (
        <Button
          variant="ghost"
          disabled={sheets.isFetchingNextPage || creating}
          onClick={() => void sheets.fetchNextPage()}
        >
          시트 더 보기
        </Button>
      )}
      <Button onClick={() => setNewSheetOpen(true)}>
        <WorkspaceIcon name="plus" />
        시트 만들기
      </Button>
      <Dialog open={newSheetOpen} onOpenChange={setNewSheetOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>새 시트</DialogTitle>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-sheet-name">시트 이름</Label>
                <Input
                  id="new-sheet-name"
                  value={name}
                  onValueChange={setName}
                  maxLength={100}
                  required
                  disabled={creating || uncertain}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-sheet-kind">시트 종류</Label>
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
                  <SelectTrigger id="new-sheet-kind" className="w-full">
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
                시트 목록을 새로고침해 생성된 시트를 확인해주세요. 목록에 없다면
                다시 만들어주세요.
              </p>
            )}
            <Button
              type="submit"
              disabled={
                !name.trim() || creating || uncertain || !sheets.isSuccess
              }
            >
              {creating ? "시트 만드는 중" : "시트 만들기"}
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
  onOpenSheet,
  sheetGateway,
}: ProjectUploadDetailPageProps) {
  const project = useProject(projectId);
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
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        업로드 목록
      </Button>
      {upload.isPending && <LoadingSkeleton />}
      {upload.isError && (
        <div role="alert" className="space-y-3">
          <p className="text-danger">
            {uploadError(
              upload.error,
              "업로드를 불러오지 못했습니다. 다시 불러와주세요.",
            )}
          </p>
          <Button variant="outline" onClick={() => void upload.refetch()}>
            다시 불러오기
          </Button>
        </div>
      )}
      {upload.data && (
        <>
          <header>
            <p className="text-label text-muted">{project.data?.name}</p>
            <h1 className="break-words text-title font-heading">
              {upload.data.name}
            </h1>
            <p className="mt-2 text-label text-muted">
              프레임 {upload.data.frames.length}개 ·{" "}
              {date(upload.data.createdAt)}
            </p>
          </header>
          {sheetGateway && (
            <UploadSheets
              key={`${projectId}/${uploadId}`}
              projectId={projectId}
              uploadId={uploadId}
              uploadName={upload.data.name}
              onOpenSheet={onOpenSheet}
              gateway={sheetGateway}
            />
          )}
          <section aria-labelledby="upload-frames" className="space-y-4">
            <h2 id="upload-frames" className="text-heading font-heading">
              화면
            </h2>
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
