import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@cheddar/ui/legacy";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  SaveError,
  type Snapshot,
  type TestScenarioSession,
} from "@/entities/test-case";
import { SourceImage } from "@/pages/project-uploads/source-viewer";
import type {
  GenerationDto,
  GenerationResultItemDto,
  ReviewGenerationResultDto,
  StartGenerationDto,
} from "@/shared/api/generated";

import { getUpload } from "@/shared/api/generated";
import { GenerationResults } from "./generation-results";
import {
  beginGeneration,
  generationList,
  generationProviders,
  updateCandidate,
} from "./test-scenarios-api";

type Props = {
  seed?: { requirementIds: string[]; description: string };
  onResults?: () => void;
  onPendingCount?: (count: number) => void;
  onUnsafeDraftChange?: (unsafe: boolean) => void;
  snapshot: Snapshot;
  session: TestScenarioSession;
  uploads: { id: string; name: string }[];
  onLock: (locked: boolean) => void;
  panel: "generate" | "results" | null;
  onClose: () => void;
};
export function GenerationPanel({
  seed,
  onPendingCount,
  onUnsafeDraftChange,
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
  const [selectedFrames, setSelectedFrames] = useState<string[]>([]);
  const upload = useQuery({
    queryKey: ["generation-upload", snapshot.projectId, uploadId],
    queryFn: async () =>
      (
        await getUpload({
          path: { projectId: snapshot.projectId, uploadId },
          throwOnError: true,
        })
      ).data,
    enabled: !!uploadId,
  });
  useEffect(() => {
    if (upload.data) setSelectedFrames(upload.data.frames.map((f) => f.id));
  }, [upload.data]);
  useEffect(() => {
    if (seed) {
      setDescription(seed.description);
      setUploadId("");
    }
  }, [seed]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [pending, setPending] = useState<StartGenerationDto>();
  const [draftSafe, setDraftSafe] = useState(true);
  useEffect(() => {
    onUnsafeDraftChange?.(!draftSafe);
  }, [draftSafe, onUnsafeDraftChange]);
  const close = () => {
    if (draftSafe) onClose();
  };
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
    void client.invalidateQueries({
      queryKey: ["analysis", snapshot.projectId],
    });
    for (const job of completed) seen.current.add(job.id);
    refreshing.current = true;
    void session
      .refreshSaved()
      .then((ok) => setNeedsRefresh(!ok))
      .catch(() => setNeedsRefresh(true))
      .finally(() => {
        refreshing.current = false;
      });
  }, [jobs.data, session, client, snapshot.projectId]);
  const latest = jobs.data?.items[0];
  const configured =
    providers.data?.items.find((p) => p.id === provider)?.configured ?? false;
  const errorText = (error: unknown) =>
    error instanceof Error
      ? error.message
      : "요청 결과를 확인하지 못했습니다. 다시 확인해주세요.";
  async function refreshTestScenario() {
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
          throw new Error("생성 전 시나리오를 저장해주세요.");
        request = {
          clientRequestId: crypto.randomUUID(),
          provider,
          expectedRevision: session.store.getState().base.contentRevision,
          uploadId: uploadId || null,
          description,
          mode: "append",
          ...(uploadId ? { frameIds: selectedFrames } : {}),
          ...(seed?.requirementIds.length
            ? { requirementIds: seed.requirementIds }
            : {}),
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
    candidate: GenerationResultItemDto,
    action: ReviewGenerationResultDto["action"],
    content?: GenerationResultItemDto["content"],
    expectedRevision = job.revision,
    question?: ReviewGenerationResultDto["question"],
  ) {
    setBusy(true);
    setMessage(undefined);
    try {
      if (action === "add" && !(await session.settle()))
        throw new Error("시나리오 저장 후 확인 항목을 추가해주세요.");
      const updated = await updateCandidate(
        snapshot.projectId,
        snapshot.id,
        job.id,
        candidate.id,
        {
          expectedRevision,
          action,
          ...(content ? { content } : {}),
          ...(question ? { question } : {}),
        },
      );
      client.setQueryData(
        key,
        (old: { items: GenerationDto[] } | undefined) => ({
          items: (old?.items ?? []).map((item) =>
            item.id === updated.id ? updated : item,
          ),
        }),
      );
      if (action === "add") {
        await refreshTestScenario();
        void client.invalidateQueries({
          queryKey: ["analysis", snapshot.projectId],
        });
      }
    } catch (error) {
      setMessage(errorText(error));
      void jobs.refetch();
      throw error;
    } finally {
      setBusy(false);
    }
  }
  const pendingCount =
    jobs.data?.items.reduce(
      (count, job) =>
        count + job.results.filter((item) => item.status === "pending").length,
      0,
    ) ?? 0;
  useEffect(
    () => onPendingCount?.(pendingCount),
    [pendingCount, onPendingCount],
  );
  return (
    <section
      className="workspace-generation"
      aria-label="테스트 케이스 생성 상태"
    >
      {jobs.isPending && <p role="status">생성 상태 확인 중</p>}
      {running && (
        <div className="workspace-generation-progress" role="status">
          <span className="workspace-spinner" />
          <span>테스트 케이스 생성 중</span>
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
          시나리오의 최신 결과를 불러와주세요. 미저장 입력이 있으면 저장하거나
          최신 내용과 비교 후 다시 확인해주세요.{" "}
          <Button variant="link" onClick={() => void refreshTestScenario()}>
            결과 불러오기
          </Button>
        </p>
      )}
      {message && !panel && <p role="alert">{message}</p>}
      {pending && !running && (
        <Button disabled={busy} onClick={() => void start()}>
          생성 요청 다시 확인
        </Button>
      )}
      <Dialog
        open={!!panel}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent
          className={
            panel === "results"
              ? "workspace-generation-results-dialog is-results"
              : "generation-dialog"
          }
          aria-describedby={undefined}
        >
          <DialogTitle>
            {panel === "results" ? "확인 항목" : "테스트 케이스 생성"}
          </DialogTitle>
          {message && panel === "generate" && <p role="alert">{message}</p>}
          {panel === "generate" && (
            <form
              className="mt-3 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                void start();
              }}
            >
              <Label htmlFor="ai-provider">AI 모델</Label>
              <Select
                value={provider}
                onValueChange={(value) =>
                  value && setProvider(value as typeof provider)
                }
                disabled={locked}
              >
                <SelectTrigger id="ai-provider">
                  <SelectValue>
                    {provider === "anthropic" ? "Claude Haiku" : "OpenAI Luna"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Claude Haiku</SelectItem>
                  <SelectItem value="openai">OpenAI Luna</SelectItem>
                </SelectContent>
              </Select>
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
                    AI API 키가 없습니다. 서버 설정 후 다시 확인해주세요.{" "}
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
              <Label htmlFor="ai-upload">Figma 자료</Label>
              <Select
                value={uploadId || "description"}
                onValueChange={(value) =>
                  setUploadId(value === "description" ? "" : (value ?? ""))
                }
                disabled={locked}
              >
                <SelectTrigger id="ai-upload">
                  <SelectValue>
                    {uploads.find((item) => item.id === uploadId)?.name ??
                      "설명만 사용"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="description">설명만 사용</SelectItem>
                  {uploads.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {uploadId && (
                <section
                  className="generation-frame-picker"
                  aria-label="생성 화면 선택"
                >
                  {upload.isPending && <p role="status">화면 조회 중</p>}
                  {upload.isError && (
                    <p role="alert">
                      화면을 불러오지 못했습니다.
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => void upload.refetch()}
                      >
                        다시 불러오기
                      </Button>
                    </p>
                  )}
                  {upload.data?.frames.map((frame) => (
                    <Label key={frame.id} className="generation-frame">
                      <Checkbox
                        aria-label={`${frame.name} 생성 선택`}
                        checked={selectedFrames.includes(frame.id)}
                        disabled={locked}
                        onCheckedChange={(checked) =>
                          setSelectedFrames((old) =>
                            checked
                              ? [...old, frame.id]
                              : old.filter((id) => id !== frame.id),
                          )
                        }
                      />
                      <span>{frame.name}</span>
                      <SourceImage
                        projectId={snapshot.projectId}
                        frame={frame}
                      />
                    </Label>
                  ))}
                </section>
              )}
              <Label htmlFor="ai-description">테스트 내용</Label>
              <Textarea
                id="ai-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={10000}
                disabled={locked}
              />
              {!uploadId && !description.trim() && (
                <p>Figma 자료를 선택하거나 테스트 내용을 입력해주세요.</p>
              )}
              <Button
                type="submit"
                disabled={
                  locked ||
                  jobs.isError ||
                  !configured ||
                  (!uploadId && !description.trim()) ||
                  (!!uploadId &&
                    (upload.isPending ||
                      upload.isError ||
                      !selectedFrames.length))
                }
              >
                테스트 케이스 생성
              </Button>
            </form>
          )}
          {panel === "results" && jobs.isPending && (
            <p role="status">확인 항목 조회 중</p>
          )}
          {panel === "results" && jobs.isError && (
            <p role="alert">
              확인 항목을 불러오지 못했습니다.{" "}
              <Button variant="link" onClick={() => void jobs.refetch()}>
                다시 불러오기
              </Button>
            </p>
          )}
          {panel === "results" && !jobs.isPending && (
            <GenerationResults
              jobs={jobs.data?.items ?? []}
              snapshot={snapshot}
              disabled={locked || jobs.isError}
              onReview={review}
              onDraftSafety={setDraftSafe}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
