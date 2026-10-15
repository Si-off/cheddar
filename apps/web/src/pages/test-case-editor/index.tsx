import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
} from "@cheddar/ui";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { env } from "@/shared/config/env";
import { SheetEditor } from "./editor";
import {
  createEmptySheet,
  downloadSheet,
  framesForUpload,
  projectPage,
  readSheet,
  referenceOptions,
  saveTransport,
  sheetPage,
} from "./sheets-api";

export type TestCaseEditorPageProps = {
  projectId?: string;
  sheetId?: string;
  onOpenSheet?: (target: { projectId: string; sheetId: string }) => void;
  onBack?: () => void;
};
export function TestCaseEditorPage({
  projectId,
  sheetId,
  onOpenSheet,
  onBack,
}: TestCaseEditorPageProps = {}) {
  const queryClient = useQueryClient();
  const [selectedProject, setSelectedProject] = useState("");
  const [localSheet, setLocalSheet] = useState<string>();
  const [listMode, setListMode] = useState(false);
  const activeProject = projectId ?? selectedProject;
  const activeSheet = listMode ? undefined : (sheetId ?? localSheet);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [kind, setKind] = useState<"unit" | "integration">("unit");
  const projects = useInfiniteQuery({
    queryKey: ["projects"],
    queryFn: ({ pageParam }) => projectPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const sheets = useInfiniteQuery({
    queryKey: ["sheets", activeProject],
    queryFn: ({ pageParam }) => sheetPage(activeProject, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!activeProject,
  });
  const snapshot = useQuery({
    queryKey: ["sheet", activeProject, activeSheet],
    queryFn: () => readSheet(activeProject, activeSheet as string),
    enabled: !!activeProject && !!activeSheet,
    retry: false,
  });
  const references = useQuery({
    queryKey: ["sheet-reference-options", activeProject],
    queryFn: () => referenceOptions(activeProject),
    enabled: !!activeProject && !!activeSheet,
    retry: false,
  });
  function openSheet(target: { projectId: string; sheetId: string }) {
    setListMode(false);
    if (onOpenSheet) onOpenSheet(target);
    else {
      setSelectedProject(target.projectId);
      setLocalSheet(target.sheetId);
    }
  }
  const create = useMutation({
    mutationFn: () => createEmptySheet(activeProject, name.trim(), kind),
    retry: false,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(
        ["sheet", snapshot.projectId, snapshot.id],
        snapshot,
      );
      void queryClient.invalidateQueries({
        queryKey: ["sheets", activeProject],
      });
      setCreating(false);
      setName("");
      openSheet({ projectId: snapshot.projectId, sheetId: snapshot.id });
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: ["sheets", activeProject],
      });
    },
  });
  const transport = useMemo(
    () => (activeSheet ? saveTransport(activeProject, activeSheet) : undefined),
    [activeProject, activeSheet],
  );
  const loadFrames = useCallback(
    (id: string) => framesForUpload(activeProject, id),
    [activeProject],
  );
  if (sheetId && !projectId)
    return <p role="alert">프로젝트와 시트를 목록에서 다시 선택해주세요.</p>;
  if (activeSheet && snapshot.isPending)
    return <p role="status">시트를 불러오는 중</p>;
  if (activeSheet && snapshot.isError && !snapshot.data)
    return (
      <div>
        <p role="alert">{snapshot.error.message}</p>
        <Button onClick={() => void snapshot.refetch()}>다시 불러오기</Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (onBack) onBack();
            else {
              setListMode(true);
              setLocalSheet(undefined);
            }
          }}
        >
          시트 목록
        </Button>
      </div>
    );
  if (activeSheet && snapshot.data && transport)
    return (
      <>
        <SheetEditor
          key={`${activeProject}/${activeSheet}`}
          snapshot={snapshot.data}
          transport={transport}
          origin={env.apiBaseUrl}
          uploads={references.data?.uploads ?? []}
          iaItems={references.data?.iaItems ?? snapshot.data.references.iaItems}
          loadFrames={loadFrames}
          onDownload={downloadSheet}
          onBack={() => {
            if (onBack) onBack();
            else {
              setListMode(true);
              setLocalSheet(undefined);
            }
          }}
        />
        {snapshot.isError && (
          <p role="alert">
            시트의 최신 저장 내용을 확인하지 못했습니다. 편집 중인 입력은
            유지됩니다.{" "}
            <Button
              variant="link"
              disabled={snapshot.isFetching}
              onClick={() => void snapshot.refetch()}
            >
              다시 확인
            </Button>
          </p>
        )}
        {references.isError && (
          <p role="alert">
            프레임·IA 목록을 불러오지 못했습니다.{" "}
            <Button variant="link" onClick={() => void references.refetch()}>
              목록 다시 불러오기
            </Button>
          </p>
        )}
      </>
    );
  return (
    <section className="flex flex-col gap-5" aria-label="시트 목록">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-title font-heading">테스트 케이스</h1>
        <Button
          disabled={!activeProject}
          onClick={() => {
            create.reset();
            setCreating(true);
          }}
        >
          새 시트
        </Button>
      </div>
      <div>
        <Label htmlFor="sheet-project">프로젝트</Label>
        <select
          className="sheet-select"
          id="sheet-project"
          value={activeProject}
          disabled={!!projectId}
          onChange={(e) => {
            setSelectedProject(e.target.value);
            setLocalSheet(undefined);
          }}
        >
          <option value="">프로젝트 선택</option>
          {projects.data?.pages
            .flatMap((page) => page.items)
            .map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        {projects.hasNextPage && (
          <Button
            variant="link"
            disabled={projects.isFetchingNextPage}
            onClick={() => void projects.fetchNextPage()}
          >
            프로젝트 더 불러오기
          </Button>
        )}
        {projects.isError && (
          <p role="alert">
            프로젝트를 불러오지 못했습니다.{" "}
            <Button variant="link" onClick={() => void projects.refetch()}>
              다시 불러오기
            </Button>
          </p>
        )}
      </div>
      {activeProject && (
        <div>
          {sheets.isPending ? (
            <p role="status">시트를 불러오는 중</p>
          ) : sheets.isError ? (
            <p role="alert">
              시트 목록을 불러오지 못했습니다.{" "}
              <Button variant="link" onClick={() => void sheets.refetch()}>
                다시 불러오기
              </Button>
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-3">
                {sheets.data?.pages
                  .flatMap((page) => page.items)
                  .map((sheet) => (
                    <li key={sheet.id}>
                      <Button
                        variant="outline"
                        onClick={() =>
                          openSheet({
                            projectId: activeProject,
                            sheetId: sheet.id,
                          })
                        }
                      >
                        {sheet.name} · {sheet.kind === "unit" ? "단위" : "통합"}
                      </Button>
                    </li>
                  ))}
              </ul>
              {sheets.data?.pages.every((page) => page.items.length === 0) && (
                <p>시트가 없습니다</p>
              )}
              {sheets.hasNextPage && (
                <Button
                  variant="link"
                  disabled={sheets.isFetchingNextPage}
                  onClick={() => void sheets.fetchNextPage()}
                >
                  시트 더 불러오기
                </Button>
              )}
            </>
          )}
        </div>
      )}
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!create.isPending) setCreating(open);
        }}
      >
        <DialogContent>
          <DialogTitle>새 시트</DialogTitle>
          <DialogDescription>
            프로젝트 기본 양식으로 빈 시트를 만듭니다.
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !create.isPending) create.mutate();
            }}
          >
            <Label htmlFor="new-sheet-name">시트 이름</Label>
            <Input
              id="new-sheet-name"
              value={name}
              onValueChange={setName}
              maxLength={100}
              required
              disabled={create.isPending}
            />
            <Label htmlFor="new-sheet-kind" className="mt-4">
              케이스 종류
            </Label>
            <select
              id="new-sheet-kind"
              className="sheet-select"
              value={kind}
              disabled={create.isPending}
              onChange={(e) =>
                setKind(e.target.value as "unit" | "integration")
              }
            >
              <option value="unit">단위</option>
              <option value="integration">통합</option>
            </select>
            {create.isError && (
              <p className="mt-3 text-danger" role="alert">
                {create.error.message} 생성 결과가 불명확하면 목록을 먼저
                확인해주세요.
              </p>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                disabled={create.isPending}
                onClick={() => setCreating(false)}
              >
                취소
              </Button>
              <Button type="submit" disabled={!name.trim() || create.isPending}>
                {create.isPending ? "만드는 중" : "시트 만들기"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
