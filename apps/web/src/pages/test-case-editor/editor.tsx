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
} from "@cheddar/ui";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  clearDraft,
  displayValue,
  type FrameReference,
  type IaReference,
  listDrafts,
  newCase,
  type SaveTransport,
  SheetSession,
  type Snapshot,
  type StoredDraft,
} from "@/entities/test-case";
import { EvidencePanel } from "@/pages/project-uploads/evidence-panel";
import { SourceViewer } from "@/pages/project-uploads/source-viewer";
import { SharedSheetView } from "@/pages/shared-test-cases";
import { MenuAction } from "@/shared/ui/workspace";
import { TestCaseTable } from "@/widgets/test-case-table";
import { ColumnSettings } from "@/widgets/test-case-table/column-settings";
import { DetailPanel } from "./detail-panel";
import { GenerationPanel } from "./generation-panel";
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
  saved: "저장됨",
  dirty: "저장 대기",
  saving: "저장 중",
  error: "저장하지 못함",
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

export function SheetEditor({
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
    () => new SheetSession(snapshot, transport, origin),
  );
  const state = useStore(session.store);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [detailId, setDetailId] = useState<string>();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDepth, setSettingsDepth] = useState<
    "root" | "layout" | "columns"
  >("root");
  const [layout, setLayout] = useState<"table" | "qa">("table");
  const [hidden, setHidden] = useState<Set<string>>(
    () =>
      new Set(
        snapshot.columns
          .filter((c) => c.field === "priority" || c.field === "relatedFrames")
          .map((c) => c.id),
      ),
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [generationPanel, setGenerationPanel] = useState<
    "generate" | "candidates" | null
  >(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
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
      return !(await session.settle());
    },
    enableBeforeUnload: () => session.store.getState().status !== "saved",
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
        if (live) setMessage("보관한 초안을 불러오지 못했습니다.");
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
            "프레임 목록을 불러오지 못했습니다. 업로드 묶음을 다시 선택해주세요.",
          );
      });
    return () => {
      live = false;
    };
  }, [uploadId, detailId, sourceOpen, loadFrames]);
  useEffect(() => {
    if (!evidenceOpen) return;
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
  }, [evidenceOpen, uploads, loadFrames]);
  const change = useCallback(
    (next: Snapshot) => session.edit(() => next),
    [session],
  );
  const item = state.draft.cases.find((c) => c.id === detailId);
  const disabled = busy || generationLocked;
  function details(id: string) {
    if (sourceOpen) {
      setSelected(new Set([id]));
      return;
    }
    returnFocus.current = document.activeElement as HTMLElement;
    setDetailId(id);
  }
  function closeDetails() {
    setDetailId(undefined);
    queueMicrotask(() => returnFocus.current?.focus());
  }
  async function back() {
    const saved = await session.settle();
    if (saved) onBack();
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
    void session.retain().then((ok) => {
      if (live) setRetained(ok);
    });
    return () => {
      live = false;
    };
  }, [leaving, session]);
  async function download() {
    setMessage(undefined);
    setBusy(true);
    try {
      if (!(await session.settle())) {
        setMessage(
          "저장을 마친 뒤 내보낼 수 있습니다. 저장 상태를 확인해주세요.",
        );
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
  function removeRows() {
    const count = state.draft.cases.filter((c) => selected.has(c.id)).length;
    setConfirm({
      title: "케이스 삭제",
      description: `선택한 케이스 ${count}개를 삭제할까요?`,
      action: () => {
        session.edit((current) => ({
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
    const count = state.draft.cases.filter((c) => !!c.customValues[id]).length;
    setConfirm({
      title: "사용자 열 삭제",
      description: `${column?.name} 열과 케이스 ${count}개에 입력된 값을 삭제할까요?`,
      action: () =>
        session.edit((current) => ({
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
  return (
    <section className="sheet-editor" aria-label="시트 편집">
      <div className="workspace-sheet-topline">
        <Button
          variant="ghost"
          size="icon"
          aria-label="시트 목록"
          onClick={() => void back()}
          disabled={busy}
        >
          <WorkspaceIcon name="back" />
        </Button>
        <span className="sheet-status" role="status">
          {statusLabels[state.status]}
        </span>
        {state.status === "error" && (
          <Button
            variant="link"
            disabled={disabled}
            onClick={() => void session.retry()}
          >
            저장 다시 시도
          </Button>
        )}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="시트 메뉴"
                className="workspace-sheet-menu"
              />
            }
          >
            <WorkspaceIcon name="more" />
          </PopoverTrigger>
          <PopoverContent aria-label="시트 메뉴">
            <MenuAction
              icon="generate"
              disabled={disabled}
              onClick={() => {
                setMenuOpen(false);
                setGenerationPanel("generate");
              }}
            >
              테스트 생성
            </MenuAction>
            <MenuAction
              icon="qa"
              disabled={disabled}
              onClick={() => {
                setMenuOpen(false);
                setGenerationPanel("candidates");
              }}
            >
              후보 검토
            </MenuAction>
            <MenuAction
              icon="download"
              disabled={
                disabled ||
                ["conflict", "error", "invalid"].includes(state.status)
              }
              onClick={() => {
                setMenuOpen(false);
                void download();
              }}
            >
              XLSX 내보내기
            </MenuAction>
            <MenuAction
              icon="share"
              onClick={() => {
                setMenuOpen(false);
                setShareOpen(true);
              }}
            >
              공유 시트 미리보기
            </MenuAction>
          </PopoverContent>
        </Popover>
      </div>
      <div className="workspace-sheet-title">
        <WorkspaceIcon name="file" />
        <h1>{state.draft.name}</h1>
      </div>
      <GenerationPanel
        snapshot={state.draft}
        session={session}
        uploads={uploads}
        seed={generationSeed}
        onResults={() => setGenerationPanel("candidates")}
        onLock={setGenerationLocked}
        panel={generationPanel}
        onClose={() => setGenerationPanel(null)}
      />
      {state.message && (
        <div className="sheet-notice" role="alert">
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
        <p className="sheet-notice" role="alert">
          {state.storageError}
        </p>
      )}
      {message && (
        <p className="sheet-notice" role="alert">
          {message}
        </p>
      )}
      {recovery.length > 0 && (
        <div className="sheet-notice">
          <h2 className="text-label font-label">보관한 미저장 입력</h2>
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
                    title: "보관한 초안 삭제",
                    description:
                      "이 브라우저에 보관한 미저장 입력을 삭제할까요?",
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
        <span className="workspace-current-view">
          <WorkspaceIcon name={layout === "table" ? "columns" : "qa"} />
          {layout === "table" ? "표" : "QA 진행"}
        </span>
        <span className="workspace-count">{state.draft.cases.length}개</span>
        <div className="workspace-table-actions">
          {searchOpen && (
            <Input
              id="case-search"
              aria-label="테스트 검색"
              value={query}
              onValueChange={setQuery}
              autoFocus
            />
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="검색"
            onClick={() => {
              setSearchOpen(!searchOpen);
              setQuery("");
            }}
          >
            <WorkspaceIcon name="search" />
          </Button>
          <Popover
            open={settingsOpen}
            onOpenChange={(open) => {
              setSettingsOpen(open);
              if (open) setSettingsDepth("root");
            }}
          >
            <PopoverTrigger
              render={
                <Button variant="ghost" size="icon" aria-label="보기 설정" />
              }
            >
              <WorkspaceIcon name="settings" />
            </PopoverTrigger>
            <PopoverContent aria-label="보기 설정">
              <div className="workspace-popover-heading">
                {settingsDepth !== "root" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="이전 설정"
                    onClick={() => setSettingsDepth("root")}
                  >
                    <WorkspaceIcon name="back" />
                  </Button>
                )}
                <strong>
                  {settingsDepth === "root"
                    ? "보기 설정"
                    : settingsDepth === "layout"
                      ? "레이아웃"
                      : "열"}
                </strong>
              </div>
              {settingsDepth === "root" ? (
                <>
                  <MenuAction
                    icon="columns"
                    onClick={() => setSettingsDepth("layout")}
                  >
                    레이아웃
                  </MenuAction>
                  <MenuAction
                    icon="settings"
                    onClick={() => setSettingsDepth("columns")}
                  >
                    열
                  </MenuAction>
                </>
              ) : settingsDepth === "layout" ? (
                <div className="workspace-layout-options">
                  {(["table", "qa"] as const).map((value) => (
                    <button
                      type="button"
                      key={value}
                      aria-pressed={layout === value}
                      onClick={() => {
                        setLayout(value);
                        setSettingsOpen(false);
                      }}
                    >
                      <WorkspaceIcon
                        name={value === "table" ? "columns" : "qa"}
                      />
                      <span>{value === "table" ? "표" : "QA 진행"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <ColumnSettings
                  columns={state.draft.columns}
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
                    session.edit((s) => ({ ...s, columns, view }))
                  }
                  onRemove={removeColumn}
                />
              )}
            </PopoverContent>
          </Popover>
          <Button
            size="icon"
            aria-label="행 추가"
            disabled={disabled}
            onClick={() =>
              session.edit((current) => {
                const added = newCase();
                return { ...current, cases: [...current.cases, added] };
              })
            }
          >
            <WorkspaceIcon name="plus" />
          </Button>
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
      <div className="source-toolbar authoring-actions">
        {!state.draft.cases.length && (
          <Button
            disabled={disabled}
            onClick={() => setGenerationPanel("generate")}
          >
            케이스 생성
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          aria-label="원본 대조"
          onClick={() => setSourceOpen((open) => !open)}
        >
          <WorkspaceIcon name="image" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="근거 수정"
          onClick={() => setEvidenceOpen(true)}
        >
          <WorkspaceIcon name="settings" />
        </Button>
      </div>
      <EvidencePanel
        open={evidenceOpen}
        onClose={() => setEvidenceOpen(false)}
        snapshot={state.draft}
        frames={[
          ...new Map(
            [...frames, ...state.draft.references.frames].map((f) => [f.id, f]),
          ).values(),
        ]}
        onGenerate={(requirementIds, description) => {
          setEvidenceOpen(false);
          setGenerationSeed({ requirementIds, description });
          setGenerationPanel("generate");
        }}
      />
      <div
        className={
          sourceOpen ? "sheet-editor-body has-source" : "sheet-editor-body"
        }
      >
        <div className="sheet-editor-table">
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
        </div>
        {sourceOpen && (
          <SourceViewer
            key={[...selected][0] ?? "source"}
            projectId={snapshot.projectId}
            caseId={[...selected][0]}
            frames={[
              ...new Map(
                [...frames, ...state.draft.references.frames].map((f) => [
                  f.id,
                  f,
                ]),
              ).values(),
            ].filter((f) => {
              const active = state.draft.cases.find(
                (c) => c.id === [...selected][0],
              );
              return !active || active.relatedFrameIds.includes(f.id);
            })}
            onClose={() => setSourceOpen(false)}
          />
        )}
        <Dialog
          open={!!item}
          onOpenChange={(open) => {
            if (!open) closeDetails();
          }}
        >
          <DialogContent
            className="workspace-sheet-dialog"
            aria-describedby={undefined}
          >
            <DialogTitle>테스트 편집</DialogTitle>
            {item && (
              <DetailPanel
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
                  session.edit((current) => ({
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
                          [...current.references.iaItems, ...iaItems].map(
                            (i) => [i.id, i],
                          ),
                        ).values(),
                      ],
                    },
                  }))
                }
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent
          className="workspace-share-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>공유 시트 미리보기</DialogTitle>
          <SharedSheetView snapshot={state.draft} hidden={hidden} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={leaving}
        onOpenChange={(open) => {
          if (!open) cancelLeave();
        }}
      >
        <DialogContent>
          <DialogTitle>저장되지 않은 입력이 있습니다</DialogTitle>
          <DialogDescription>
            {retained === undefined
              ? "입력을 보관하는 중입니다."
              : retained
                ? "입력을 이 브라우저에 보관했습니다. 이동한 뒤 시트를 열어 초안을 복원할 수 있습니다."
                : "입력을 이 브라우저에 보관하지 못했습니다. 이 화면에서 저장을 마친 뒤 이동해주세요."}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={cancelLeave}>
              계속 편집
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void session.retry().then(async () => {
                  if (session.store.getState().status === "saved")
                    proceedLeave();
                  else setRetained(await session.retain());
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
            내 입력을 복사해 최신 내용에 다시 반영할 수 있습니다. 최신 내용으로
            편집을 시작해도 이전 입력은 초안으로 보관됩니다.
          </DialogDescription>
          <div className="sheet-comparison">
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
                  state.latest
                    ? draftText(state.latest)
                    : "최신 내용을 불러오는 중"
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
