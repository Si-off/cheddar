import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import { useBlocker } from "@tanstack/react-router";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useStore } from "zustand";
import {
  clearDraft,
  displayValue,
  type FrameReference,
  type IaReference,
  listDrafts,
  newCase,
  type SaveTransport,
  type Snapshot,
  type StoredDraft,
  TestScenarioSession,
} from "@/entities/test-case";
import { AnalysisPanel } from "@/pages/project-uploads/analysis-panel";
import { SourceViewer } from "@/pages/project-uploads/source-viewer";
import { SharedTestScenarioView } from "@/pages/shared-test-cases";
import { MenuAction } from "@/shared/ui/workspace";
import { TestCaseTable } from "@/widgets/test-case-table";
import { ColumnSettings } from "@/widgets/test-case-table/column-settings";
import { type CanvasGuard, canvasReferenceCount } from "./canvas-session";
import { DetailPanel } from "./detail-panel";
import { GenerationPanel } from "./generation-panel";

const ScenarioCanvas = lazy(() =>
  import("./scenario-canvas").then((module) => ({
    default: module.ScenarioCanvas,
  })),
);

import "./editor.css";
import "./authoring.css";

type Props = {
  snapshot: Snapshot;
  transport: SaveTransport;
  uploads: { id: string; name: string }[];
  iaItems: IaReference[];
  loadFrames: (id: string) => Promise<FrameReference[]>;
  onDownload: (snapshot: Snapshot) => Promise<void>;
  onBack: () => void;
  origin: string;
};
const statusLabels = {
  saved: "저장 완료",
  dirty: "저장 대기",
  saving: "저장 중",
  error: "저장 실패",
  conflict: "변경 충돌",
  invalid: "입력 확인 필요",
};
function draftText(snapshot: Snapshot) {
  const columns = snapshot.view
    .map((v) => snapshot.columns.find((c) => c.id === v.columnId))
    .filter((c) => !!c);
  const quote = (value: string) =>
    /[\t\r\n"]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return [
    columns.map((c) => c.name),
    ...snapshot.cases.map((item) =>
      columns.map((c) => displayValue(snapshot, item, c)),
    ),
  ]
    .map((row) => row.map(quote).join("\t"))
    .join("\n");
}

export function TestScenarioEditor({
  snapshot,
  transport,
  uploads,
  iaItems,
  loadFrames,
  onDownload,
  onBack,
  origin,
}: Props) {
  const [session] = useState(
    () => new TestScenarioSession(snapshot, transport, origin),
  );
  const state = useStore(session.store);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [layout, setLayout] = useState<"table" | "qa" | "canvas">("table");
  const [canvasOpened, setCanvasOpened] = useState(false);
  const canvasGuard = useRef<CanvasGuard | null>(null);
  const setCanvasGuard = useCallback((guard: CanvasGuard | null) => {
    canvasGuard.current = guard;
  }, []);
  const edit = useCallback(
    (update: (current: Snapshot) => Snapshot) => {
      const before = session.store.getState().draft;
      const after = update(before);
      canvasGuard.current?.recordCases(before.cases, after.cases);
      session.edit(() => after);
    },
    [session],
  );
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [generationPanel, setGenerationPanel] = useState<
    "generate" | "results" | null
  >(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmationUnsafe, setConfirmationUnsafe] = useState(false);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia("(max-width: 60rem)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 60rem)");
    const update = () => setNarrow(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [generationSeed, setGenerationSeed] = useState<{
    requirementIds: string[];
    description: string;
  }>();
  const [shareOpen, setShareOpen] = useState(false);
  const [message, setMessage] = useState<string>();
  const [generationLocked, setGenerationLocked] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comparison, setComparison] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<() => void>();
  const [retained, setRetained] = useState<boolean>();
  const allowLeave = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: async () => {
      if (allowLeave.current) {
        allowLeave.current = false;
        return false;
      }
      return (
        confirmationUnsafe ||
        !(await session.settle()) ||
        (canvasGuard.current ? !(await canvasGuard.current.settle()) : false)
      );
    },
    enableBeforeUnload: () =>
      confirmationUnsafe ||
      session.store.getState().status !== "saved" ||
      !!canvasGuard.current?.dirty(),
    withResolver: true,
  });
  const [recovery, setRecovery] = useState<StoredDraft[]>([]);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => void;
  }>();
  const [uploadId, setUploadId] = useState(snapshot.uploadId ?? "");
  const [frames, setFrames] = useState<FrameReference[]>(
    snapshot.references.frames,
  );
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    session.activate();
    return () => session.dispose();
  }, [session]);
  useEffect(() => {
    let live = true;
    void listDrafts(origin, snapshot.projectId, snapshot.id)
      .then((drafts) => {
        if (live) setRecovery(drafts);
      })
      .catch(() => {
        if (live) setMessage("초안을 불러오지 못했습니다.");
      });
    return () => {
      live = false;
    };
  }, [origin, snapshot.projectId, snapshot.id]);
  useEffect(() => {
    if (!uploadId || (!detailId && !sourceOpen)) return;
    let live = true;
    void loadFrames(uploadId)
      .then((next) => {
        if (live)
          setFrames((old) => [
            ...new Map([...old, ...next].map((f) => [f.id, f])).values(),
          ]);
      })
      .catch(() => {
        if (live)
          setMessage(
            "프레임 목록을 불러오지 못했습니다. Figma 자료를 다시 선택해주세요.",
          );
      });
    return () => {
      live = false;
    };
  }, [uploadId, detailId, sourceOpen, loadFrames]);
  useEffect(() => {
    if (!analysisOpen) return;
    let live = true;
    void Promise.all(uploads.map((upload) => loadFrames(upload.id)))
      .then((groups) => {
        if (live)
          setFrames((old) => [
            ...new Map(
              [...old, ...groups.flat()].map((f) => [f.id, f]),
            ).values(),
          ]);
      })
      .catch(() => {
        if (live) setMessage("화면 자료를 불러오지 못했습니다.");
      });
    return () => {
      live = false;
    };
  }, [analysisOpen, uploads, loadFrames]);
  const change = useCallback((next: Snapshot) => edit(() => next), [edit]);
  const item = state.draft.cases.find((c) => c.id === detailId);
  const disabled = busy || generationLocked;
  function details(id: string) {
    returnFocus.current = document.activeElement as HTMLElement;
    setDetailId(id);
    setSourceOpen(false);
  }
  function closeDetails() {
    setDetailId(undefined);
    setSourceOpen(false);
    queueMicrotask(() => returnFocus.current?.focus());
  }
  async function back() {
    const saved = await session.settle();
    if (
      saved &&
      !confirmationUnsafe &&
      (!canvasGuard.current || (await canvasGuard.current.settle()))
    )
      onBack();
    else setPendingLeave(() => onBack);
  }
  function cancelLeave() {
    setPendingLeave(undefined);
    if (blocker.status === "blocked") blocker.reset();
  }
  function proceedLeave() {
    const action = pendingLeave;
    setPendingLeave(undefined);
    if (blocker.status === "blocked") blocker.proceed();
    else if (action) {
      allowLeave.current = true;
      action();
    }
  }
  const leaving = !!pendingLeave || blocker.status === "blocked";
  useEffect(() => {
    if (!leaving) return;
    let live = true;
    setRetained(undefined);
    void Promise.all([
      session.retain(),
      canvasGuard.current?.retain() ?? Promise.resolve(true),
    ]).then(([ok, canvasOk]) => {
      if (live) setRetained(ok && canvasOk && !confirmationUnsafe);
    });
    return () => {
      live = false;
    };
  }, [leaving, session, confirmationUnsafe]);
  async function download() {
    setMessage(undefined);
    setBusy(true);
    try {
      if (!(await session.settle())) {
        setMessage("시나리오 저장 후 다시 내보내주세요.");
        return;
      }
      await onDownload(session.store.getState().base);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "내보내지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeRows() {
    let connections: { saved: number; additional: number };
    try {
      connections = await canvasReferenceCount(
        snapshot.projectId,
        snapshot.id,
        selected,
        canvasGuard.current,
      );
    } catch {
      setMessage("연결된 흐름을 확인하지 못했습니다. 다시 삭제해주세요.");
      return;
    }
    const count = state.draft.cases.filter((c) => selected.has(c.id)).length;
    setConfirm({
      title: "테스트 케이스 삭제",
      description: `테스트 케이스 ${count}개를 삭제할까요?${connections.saved ? ` 저장된 흐름의 단계 ${connections.saved}곳에서 연결이 해제됩니다.` : ""}${connections.additional ? ` 미저장 흐름의 단계 ${connections.additional}곳에서도 선택한 케이스의 연결이 해제됩니다.` : ""}`,
      action: () => {
        edit((current) => ({
          ...current,
          cases: current.cases.filter((c) => !selected.has(c.id)),
        }));
        setSelected(new Set());
      },
    });
  }
  function removeColumn(id: string) {
    setSettingsOpen(false);
    const column = state.draft.columns.find((c) => c.id === id);
    const count = state.draft.cases.filter((c) =>
      Object.hasOwn(c.customValues, id),
    ).length;
    setConfirm({
      title: "사용자 열 삭제",
      description: `${column?.name} 열과 테스트 케이스 ${count}개의 값을 삭제할까요?`,
      action: () =>
        edit((current) => ({
          ...current,
          columns: current.columns.filter((c) => c.id !== id),
          view: current.view.filter((c) => c.columnId !== id),
          cases: current.cases.map((c) => ({
            ...c,
            customValues: Object.fromEntries(
              Object.entries(c.customValues).filter(([key]) => key !== id),
            ),
          })),
        })),
    });
  }
  const inspectedCase =
    item ?? state.draft.cases.find((c) => c.id === [...selected][0]);
  const inspectorContent = (
    <>
      <div className="workspace-inspector-heading">
        <fieldset className="workspace-view-switch" aria-label="케이스 패널">
          {inspectedCase && (
            <Button
              variant="ghost"
              aria-pressed={!sourceOpen}
              onClick={() => {
                setDetailId(inspectedCase.id);
                setSourceOpen(false);
              }}
            >
              케이스 편집
            </Button>
          )}
          <Button
            variant="ghost"
            aria-pressed={sourceOpen}
            onClick={() => setSourceOpen(true)}
          >
            관련 자료
          </Button>
        </fieldset>
        {!narrow && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="패널 닫기"
            onClick={closeDetails}
          >
            <WorkspaceIcon name="close" />
          </Button>
        )}
      </div>
      <div className="workspace-inspector-content">
        {sourceOpen ? (
          <SourceViewer
            embedded
            key={inspectedCase?.id ?? "source"}
            projectId={snapshot.projectId}
            caseId={inspectedCase?.id}
            frames={[
              ...new Map(
                [...frames, ...state.draft.references.frames].map((f) => [
                  f.id,
                  f,
                ]),
              ).values(),
            ].filter(
              (f) =>
                !inspectedCase || inspectedCase.relatedFrameIds.includes(f.id),
            )}
          />
        ) : (
          item && (
            <DetailPanel
              embedded
              snapshot={state.draft}
              item={item}
              disabled={disabled}
              frames={frames.filter(
                (f) =>
                  f.uploadId === uploadId ||
                  item.relatedFrameIds.includes(f.id),
              )}
              iaItems={iaItems}
              uploads={uploads}
              uploadId={uploadId}
              onUpload={setUploadId}
              onComposition={(active) => session.composition(active)}
              onClose={closeDetails}
              onChange={(next) =>
                edit((current) => ({
                  ...current,
                  cases: current.cases.map((c) =>
                    c.id === next.id ? next : c,
                  ),
                  references: {
                    frames: [
                      ...new Map(
                        [...current.references.frames, ...frames].map((f) => [
                          f.id,
                          f,
                        ]),
                      ).values(),
                    ],
                    iaItems: [
                      ...new Map(
                        [...current.references.iaItems, ...iaItems].map((i) => [
                          i.id,
                          i,
                        ]),
                      ).values(),
                    ],
                  },
                }))
              }
            />
          )
        )}
      </div>
    </>
  );
  return (
    <section className="test-scenario-editor" aria-label="시나리오 편집">
      <header className="workspace-editor-heading">
        <div className="workspace-editor-identity">
          <Button
            variant="ghost"
            size="icon"
            aria-label="시나리오 목록"
            onClick={() => void back()}
            disabled={busy}
          >
            <WorkspaceIcon name="back" />
          </Button>
          <h1>{state.draft.name}</h1>
          <span className="workspace-kind">
            {state.draft.kind === "unit" ? "단위 테스트" : "통합 테스트"}
          </span>
        </div>
        <div className="workspace-editor-primary">
          <span
            className={`test-scenario-status is-${state.status}`}
            role="status"
          >
            {state.status === "saved" && <WorkspaceIcon name="check" />}
            {statusLabels[state.status]}
          </span>
          {state.status === "error" && (
            <Button
              variant="link"
              disabled={disabled}
              onClick={() => void session.retry()}
            >
              저장 재시도
            </Button>
          )}
          <Button
            disabled={disabled}
            onClick={() => setGenerationPanel("generate")}
          >
            <WorkspaceIcon name="generate" />
            테스트 케이스 생성
          </Button>
          <Button
            variant="outline"
            disabled={
              disabled ||
              ["conflict", "error", "invalid"].includes(state.status)
            }
            aria-label="XLSX 내보내기"
            onClick={() => void download()}
          >
            <WorkspaceIcon name="download" />
            <span>XLSX 내보내기</span>
          </Button>
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="시나리오 메뉴"
                />
              }
            >
              <WorkspaceIcon name="more" />
            </PopoverTrigger>
            <PopoverContent aria-label="시나리오 메뉴">
              <MenuAction
                icon="share"
                onClick={() => {
                  setMenuOpen(false);
                  setShareOpen(true);
                }}
              >
                시나리오 미리보기
              </MenuAction>
              <MenuAction
                icon="settings"
                onClick={() => {
                  setMenuOpen(false);
                  setAnalysisOpen(true);
                }}
              >
                화면 분석
              </MenuAction>
              <MenuAction
                icon="qa"
                onClick={() => {
                  setMenuOpen(false);
                  setGenerationPanel("results");
                }}
              >
                확인 항목
              </MenuAction>
            </PopoverContent>
          </Popover>
        </div>
      </header>
      <GenerationPanel
        snapshot={state.draft}
        session={session}
        uploads={uploads}
        seed={generationSeed}
        onResults={() => setGenerationPanel("results")}
        onLock={setGenerationLocked}
        onPendingCount={setPendingCount}
        onUnsafeDraftChange={setConfirmationUnsafe}
        panel={generationPanel}
        onClose={() => setGenerationPanel(null)}
      />
      {state.message && (
        <div className="test-scenario-notice" role="alert">
          {state.message}
          {state.status === "conflict" && (
            <Button
              variant="link"
              onClick={() => {
                setComparison(true);
                void session
                  .loadLatest()
                  .catch(() =>
                    setMessage(
                      "최신 내용을 불러오지 못했습니다. 다시 시도해주세요.",
                    ),
                  );
              }}
            >
              내 입력과 최신 내용 확인
            </Button>
          )}
        </div>
      )}
      {state.storageError && state.status !== "saved" && (
        <p className="test-scenario-notice" role="alert">
          {state.storageError}
        </p>
      )}
      {message && (
        <p className="test-scenario-notice" role="alert">
          {message}
        </p>
      )}
      {recovery.length > 0 && (
        <div className="test-scenario-notice">
          <h2 className="text-label font-label">미저장 초안</h2>
          {recovery.map((record) => (
            <div
              key={record.key}
              className="mt-2 flex flex-wrap items-center gap-3"
            >
              <span>{new Date(record.updatedAt).toLocaleString("ko-KR")}</span>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  session.restore(record);
                  setRecovery([]);
                }}
              >
                초안 복원
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  setConfirm({
                    title: "초안 삭제",
                    description: "이 브라우저에 미저장 초안을 삭제할까요?",
                    action: () => {
                      void clearDraft(record.key)
                        .then(() =>
                          setRecovery((list) =>
                            list.filter((r) => r.key !== record.key),
                          ),
                        )
                        .catch(() =>
                          setMessage(
                            "초안을 삭제하지 못했습니다. 다시 시도해주세요.",
                          ),
                        );
                    },
                  })
                }
              >
                초안 삭제
              </Button>
            </div>
          ))}
        </div>
      )}
      <div className="workspace-table-toolbar">
        <div className="workspace-search">
          <WorkspaceIcon name="search" />
          <Input
            id="case-search"
            aria-label="테스트 케이스 검색"
            placeholder="테스트 검색"
            value={query}
            onValueChange={setQuery}
          />
        </div>
        <fieldset className="workspace-view-switch" aria-label="보기 방식">
          {(["table", "qa", "canvas"] as const).map((value) => (
            <Button
              key={value}
              variant="ghost"
              aria-pressed={layout === value}
              onClick={() => {
                setLayout(value);
                if (value === "canvas") setCanvasOpened(true);
              }}
            >
              <WorkspaceIcon name={value === "table" ? "columns" : "qa"} />
              {value === "table"
                ? "표"
                : value === "qa"
                  ? "상세 보기"
                  : "캔버스"}
            </Button>
          ))}
        </fieldset>
        <span className="workspace-count">{state.draft.cases.length}개</span>
        <div className="workspace-table-actions">
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger
              render={<Button variant="ghost" aria-label="열 설정" />}
            >
              <WorkspaceIcon name="settings" />열 설정
            </PopoverTrigger>
            <PopoverContent aria-label="열 설정">
              <div className="workspace-popover-heading">
                <strong>열 설정</strong>
              </div>
              <ColumnSettings
                columns={state.draft.columns}
                cases={state.draft.cases}
                view={state.draft.view}
                disabled={disabled}
                hidden={hidden}
                onVisibility={(id) =>
                  setHidden((old) => {
                    const next = new Set(old);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
                onChange={(columns, view) =>
                  edit((s) => ({ ...s, columns, view }))
                }
                onClearValues={(id) => {
                  setSettingsOpen(false);
                  const column = state.draft.columns.find((c) => c.id === id);
                  const count = state.draft.cases.filter((c) =>
                    Object.hasOwn(c.customValues, id),
                  ).length;
                  setConfirm({
                    title: "열 값 비우기",
                    description: `${column?.name} 열의 테스트 케이스 ${count}개 값을 비울까요?`,
                    action: () =>
                      edit((current) => ({
                        ...current,
                        cases: current.cases.map((item) => ({
                          ...item,
                          customValues: Object.fromEntries(
                            Object.entries(item.customValues).filter(
                              ([key]) => key !== id,
                            ),
                          ),
                        })),
                      })),
                  });
                }}
                onRemove={removeColumn}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            aria-label="테스트 케이스 추가"
            disabled={disabled}
            onClick={() =>
              edit((current) => ({
                ...current,
                cases: [...current.cases, newCase()],
              }))
            }
          >
            <WorkspaceIcon name="plus" />
            케이스 추가
          </Button>
          <Button
            variant="ghost"
            aria-label="관련 자료 보기"
            aria-pressed={sourceOpen}
            onClick={() => {
              returnFocus.current = document.activeElement as HTMLElement;
              setSourceOpen(!sourceOpen);
            }}
          >
            <WorkspaceIcon name="image" />
            <span>관련 자료</span>
          </Button>
          {pendingCount > 0 && (
            <Button
              variant="outline"
              className="workspace-confirmation-trigger"
              onClick={() => setGenerationPanel("results")}
            >
              <WorkspaceIcon name="warning" />
              확인 항목 <span>{pendingCount}</span>
            </Button>
          )}
        </div>
      </div>
      {selected.size > 0 && (
        <div className="workspace-selection">
          <span>{selected.size}개 선택</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="선택 행 삭제"
            disabled={disabled}
            onClick={removeRows}
          >
            <WorkspaceIcon name="trash" />
          </Button>
          {selected.size === 1 && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="상세 편집"
              disabled={disabled}
              onClick={() => {
                const [id] = selected;
                if (id) details(id);
              }}
            >
              <WorkspaceIcon name="file" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="선택 해제"
            onClick={() => setSelected(new Set())}
          >
            <WorkspaceIcon name="close" />
          </Button>
        </div>
      )}
      <AnalysisPanel
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
        snapshot={state.draft}
        frames={[
          ...new Map(
            [...frames, ...state.draft.references.frames].map((f) => [f.id, f]),
          ).values(),
        ]}
        onGenerate={(requirementIds, description) => {
          setAnalysisOpen(false);
          setGenerationSeed({ requirementIds, description });
          setGenerationPanel("generate");
        }}
      />
      <div
        className={`test-scenario-editor-body${item || sourceOpen ? " has-inspector" : ""}`}
      >
        <div className="test-scenario-editor-table">
          {layout !== "canvas" && (
            <TestCaseTable
              layout={layout}
              hidden={hidden}
              key={snapshot.id}
              snapshot={state.draft}
              query={query}
              disabled={disabled}
              selected={selected}
              onSelected={setSelected}
              onChange={change}
              onComposition={(active) => session.composition(active)}
              onDetails={details}
              onError={setMessage}
            />
          )}
          {canvasOpened && (
            <Suspense fallback={<p role="status">캔버스 불러오는 중</p>}>
              <ScenarioCanvas
                active={layout === "canvas"}
                snapshot={state.draft}
                disabled={disabled}
                query={query}
                origin={origin}
                onEdit={details}
                onSources={(id) => {
                  setDetailId(id);
                  setSourceOpen(true);
                }}
                getSaved={() => session.store.getState().base}
                settleCases={() => session.settle()}
                onCases={(cases) =>
                  session.edit((current) => ({ ...current, cases }))
                }
                onGuard={setCanvasGuard}
              />
            </Suspense>
          )}
        </div>
        {!narrow && (item || sourceOpen) && (
          <aside
            className="workspace-inspector"
            aria-label={sourceOpen ? "관련 자료" : "테스트 케이스 편집"}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeDetails();
              }
            }}
          >
            {inspectorContent}
          </aside>
        )}
      </div>
      <Dialog
        open={narrow && (!!item || sourceOpen)}
        onOpenChange={(open) => {
          if (!open) closeDetails();
        }}
      >
        <DialogContent
          className="workspace-detail-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>
            {sourceOpen ? "관련 자료" : "테스트 케이스 편집"}
          </DialogTitle>
          {inspectorContent}
        </DialogContent>
      </Dialog>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent
          className="workspace-share-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>시나리오 미리보기</DialogTitle>
          <SharedTestScenarioView snapshot={state.draft} hidden={hidden} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={leaving}
        onOpenChange={(open) => {
          if (!open) cancelLeave();
        }}
      >
        <DialogContent>
          <DialogTitle>미저장 입력</DialogTitle>
          <DialogDescription>
            {retained === undefined
              ? "입력을 보관 중입니다."
              : retained
                ? "입력을 이 브라우저에 보관했습니다. 이동 후 시나리오를 열어 초안을 복원해주세요."
                : "입력을 이 브라우저에 보관하지 못했습니다. 이 화면에서 저장 후 이동해주세요."}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={cancelLeave}>
              계속 편집
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void session.retry().then(async () => {
                  if (
                    session.store.getState().status === "saved" &&
                    !confirmationUnsafe
                  )
                    proceedLeave();
                  else
                    setRetained(
                      (await session.retain()) && !confirmationUnsafe,
                    );
                });
              }}
            >
              저장 후 이동
            </Button>
            <Button disabled={!retained} onClick={proceedLeave}>
              초안 보관 후 이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      >
        <DialogContent>
          <DialogTitle>{confirm?.title}</DialogTitle>
          <DialogDescription>{confirm?.description}</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(undefined)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={() => {
                const action = confirm?.action;
                setConfirm(undefined);
                action?.();
              }}
            >
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={comparison} onOpenChange={setComparison}>
        <DialogContent>
          <DialogTitle>내 입력과 최신 내용</DialogTitle>
          <DialogDescription>
            내 입력을 복사해 최신 내용에 다시 반영해주세요. 최신 내용으로 편집을
            시작해도 이전 입력은 초안으로 보관됩니다.
          </DialogDescription>
          <div className="test-scenario-comparison">
            <div>
              <Label htmlFor="my-draft">내 입력</Label>
              <Textarea id="my-draft" readOnly value={draftText(state.draft)} />
            </div>
            <div>
              <Label htmlFor="latest-draft">최신 내용</Label>
              <Textarea
                id="latest-draft"
                readOnly
                value={
                  state.latest ? draftText(state.latest) : "최신 내용 조회 중"
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComparison(false)}>
              닫기
            </Button>
            <Button
              disabled={disabled || !state.latest}
              onClick={() => {
                session.startFromLatest();
                setComparison(false);
              }}
            >
              최신 내용으로 편집
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {state.backup && (
        <details>
          <summary>이전 입력</summary>
          <Textarea
            aria-label="이전 입력 내용"
            value={draftText(state.backup)}
            readOnly
          />
        </details>
      )}
    </section>
  );
}
