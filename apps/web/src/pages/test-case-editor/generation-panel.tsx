import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
  WorkspaceIcon,
} from "@cheddar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  SaveError,
  type SheetSession,
  type Snapshot,
} from "@/entities/test-case";
import type {
  CandidateDto,
  GenerationDto,
  ReviewCandidateDto,
  StartGenerationDto,
} from "@/shared/api/generated";
import {
  beginGeneration,
  generationList,
  generationProviders,
  updateCandidate,
} from "./sheets-api";

type Props = {
  snapshot: Snapshot;
  session: SheetSession;
  uploads: { id: string; name: string }[];
  onLock: (locked: boolean) => void;
  panel: "generate" | "candidates" | null;
  onClose: () => void;
};
export function GenerationPanel({
  snapshot,
  session,
  uploads,
  onLock,
  panel,
  onClose,
}: Props) {
  const client = useQueryClient();
  const key = ["generations", snapshot.projectId, snapshot.id];
  const jobs = useQuery({
    queryKey: key,
    queryFn: () => generationList(snapshot.projectId, snapshot.id),
    retry: false,
    refetchInterval: 3000,
  });
  const providers = useQuery({
    queryKey: ["generation-providers"],
    queryFn: generationProviders,
    retry: false,
  });
  const [provider, setProvider] = useState<"anthropic" | "openai">("anthropic");
  const [uploadId, setUploadId] = useState(snapshot.uploadId ?? "");
  const [description, setDescription] = useState("");
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pending, setPending] = useState<StartGenerationDto>();
  const [showExcluded, setShowExcluded] = useState(false);
  const refreshing = useRef(false);
  const seen = useRef(new Set<string>());
  const running =
    jobs.data?.items.some((job) => job.status === "running") ?? false;
  const locked = running || busy || !!pending || jobs.isPending;
  useEffect(() => {
    onLock(locked);
    return () => onLock(false);
  }, [locked, onLock]);
  // Read new results without replacing any unsaved input in this browser.
  useEffect(() => {
    const completed =
      jobs.data?.items.filter(
        (job) => job.status === "succeeded" && !seen.current.has(job.id),
      ) ?? [];
    if (!completed.length || refreshing.current) return;
    for (const job of completed) seen.current.add(job.id);
    refreshing.current = true;
    void session
      .refreshSaved()
      .then((ok) => setNeedsRefresh(!ok))
      .catch(() => setNeedsRefresh(true))
      .finally(() => {
        refreshing.current = false;
      });
  }, [jobs.data, session]);
  const latest = jobs.data?.items[0];
  const configured =
    providers.data?.items.find((p) => p.id === provider)?.configured ?? false;
  const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : "요청 결과를 확인하지 못했습니다. 다시 확인해주세요.";
  async function refreshSheet() {
    try {
      setNeedsRefresh(!(await session.refreshSaved()));
    } catch (error) {
      setMessage(errorText(error));
    }
  }
  async function start() {
    if (busy || running) return;
    setBusy(true);
    setMessage(undefined);
    try {
      let request = pending;
      if (!request) {
        if (!(await session.settle()))
          throw new Error(
            "시트 저장을 마친 뒤 생성할 수 있습니다. 저장 상태를 확인해주세요.",
          );
        request = {
          clientRequestId: crypto.randomUUID(),
          provider,
          expectedRevision: session.store.getState().base.contentRevision,
          uploadId: uploadId || null,
          description,
        };
        setPending(request);
      }
      const job = await beginGeneration(
        snapshot.projectId,
        snapshot.id,
        request,
      );
      client.setQueryData(
        key,
        (old: { items: GenerationDto[] } | undefined) => ({
          items: [
            job,
            ...(old?.items ?? []).filter((item) => item.id !== job.id),
          ],
        }),
      );
      setPending(undefined);
      setReplace(false);
      onClose();
      await jobs.refetch();
    } catch (error) {
      if (
        error instanceof SaveError &&
        error.status &&
        error.status >= 400 &&
        error.status < 500
      )
        setPending(undefined);
      setMessage(errorText(error));
      void jobs.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function review(
    job: GenerationDto,
    candidate: CandidateDto,
    action: ReviewCandidateDto["action"],
    content?: CandidateDto["content"],
    expectedRevision = job.revision,
  ) {
    setBusy(true);
    setMessage(undefined);
    try {
      if (action === "add" && !(await session.settle()))
        throw new Error("시트 저장을 마친 뒤 후보를 추가해주세요.");
      const updated = await updateCandidate(
        snapshot.projectId,
        snapshot.id,
        job.id,
        candidate.id,
        { expectedRevision, action, ...(content ? { content } : {}) },
      );
      client.setQueryData(
        key,
        (old: { items: GenerationDto[] } | undefined) => ({
          items: (old?.items ?? []).map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }),
      );
      if (action === "add") await refreshSheet();
    } catch (error) {
      setMessage(errorText(error));
      void jobs.refetch();
      throw error;
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace-generation" aria-label="테스트 생성 상태">
      {jobs.isPending && <p role="status">생성 상태를 확인하는 중입니다.</p>}
      {running && (
        <div className="workspace-generation-progress" role="status">
          <span className="workspace-spinner" />
          <span>테스트 생성 중</span>
        </div>
      )}
      {latest?.status === "failed" && <p role="alert">{latest.error}</p>}
      {jobs.isError && (
        <p role="alert">
          생성 상태를 불러오지 못했습니다.{" "}
          <Button variant="link" onClick={() => void jobs.refetch()}>
            다시 확인
          </Button>
        </p>
      )}
      {needsRefresh && (
        <p role="alert">
          시트의 최신 결과를 불러와주세요. 미저장 입력이 있으면 저장하거나 최신
          내용과 비교한 뒤 다시 확인해주세요.{" "}
          <Button variant="link" onClick={() => void refreshSheet()}>
            결과 불러오기
          </Button>
        </p>
      )}
      {message && <p role="alert">{message}</p>}
      {pending && !running && (
        <Button disabled={busy} onClick={() => void start()}>
          생성 요청 다시 확인
        </Button>
      )}
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent
          className={
            panel === "candidates" ? "workspace-candidates-dialog" : ""
          }
          aria-describedby={undefined}
        >
          <DialogTitle>
            {panel === "candidates" ? "후보 검토" : "테스트 생성"}
          </DialogTitle>
          {panel === "generate" && (
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              <Label htmlFor="ai-provider">AI 모델</Label>
              <select
                id="ai-provider"
                className="sheet-select"
                value={provider}
                onChange={(event) =>
                  setProvider(event.target.value as typeof provider)
                }
                disabled={locked}
              >
                <option value="anthropic">Claude Haiku</option>
                <option value="openai">OpenAI Luna</option>
              </select>
              {providers.isError ? (
                <p role="alert">
                  AI 설정을 불러오지 못했습니다.{" "}
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => void providers.refetch()}
                  >
                    다시 확인
                  </Button>
                </p>
              ) : (
                providers.data &&
                !configured && (
                  <p>
                    선택한 AI의 API 키가 설정되지 않았습니다. 서버 설정 후 다시
                    확인해주세요.{" "}
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => void providers.refetch()}
                    >
                      설정 다시 확인
                    </Button>
                  </p>
                )
              )}
              <Label htmlFor="ai-upload">업로드 묶음</Label>
              <select
                id="ai-upload"
                className="sheet-select"
                value={uploadId}
                onChange={(event) => setUploadId(event.target.value)}
                disabled={locked}
              >
                <option value="">설명만 사용</option>
                {uploads.map((upload) => (
                  <option key={upload.id} value={upload.id}>
                    {upload.name}
                  </option>
                ))}
              </select>
              <Label htmlFor="ai-description">테스트 내용</Label>
              <Textarea
                id="ai-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={10000}
                disabled={locked}
              />
              {!uploadId && !description.trim() && (
                <p>업로드 묶음을 선택하거나 테스트할 내용을 입력해주세요.</p>
              )}
              {snapshot.cases.length > 0 && (
                <Label>
                  <input
                    type="checkbox"
                    checked={replace}
                    onChange={(event) => setReplace(event.target.checked)}
                    disabled={locked}
                  />{" "}
                  기존 케이스 {snapshot.cases.length}개를 생성 결과로
                  교체합니다.
                </Label>
              )}
              <Button
                type="submit"
                disabled={
                  locked ||
                  jobs.isError ||
                  !configured ||
                  (!uploadId && !description.trim()) ||
                  (snapshot.cases.length > 0 && !replace)
                }
              >
                {snapshot.cases.length ? "케이스 다시 생성" : "케이스 생성"}
              </Button>
            </form>
          )}
          {panel === "candidates" && (
            <div className="mt-4 flex flex-col gap-3">
              <Label>
                <input
                  type="checkbox"
                  checked={showExcluded}
                  onChange={(event) => setShowExcluded(event.target.checked)}
                />{" "}
                제외한 후보 보기
              </Label>
              {jobs.data?.items.flatMap((job) =>
                job.candidates
                  .filter(
                    (candidate) =>
                      showExcluded || candidate.status !== "excluded",
                  )
                  .map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      job={job}
                      snapshot={snapshot}
                      disabled={locked || jobs.isError}
                      review={review}
                    />
                  )),
              )}
              {jobs.data &&
                !jobs.data.items.some((job) =>
                  job.candidates.some(
                    (candidate) =>
                      showExcluded || candidate.status !== "excluded",
                  ),
                ) && <p>검토할 후보가 없습니다.</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
function CandidateCard({
  candidate,
  job,
  snapshot,
  disabled,
  review,
}: {
  candidate: CandidateDto;
  job: GenerationDto;
  snapshot: Snapshot;
  disabled: boolean;
  review: (
    job: GenerationDto,
    candidate: CandidateDto,
    action: ReviewCandidateDto["action"],
    content?: CandidateDto["content"],
    revision?: number,
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState<{
    content: CandidateDto["content"];
    revision: number;
  }>();
  const fields = [
    ["title", "테스트 항목"],
    ["preconditions", "사전 조건"],
    ["steps", "수행 절차"],
    ["expectedResult", "예상 결과"],
  ] as const;
  const act = (action: ReviewCandidateDto["action"]) => {
    void review(job, candidate, action).catch(() => {});
  };
  return (
    <details className="workspace-candidate">
      <summary>
        <WorkspaceIcon name="chevron" />
        <strong>{candidate.content.title}</strong>
        <span className="workspace-candidate-status text-label text-muted">
          {candidate.status === "added"
            ? "추가됨"
            : candidate.status === "excluded"
              ? "제외됨"
              : "검토 대기"}
        </span>
      </summary>
      <div className="workspace-candidate-body">
        <p className="workspace-candidate-reason">{candidate.reason}</p>
        <div className="workspace-candidate-meta text-label text-muted">
          <time dateTime={job.createdAt}>
            {new Date(job.createdAt).toLocaleString("ko-KR")}
          </time>
          <span>{job.provider === "anthropic" ? "Haiku" : "Luna"}</span>
        </div>
        {editing ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void review(
                job,
                candidate,
                "edit",
                editing.content,
                editing.revision,
              )
                .then(() => setEditing(undefined))
                .catch(() => {});
            }}
          >
            {fields.map(([field, label]) => (
              <div key={field}>
                <Label htmlFor={`${candidate.id}-${field}`}>
                  {snapshot.columns.find((c) => c.field === field)?.name ??
                    label}
                </Label>
                <Textarea
                  id={`${candidate.id}-${field}`}
                  value={editing.content[field]}
                  disabled={disabled}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      content: {
                        ...editing.content,
                        [field]: event.target.value,
                      },
                    })
                  }
                />
              </div>
            ))}
            <Label htmlFor={`${candidate.id}-priority`}>우선순위</Label>
            <select
              id={`${candidate.id}-priority`}
              className="sheet-select"
              value={editing.content.priority ?? ""}
              disabled={disabled}
              onChange={(event) =>
                setEditing({
                  ...editing,
                  content: {
                    ...editing.content,
                    priority: (event.target.value ||
                      null) as CandidateDto["content"]["priority"],
                  },
                })
              }
            >
              <option value="">미지정</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
            {snapshot.columns
              .filter((column) => column.kind === "custom")
              .map((column) => (
                <div key={column.id}>
                  <Label htmlFor={`${candidate.id}-${column.id}`}>
                    {column.name}
                  </Label>
                  <Input
                    id={`${candidate.id}-${column.id}`}
                    disabled={disabled}
                    value={editing.content.customValues[column.id] ?? ""}
                    onValueChange={(value) =>
                      setEditing({
                        ...editing,
                        content: {
                          ...editing.content,
                          customValues: {
                            ...editing.content.customValues,
                            [column.id]: value,
                          },
                        },
                      })
                    }
                  />
                </div>
              ))}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={disabled}>
                후보 저장
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => setEditing(undefined)}
              >
                취소
              </Button>
            </div>
          </form>
        ) : (
          <>
            <dl>
              {fields.slice(1).map(([field, label]) => (
                <div key={field}>
                  <dt className="font-label">
                    {snapshot.columns.find((c) => c.field === field)?.name ??
                      label}
                  </dt>
                  <dd className="whitespace-pre-wrap">
                    {candidate.content[field] || "—"}
                  </dd>
                </div>
              ))}
            </dl>
            {candidate.status !== "added" && (
              <div className="mt-2 flex flex-wrap gap-2">
                <Button disabled={disabled} onClick={() => act("add")}>
                  시트에 추가
                </Button>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() =>
                    setEditing({
                      content: structuredClone(candidate.content),
                      revision: job.revision,
                    })
                  }
                >
                  후보 편집
                </Button>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    act(candidate.status === "excluded" ? "restore" : "exclude")
                  }
                >
                  {candidate.status === "excluded"
                    ? "검토 대기로 복원"
                    : "후보 제외"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </details>
  );
}
