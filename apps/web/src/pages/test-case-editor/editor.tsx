import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  Input,
  Label,
  Textarea,
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
import { TestCaseTable } from "@/widgets/test-case-table";
import { DetailPanel } from "./detail-panel";
import "./editor.css";

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
  const [columnSettings, setColumnSettings] = useState(false);
  const [message, setMessage] = useState<string>();
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
    if (!uploadId || !detailId) return;
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
  }, [uploadId, detailId, loadFrames]);
  const change = useCallback(
    (next: Snapshot) => session.edit(() => next),
    [session],
  );
  const item = state.draft.cases.find((c) => c.id === detailId);
  const disabled = busy;
  function details(id: string) {
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" onClick={() => void back()} disabled={busy}>
            시트 목록
          </Button>
          <h1 className="text-title font-heading">{state.draft.name}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="sheet-status" role="status">
            {statusLabels[state.status]}
          </span>
          {state.status === "error" && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void session.retry()}
            >
              저장 다시 시도
            </Button>
          )}
          <Button
            disabled={
              busy ||
              state.status === "conflict" ||
              state.status === "error" ||
              state.status === "invalid"
            }
            onClick={() => void download()}
          >
            전체 시트 XLSX 내보내기
          </Button>
        </div>
      </div>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex-1">
          <Label htmlFor="case-search">케이스 검색</Label>
          <Input id="case-search" value={query} onValueChange={setQuery} />
        </div>
        <Button
          variant="secondary"
          disabled={disabled}
          onClick={() =>
            session.edit((current) => {
              const item = newCase();
              return { ...current, cases: [...current.cases, item] };
            })
          }
        >
          행 추가
        </Button>
        <Button
          variant="outline"
          disabled={disabled || !selected.size}
          onClick={removeRows}
        >
          선택 행 삭제
        </Button>
        <Button
          variant="outline"
          disabled={disabled || selected.size !== 1}
          onClick={() => {
            const [id] = selected;
            if (id) details(id);
          }}
        >
          상세 편집
        </Button>
        <Button
          variant="outline"
          onClick={() => setColumnSettings(!columnSettings)}
          aria-expanded={columnSettings}
        >
          열 설정
        </Button>
      </div>
      <div className="sheet-editor-body">
        <div className="sheet-editor-table">
          <TestCaseTable
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
        {item && (
          <DetailPanel
            snapshot={state.draft}
            item={item}
            disabled={disabled}
            frames={frames.filter(
              (f) =>
                f.uploadId === uploadId || item.relatedFrameIds.includes(f.id),
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
                cases: current.cases.map((c) => (c.id === next.id ? next : c)),
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
        )}
      </div>
      {columnSettings && (
        <section className="sheet-column-settings" aria-label="열 설정">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-heading font-heading">열 설정</h2>
            <Button
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                session.edit((current) => {
                  const id = crypto.randomUUID();
                  return {
                    ...current,
                    columns: [
                      ...current.columns,
                      { id, kind: "custom", name: "새 열", valueType: "text" },
                    ],
                    view: [...current.view, { columnId: id, width: 180 }],
                  };
                })
              }
            >
              텍스트 열 추가
            </Button>
          </div>
          {state.draft.view.map((v, index) => {
            const column = state.draft.columns.find((c) => c.id === v.columnId);
            if (!column) return null;
            return (
              <div className="sheet-column-row" key={v.columnId}>
                <div className="sheet-column-name">
                  <Label htmlFor={`name-${column.id}`}>열 이름</Label>
                  <Input
                    id={`name-${column.id}`}
                    value={column.name}
                    disabled={disabled}
                    onValueChange={(name) =>
                      session.edit((s) => ({
                        ...s,
                        columns: s.columns.map((c) =>
                          c.id === column.id ? { ...c, name } : c,
                        ),
                      }))
                    }
                  />
                </div>
                <div className="sheet-width">
                  <Label htmlFor={`width-${column.id}`}>너비</Label>
                  <Input
                    id={`width-${column.id}`}
                    type="number"
                    min={1}
                    value={v.width}
                    disabled={disabled}
                    onValueChange={(value) => {
                      const width = Number(value);
                      if (Number.isInteger(width) && width > 0)
                        session.edit((s) => ({
                          ...s,
                          view: s.view.map((c) =>
                            c.columnId === column.id ? { ...c, width } : c,
                          ),
                        }));
                    }}
                  />
                </div>
                {([-1, 1] as const).map((direction) => (
                  <Button
                    key={direction}
                    variant="outline"
                    disabled={
                      disabled ||
                      index + direction < 0 ||
                      index + direction >= state.draft.view.length
                    }
                    aria-label={`${column.name} 열 ${direction < 0 ? "앞으로" : "뒤로"} 이동`}
                    onClick={() =>
                      session.edit((s) => {
                        const view = [...s.view];
                        [view[index], view[index + direction]] = [
                          view[index + direction],
                          view[index],
                        ];
                        return { ...s, view };
                      })
                    }
                  >
                    {direction < 0 ? "앞으로" : "뒤로"}
                  </Button>
                ))}
                {column.kind === "custom" && (
                  <Button
                    variant="ghost"
                    disabled={disabled}
                    onClick={() => removeColumn(column.id)}
                  >
                    열 삭제
                  </Button>
                )}
              </div>
            );
          })}
        </section>
      )}
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
              disabled={!state.latest}
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
