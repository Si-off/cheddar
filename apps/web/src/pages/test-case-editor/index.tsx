import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { env } from "@/shared/config/env";
import { LoadingSkeleton, WorkspaceSelect } from "@/shared/ui/workspace";
import { TestScenarioEditor } from "./editor";
import {
  createEmptyTestScenario,
  createProjectNamed,
  downloadTestScenario,
  framesForUpload,
  projectPage,
  readTestScenario,
  referenceOptions,
  saveTransport,
  testScenarioPage,
} from "./test-scenarios-api";

export type TestCaseEditorPageProps = {
  projectId?: string;
  testScenarioId?: string;
  onOpenTestScenario?: (target: {
    projectId: string;
    testScenarioId: string;
  }) => void;
  onBack?: () => void;
  onOpenProject?: (projectId: string) => void;
};
export function TestCaseEditorPage({
  projectId,
  testScenarioId,
  onOpenTestScenario,
  onBack,
  onOpenProject,
}: TestCaseEditorPageProps = {}) {
  const queryClient = useQueryClient();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [selectedProject, setSelectedProject] = useState("");
  const [localTestScenario, setLocalTestScenario] = useState<string>();
  const [listMode, setListMode] = useState(false);
  const activeProject = projectId ?? selectedProject;
  const activeTestScenario = listMode
    ? undefined
    : (testScenarioId ?? localTestScenario);
  const [creating, setCreating] = useState(false),
    [name, setName] = useState(""),
    [kind, setKind] = useState<"unit" | "integration">("unit");
  const projects = useInfiniteQuery({
    queryKey: ["projects"],
    queryFn: ({ pageParam }) => projectPage(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const testScenarios = useInfiniteQuery({
    queryKey: ["test_scenarios", activeProject],
    queryFn: ({ pageParam }) => testScenarioPage(activeProject, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: !!activeProject,
  });
  const snapshot = useQuery({
    queryKey: ["testScenario", activeProject, activeTestScenario],
    queryFn: () =>
      readTestScenario(activeProject, activeTestScenario as string),
    enabled: !!activeProject && !!activeTestScenario,
    retry: false,
  });
  const references = useQuery({
    queryKey: ["test-scenario-reference-options", activeProject],
    queryFn: () => referenceOptions(activeProject),
    enabled: !!activeProject && !!activeTestScenario,
    retry: false,
  });
  function openTestScenario(target: {
    projectId: string;
    testScenarioId: string;
  }) {
    setListMode(false);
    if (onOpenTestScenario) onOpenTestScenario(target);
    else {
      setSelectedProject(target.projectId);
      setLocalTestScenario(target.testScenarioId);
    }
  }
  const create = useMutation({
    mutationFn: () => createEmptyTestScenario(activeProject, name.trim(), kind),
    retry: false,
    onSuccess: (snapshot) => {
      queryClient.setQueryData(
        ["testScenario", snapshot.projectId, snapshot.id],
        snapshot,
      );
      void queryClient.invalidateQueries({
        queryKey: ["test_scenarios", activeProject],
      });
      setCreating(false);
      setName("");
      openTestScenario({
        projectId: snapshot.projectId,
        testScenarioId: snapshot.id,
      });
    },
    onError: () => {
      void queryClient.invalidateQueries({
        queryKey: ["test_scenarios", activeProject],
      });
    },
  });
  const createProject = useMutation({
    mutationFn: () => createProjectNamed(projectName.trim()),
    retry: false,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      setSelectedProject(project.id);
      onOpenProject?.(project.id);
      setNewProjectOpen(false);
      setProjectName("");
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
  const transport = useMemo(
    () =>
      activeTestScenario
        ? saveTransport(activeProject, activeTestScenario)
        : undefined,
    [activeProject, activeTestScenario],
  );
  const loadFrames = useCallback(
    (id: string) => framesForUpload(activeProject, id),
    [activeProject],
  );
  if (testScenarioId && !projectId)
    return (
      <p role="alert">프로젝트와 시나리오를 목록에서 다시 선택해주세요.</p>
    );
  if (activeTestScenario && snapshot.isPending)
    return <LoadingSkeleton table />;
  if (activeTestScenario && snapshot.isError && !snapshot.data)
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
              setLocalTestScenario(undefined);
            }
          }}
        >
          시나리오 목록
        </Button>
      </div>
    );
  if (activeTestScenario && snapshot.data && transport)
    return (
      <>
        <TestScenarioEditor
          key={`${activeProject}/${activeTestScenario}`}
          snapshot={snapshot.data}
          transport={transport}
          origin={env.apiBaseUrl}
          uploads={references.data?.uploads ?? []}
          iaItems={references.data?.iaItems ?? snapshot.data.references.iaItems}
          loadFrames={loadFrames}
          onDownload={downloadTestScenario}
          onBack={() => {
            if (onBack) onBack();
            else {
              setListMode(true);
              setLocalTestScenario(undefined);
            }
          }}
        />
        {snapshot.isError && (
          <p role="alert">
            시나리오의 최신 저장 내용을 확인하지 못했습니다. 현재 입력은
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
            화면 자료와 화면 구조를 불러오지 못했습니다.{" "}
            <Button variant="link" onClick={() => void references.refetch()}>
              목록 다시 불러오기
            </Button>
          </p>
        )}
      </>
    );
  return (
    <section className="flex flex-col gap-5" aria-label="시나리오 목록">
      <div className="workspace-page-heading">
        <h1>{activeProject ? "테스트 시나리오" : "프로젝트"}</h1>
        <Button
          variant="default"
          aria-label={activeProject ? "새 시나리오" : "새 프로젝트"}
          onClick={() => {
            if (activeProject) {
              create.reset();
              setCreating(true);
            } else {
              createProject.reset();
              setNewProjectOpen(true);
            }
          }}
        >
          <WorkspaceIcon name="plus" />
          {activeProject ? "새 시나리오" : "새 프로젝트"}
        </Button>
      </div>
      <Dialog
        open={newProjectOpen}
        onOpenChange={(open) => {
          if (!createProject.isPending) setNewProjectOpen(open);
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>새 프로젝트</DialogTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (projectName.trim() && !createProject.isPending)
                createProject.mutate();
            }}
          >
            <Label htmlFor="new-project-name">프로젝트 이름</Label>
            <Input
              id="new-project-name"
              value={projectName}
              onValueChange={setProjectName}
              maxLength={100}
              required
              disabled={createProject.isPending}
            />
            {createProject.isError && (
              <p role="alert">
                {createProject.error.message} 다시 만들기 전에 프로젝트 목록을
                확인해주세요.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={createProject.isPending}
                onClick={() => setNewProjectOpen(false)}
              >
                취소
              </Button>
              <Button
                type="submit"
                disabled={!projectName.trim() || createProject.isPending}
              >
                {createProject.isPending ? "생성 중" : "프로젝트 만들기"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!activeProject && (
        <section className="workspace-collection" aria-label="프로젝트 목록">
          {projects.isPending ? (
            <LoadingSkeleton />
          ) : projects.isError ? (
            <div role="alert">
              프로젝트를 불러오지 못했습니다.{" "}
              <Button variant="link" onClick={() => void projects.refetch()}>
                다시 불러오기
              </Button>
            </div>
          ) : (
            <>
              {projects.data?.pages
                .flatMap((page) => page.items)
                .map((p) => (
                  <button
                    type="button"
                    className="workspace-document-row"
                    key={p.id}
                    onClick={() => {
                      if (onOpenProject) onOpenProject(p.id);
                      else setSelectedProject(p.id);
                    }}
                  >
                    <span className="workspace-document-symbol">
                      <WorkspaceIcon name="folder" />
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      {p.description && <small>{p.description}</small>}
                    </span>
                    <time className="workspace-row-date" dateTime={p.updatedAt}>
                      {new Date(p.updatedAt).toLocaleDateString("ko-KR")}
                    </time>
                    <WorkspaceIcon name="chevron" />
                  </button>
                ))}
              {projects.data?.pages.every((page) => !page.items.length) && (
                <div className="workspace-empty">
                  <WorkspaceIcon name="folder" />
                  <p>프로젝트가 없습니다</p>
                  <Button onClick={() => setNewProjectOpen(true)}>
                    프로젝트 만들기
                  </Button>
                </div>
              )}
            </>
          )}
          {projects.hasNextPage && (
            <Button
              variant="ghost"
              disabled={projects.isFetchingNextPage}
              onClick={() => void projects.fetchNextPage()}
            >
              프로젝트 더 불러오기
            </Button>
          )}
        </section>
      )}
      {activeProject && (
        <div>
          {testScenarios.isPending ? (
            <LoadingSkeleton />
          ) : testScenarios.isError ? (
            <p role="alert">
              시나리오 목록을 불러오지 못했습니다.{" "}
              <Button
                variant="link"
                onClick={() => void testScenarios.refetch()}
              >
                다시 불러오기
              </Button>
            </p>
          ) : (
            <>
              <ul className="workspace-collection">
                {testScenarios.data?.pages
                  .flatMap((page) => page.items)
                  .map((testScenario) => (
                    <li key={testScenario.id}>
                      <Button
                        variant="ghost"
                        className="workspace-document-row"
                        onClick={() =>
                          openTestScenario({
                            projectId: activeProject,
                            testScenarioId: testScenario.id,
                          })
                        }
                      >
                        <span className="workspace-document-symbol">
                          <WorkspaceIcon name="file" />
                        </span>
                        <span>
                          <strong>{testScenario.name}</strong>
                          <small>
                            {testScenario.kind === "unit"
                              ? "단위 테스트"
                              : "통합 테스트"}
                          </small>
                        </span>
                        <time
                          className="workspace-row-date"
                          dateTime={testScenario.updatedAt}
                        >
                          {new Date(testScenario.updatedAt).toLocaleDateString(
                            "ko-KR",
                          )}
                        </time>
                        <WorkspaceIcon name="arrow" />
                      </Button>
                    </li>
                  ))}
              </ul>
              {testScenarios.data?.pages.every(
                (page) => page.items.length === 0,
              ) && (
                <div className="workspace-empty">
                  <WorkspaceIcon name="file" />
                  <p>시나리오가 없습니다</p>
                  <Button onClick={() => setCreating(true)}>
                    시나리오 만들기
                  </Button>
                </div>
              )}
              {testScenarios.hasNextPage && (
                <Button
                  variant="link"
                  disabled={testScenarios.isFetchingNextPage}
                  onClick={() => void testScenarios.fetchNextPage()}
                >
                  시나리오 더 불러오기
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
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>새 시나리오</DialogTitle>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim() && !create.isPending) create.mutate();
            }}
          >
            <Label htmlFor="new-test-scenario-name">시나리오 이름</Label>
            <Input
              id="new-test-scenario-name"
              value={name}
              onValueChange={setName}
              maxLength={100}
              required
              disabled={create.isPending}
            />
            <Label htmlFor="new-test-scenario-kind" className="mt-4">
              테스트 범위
            </Label>
            <WorkspaceSelect
              id="new-test-scenario-kind"
              value={kind}
              disabled={create.isPending}
              onValueChange={(value) =>
                setKind(value as "unit" | "integration")
              }
              options={[
                { value: "unit", label: "단위 테스트" },
                { value: "integration", label: "통합 테스트" },
              ]}
            />
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
                {create.isPending ? "생성 중" : "시나리오 만들기"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
