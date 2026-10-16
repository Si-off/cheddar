import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Surface,
  WorkspaceIcon,
} from "@cheddar/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createUpload,
  listProjects,
  uploadFile,
} from "@/shared/api/generated/sdk.gen";
import {
  createRequestId,
  exportSelectedFrame,
  FigmaExportError,
  openUploadInWeb,
  prepareFrameUpload,
  releaseFrameUpload,
  requestFrameThumbnail,
  useFigmaConnection,
  validateFrameUpload,
} from "@/shared/lib/figma-bridge";
import {
  FrameUploadSession,
  type UploadGateway,
  type UploadProgress,
  type UploadResult,
} from "./upload-session";

function apiCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "code" in error.error
    ? error.error.code
    : undefined;
}
function failure(error: unknown, registering: boolean) {
  if (error instanceof FigmaExportError) {
    switch (error.code) {
      case "FRAME_CHANGED":
        return "프레임이 변경되었습니다. 현재 선택으로 새 업로드를 시작해주세요.";
      case "INVALID_SELECTION":
        return "선택이 변경되었습니다. 프레임 목록 확인 후 다시 업로드해주세요.";
      case "FILE_KEY_UNAVAILABLE":
        return "Figma 파일을 확인하지 못했습니다. 개발용 플러그인 설정과 파일을 확인해주세요.";
      case "IMAGE_TOO_LARGE":
        return "이미지가 20 MiB를 넘습니다. 프레임 크기를 줄이고 새로 업로드해주세요.";
      case "DATA_TOO_LARGE":
        return "프레임 데이터가 5 MiB를 넘습니다. 프레임 분할 후 새로 업로드해주세요.";
      case "SESSION_EXPIRED":
        return "업로드 준비가 만료되었습니다. 현재 선택으로 새 업로드를 시작해주세요.";
      case "DISCONNECTED":
        return "Figma 연결이 끊겼습니다. 플러그인을 다시 열어주세요.";
      case "WEB_UNAVAILABLE":
        return "웹 주소를 확인하지 못했습니다. 웹의 Figma 자료에서 업로드를 확인해주세요.";
      case "TIMEOUT":
        return "프레임 조회 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.";
      default:
        return "프레임을 가져오지 못했습니다. 다시 시도해주세요.";
    }
  }
  const code = apiCode(error);
  if (code === "FILE_TOO_LARGE")
    return "파일 크기 제한을 초과했습니다. 이미지 20 MiB, 데이터 5 MiB 이하로 준비해주세요.";
  if (code === "NOT_FOUND")
    return "프로젝트나 업로드 파일이 없습니다. 웹에서 프로젝트를 확인해주세요.";
  if (code === "IDEMPOTENCY_CONFLICT")
    return "이 업로드 요청은 다른 내용으로 이미 등록되었습니다. 웹 업로드 목록에서 기존 묶음을 확인해주세요.";
  if (code === "VALIDATION_ERROR" || code === "UNSUPPORTED_FILE_TYPE")
    return "프레임 파일을 등록하지 못했습니다. 현재 선택으로 새 업로드를 시작해주세요.";
  return registering
    ? "등록 결과를 확인하지 못했습니다. 등록 결과 확인을 눌러주세요."
    : "파일 전송 결과를 확인하지 못했습니다. 서버 연결 확인 후 다시 시도해주세요.";
}

const gateway: UploadGateway = {
  file: async (projectId, file, signal) =>
    (
      await uploadFile({
        path: { projectId },
        body: { file },
        signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        throwOnError: true,
      })
    ).data,
  bundle: async (projectId, body, signal) =>
    (
      await createUpload({
        path: { projectId },
        body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
        throwOnError: true,
      })
    ).data,
};

const exporter = { export: exportSelectedFrame, validate: validateFrameUpload };
const progressNames: Record<UploadProgress["phase"], string> = {
  extracting: "프레임 조회 중",
  image: "이미지 전송 중",
  data: "데이터 전송 중",
  registering: "업로드 등록 중",
};

export function FrameUploadPage() {
  const { connected, selection } = useFigmaConnection();
  const [projectSearch, setProjectSearch] = useState("");
  const [webError, setWebError] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [stage, setStage] = useState<"frames" | "destination">("frames");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<{
    nodeId: string;
    name: string;
    url?: string;
    error?: string;
  } | null>(null);
  const previewRequest = useRef(0);
  const previewVersion = selection?.version;
  const imageCache = useMemo(
    () => createImageCache(previewVersion),
    [previewVersion],
  );
  useEffect(() => {
    imageCache.activate();
    return () => imageCache.dispose();
  }, [imageCache]);
  useEffect(() => {
    if (previewVersion === undefined || previewVersion >= 0) {
      previewRequest.current += 1;
      setPreviewOpen(false);
    }
  }, [previewVersion]);
  async function previewFrame(nodeId: string, frameName: string) {
    if (busy.current || !selection) return;
    const request = ++previewRequest.current;
    setPreviewOpen(true);
    setPreview({ nodeId, name: frameName });
    try {
      const url = await imageCache.get(selection.version, nodeId, "preview");
      if (request === previewRequest.current)
        setPreview({ nodeId, name: frameName, url });
    } catch {
      if (request === previewRequest.current)
        setPreview({
          nodeId,
          name: frameName,
          error: "이미지를 불러오지 못했습니다. 다시 시도해주세요.",
        });
    }
  }
  const [status, setStatus] = useState<
    "idle" | "preparing" | "uploading" | "failed" | "success"
  >("idle");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const [needsNewUpload, setNeedsNewUpload] = useState(false);
  const [uploadedFrameCount, setUploadedFrameCount] = useState(0);
  const [result, setResult] = useState<UploadResult | null>(null);
  const run = useRef<FrameUploadSession | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const projects = useInfiniteQuery({
    queryKey: ["plugin-projects"],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) =>
      (
        await listProjects({
          query: { limit: 50, cursor: pageParam },
          signal,
          throwOnError: true,
        })
      ).data,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: connected,
  });
  useEffect(() => {
    if (
      projectSearch.trim() &&
      projects.hasNextPage &&
      !projects.isFetching &&
      !projects.isError
    )
      void projects.fetchNextPage();
  }, [
    projectSearch,
    projects.hasNextPage,
    projects.isFetching,
    projects.isError,
    projects.fetchNextPage,
  ]);
  const rows = projects.data?.pages.flatMap((page) => page.items) ?? [];
  const options = rows.map((project) => ({
    value: project.id,
    label:
      rows.filter((other) => other.name === project.name).length > 1
        ? `${project.name} (${project.id.slice(0, 8)})`
        : project.name,
  }));
  const running = status === "preparing" || status === "uploading";
  const locked = running || run.current !== null;
  const frames = run.current?.frames ?? selection?.frames ?? [];
  useEffect(
    () => () => {
      controller.current?.abort();
      if (run.current) releaseFrameUpload(run.current.sessionId);
    },
    [],
  );

  async function upload() {
    if (busy.current || needsNewUpload || !projectId || !selection) return;
    busy.current = true;
    const current = new AbortController();
    controller.current = current;
    setError("");
    setNeedsNewUpload(false);
    try {
      if (!run.current) {
        setStatus("preparing");
        const prepared = await prepareFrameUpload(selection.version);
        if (current.signal.aborted) {
          releaseFrameUpload(prepared.sessionId);
          return;
        }
        run.current = new FrameUploadSession(
          projectId,
          name.trim(),
          prepared.sessionId,
          prepared.fileKey,
          prepared.frames,
          createRequestId(),
        );
      }
      setStatus("uploading");
      const saved = await run.current.run(
        gateway,
        exporter,
        current.signal,
        setProgress,
      );
      if (current.signal.aborted) return;
      setUploadedFrameCount(run.current.frames.length);
      releaseFrameUpload(run.current.sessionId);
      run.current = null;
      setResult(saved);
      setStatus("success");
    } catch (caught) {
      if (!current.signal.aborted) {
        const terminal =
          caught instanceof FigmaExportError
            ? !["TIMEOUT", "EXPORT_FAILED"].includes(caught.code)
            : [
                "NOT_FOUND",
                "IDEMPOTENCY_CONFLICT",
                "VALIDATION_ERROR",
                "UNSUPPORTED_FILE_TYPE",
                "FILE_TOO_LARGE",
              ].includes(String(apiCode(caught)));
        setNeedsNewUpload(terminal);
        setError(failure(caught, run.current?.registrationPending ?? false));
        setStatus("failed");
      }
    } finally {
      busy.current = false;
    }
  }

  function reset() {
    if (run.current) releaseFrameUpload(run.current.sessionId);
    run.current = null;
    setStatus("idle");
    setProgress(null);
    setError("");
    setNeedsNewUpload(false);
    setResult(null);
    setStage("frames");
  }

  const canUpload =
    connected &&
    selection?.fileKey &&
    frames.length > 0 &&
    selection.unsupportedCount === 0 &&
    selection.emptySectionCount === 0 &&
    projectId &&
    name.trim().length > 0;
  return (
    <main className="plugin-workspace text-body">
      <Surface className="plugin-workspace-surface">
        <header className="plugin-header">
          <span className="plugin-brand">Cheddar</span>
          {stage === "destination" && !locked && status !== "success" && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="이전 화면"
              onClick={() => setStage("frames")}
            >
              <WorkspaceIcon name="back" />
            </Button>
          )}
          <h1 className="text-heading font-heading">
            {stage === "frames" ? "화면 선택" : "업로드 설정"}
          </h1>
          <ol className="plugin-steps" aria-label="업로드 단계">
            <li
              aria-current={stage === "frames" ? "step" : undefined}
              data-complete={stage === "destination" || undefined}
            >
              <span>1</span>프레임 확인
            </li>
            <li aria-current={stage === "destination" ? "step" : undefined}>
              <span>2</span>업로드 설정
            </li>
          </ol>
        </header>
        {!connected ? (
          <p role="status" className="text-label text-muted">
            Figma에서 플러그인을 열어주세요.
          </p>
        ) : status === "success" && result ? (
          <div className="plugin-completion">
            <span className="plugin-completion-mark">
              <WorkspaceIcon name="check" />
            </span>
            <p role="status" className="text-success">
              {result.name} 업로드를 완료했습니다.
            </p>
            <p className="text-label text-muted">
              프레임 {uploadedFrameCount}개
            </p>
            {webError && (
              <p role="alert" className="text-danger">
                {webError}
              </p>
            )}
            <footer className="plugin-footer">
              <Button variant="outline" onClick={reset}>
                새 업로드
              </Button>
              <Button
                onClick={() => {
                  setWebError("");
                  void openUploadInWeb(result.projectId, result.id).catch(
                    (caught) =>
                      setWebError(
                        caught instanceof FigmaExportError &&
                          caught.code === "WEB_UNAVAILABLE"
                          ? failure(caught, false)
                          : "웹을 열지 못했습니다. 다시 시도해주세요.",
                      ),
                  );
                }}
              >
                웹에서 열기
                <WorkspaceIcon name="arrow" />
              </Button>
            </footer>
          </div>
        ) : (
          <form
            className="plugin-upload-form"
            onSubmit={(event) => {
              event.preventDefault();
              void upload();
            }}
          >
            <div
              hidden={stage !== "destination"}
              className="plugin-destination"
            >
              <div className="space-y-2">
                <Label htmlFor="upload-project">프로젝트</Label>
                <Combobox
                  items={options}
                  value={
                    options.find((item) => item.value === projectId) ?? null
                  }
                  onValueChange={(item) => setProjectId(item?.value ?? null)}
                  onInputValueChange={setProjectSearch}
                  disabled={locked || projects.isPending}
                >
                  <ComboboxInput
                    id="upload-project"
                    placeholder="프로젝트 검색"
                  />
                  <ComboboxContent>
                    <ComboboxEmpty>
                      {projects.hasNextPage
                        ? "검색 계속"
                        : projects.isError
                          ? "프로젝트 조회 실패"
                          : "검색 결과 없음"}
                    </ComboboxEmpty>
                    <ComboboxList>
                      {(item: { value: string; label: string }) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                    {projects.hasNextPage && (
                      <Button
                        variant="ghost"
                        disabled={projects.isFetchingNextPage}
                        onClick={() => void projects.fetchNextPage()}
                      >
                        {projects.isFetchingNextPage
                          ? "프로젝트 조회 중"
                          : "프로젝트 더 보기"}
                      </Button>
                    )}
                  </ComboboxContent>
                </Combobox>
                {projects.isPending && (
                  <p role="status" className="text-label text-muted">
                    프로젝트 조회 중
                  </p>
                )}
                {projects.isError && (
                  <div
                    role="alert"
                    className="space-y-2 text-label text-danger"
                  >
                    <p>
                      프로젝트를 불러오지 못했습니다. 서버 연결을 확인해주세요.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void projects.refetch()}
                    >
                      다시 불러오기
                    </Button>
                  </div>
                )}
                {projects.isSuccess &&
                  !projects.hasNextPage &&
                  rows.length === 0 && (
                    <p className="text-label text-muted">
                      프로젝트가 없습니다. 웹에서 프로젝트 생성 후 다시
                      불러와주세요.
                    </p>
                  )}
                {projects.isSuccess &&
                  !projects.hasNextPage &&
                  rows.length === 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void projects.refetch()}
                    >
                      다시 불러오기
                    </Button>
                  )}
                {projects.hasNextPage && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={locked || projects.isFetchingNextPage}
                    onClick={() => void projects.fetchNextPage()}
                  >
                    프로젝트 더 보기
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="upload-name">업로드 이름</Label>
                <Input
                  id="upload-name"
                  value={name}
                  onValueChange={setName}
                  maxLength={100}
                  required
                  disabled={locked}
                />
              </div>
            </div>
            <section
              hidden={stage !== "frames"}
              aria-labelledby="selected-frames"
              className="space-y-2"
            >
              <h2 id="selected-frames" className="text-label font-heading">
                프레임 {frames.length}개
              </h2>
              {frames.length > 0 ? (
                <ol className="plugin-frame-gallery">
                  {frames.map((frame) => (
                    <li key={frame.nodeId}>
                      <button
                        type="button"
                        className="plugin-frame-card"
                        disabled={locked}
                        aria-label={`${frame.name} 미리보기`}
                        onClick={() =>
                          void previewFrame(frame.nodeId, frame.name)
                        }
                      >
                        <FrameThumbnail
                          key={`${selection?.version}:${frame.nodeId}`}
                          version={selection?.version ?? 0}
                          nodeId={frame.nodeId}
                          cache={imageCache}
                        />
                        <strong>{frame.name}</strong>
                        <small>
                          {Math.round(frame.width)} × {Math.round(frame.height)}
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
              ) : selection &&
                selection.sectionCount === 0 &&
                selection.unsupportedCount === 0 ? (
                <p className="text-label text-muted">
                  Figma에서 프레임이나 섹션을 선택해주세요.
                </p>
              ) : null}
              {!locked && selection && selection.unsupportedCount > 0 && (
                <p role="alert" className="text-label text-danger">
                  선택 확인 항목이 {selection.unsupportedCount}개 있습니다.
                  프레임과 섹션만 선택하고 이름과 크기를 확인해주세요.
                </p>
              )}
              {!locked && selection && selection.emptySectionCount > 0 && (
                <p role="alert" className="text-label text-danger">
                  섹션 {selection.emptySectionCount}개에 프레임이 없습니다. 해당
                  섹션을 선택에서 제외하거나 프레임 포함 섹션을 선택해주세요.
                </p>
              )}
              {!locked && selection && !selection.fileKey && (
                <p role="alert" className="text-label text-danger">
                  Figma 파일을 확인하지 못했습니다. 개발용 플러그인 설정과
                  파일을 확인해주세요.
                </p>
              )}
            </section>
            {progress && (
              <p
                role="status"
                aria-live="polite"
                className="text-label text-primary"
              >
                {status === "failed"
                  ? progress.phase === "registering"
                    ? needsNewUpload
                      ? "업로드 중단"
                      : "업로드 등록 확인 필요"
                    : `${frames[progress.index - 1]?.name ?? "프레임"} 업로드 중단`
                  : progressNames[progress.phase]}{" "}
                <span className="plugin-progress-detail">
                  {progress.phase === "registering"
                    ? `프레임 ${progress.total}개 전송 완료`
                    : `프레임 ${progress.index}/${progress.total} ${frames[progress.index - 1]?.name ?? ""}`}
                </span>
              </p>
            )}
            {error && (
              <p role="alert" className="text-label text-danger">
                {error}
              </p>
            )}
            <footer className="plugin-footer">
              {stage === "frames" ? (
                <>
                  <span>{frames.length}개 선택</span>
                  <Button
                    type="button"
                    disabled={
                      !frames.length ||
                      !connected ||
                      !!selection?.unsupportedCount ||
                      !!selection?.emptySectionCount
                    }
                    onClick={() => {
                      setStage("destination");
                      if (!name.trim()) setName(frames[0]?.name ?? "");
                    }}
                  >
                    계속
                    <WorkspaceIcon name="arrow" />
                  </Button>
                </>
              ) : (
                <>
                  <span>프레임 {frames.length}개</span>
                  {(!needsNewUpload || status !== "failed") && (
                    <Button
                      type="submit"
                      disabled={running || (!run.current && !canUpload)}
                    >
                      {running
                        ? "업로드 중"
                        : status === "failed"
                          ? run.current?.registrationPending
                            ? "등록 결과 확인"
                            : "다시 시도"
                          : "업로드"}
                    </Button>
                  )}
                  {status === "failed" &&
                    (!run.current?.registrationPending || needsNewUpload) && (
                      <Button type="button" variant="outline" onClick={reset}>
                        새 업로드
                      </Button>
                    )}
                </>
              )}
            </footer>
          </form>
        )}
      </Surface>
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) {
            previewRequest.current += 1;
            setPreviewOpen(false);
          }
        }}
      >
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>{preview?.name}</DialogTitle>
          {preview?.error ? (
            <div>
              <p role="alert">{preview.error}</p>
              <Button
                variant="outline"
                onClick={() => {
                  if (preview) {
                    imageCache.remove(preview.nodeId, "preview");
                    void previewFrame(preview.nodeId, preview.name);
                  }
                }}
              >
                다시 시도
              </Button>
            </div>
          ) : preview?.url ? (
            <img
              src={preview.url}
              alt={preview.name}
              className="plugin-preview-image"
            />
          ) : (
            <div className="plugin-preview-loading" role="status">
              이미지 조회 중
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function createImageCache(selectionVersion: number | undefined) {
  const pending = new Map<string, Promise<string>>();
  const urls = new Set<string>();
  let disposed = false;
  return {
    activate() {
      disposed = false;
    },
    get(version: number, nodeId: string, size: "thumbnail" | "preview") {
      const key = `${size}:${nodeId}`;
      let request = pending.get(key);
      if (!request) {
        request = requestFrameThumbnail(version, nodeId, size).then((reply) => {
          if (
            disposed ||
            selectionVersion !== version ||
            reply.selectionVersion !== version ||
            reply.nodeId !== nodeId
          )
            throw new Error("Stale thumbnail");
          const url = URL.createObjectURL(
            new Blob([new Uint8Array(reply.image).buffer], {
              type: "image/png",
            }),
          );
          urls.add(url);
          return url;
        });
        pending.set(key, request);
      }
      return request;
    },
    remove(nodeId: string, size: "thumbnail" | "preview") {
      pending.delete(`${size}:${nodeId}`);
    },
    dispose() {
      disposed = true;
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
      pending.clear();
    },
  };
}
function FrameThumbnail({
  version,
  nodeId,
  cache,
}: {
  version: number;
  nodeId: string;
  cache: ReturnType<typeof createImageCache>;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [image, setImage] = useState<string>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void cache
        .get(version, nodeId, "thumbnail")
        .then((url) => {
          if (active) setImage(url);
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    });
    if (element.current) observer.observe(element.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [version, nodeId, cache]);
  return (
    <span ref={element} className="plugin-frame-art">
      {image ? (
        <img src={image} alt="" />
      ) : failed ? (
        <small>미리보기 없음</small>
      ) : (
        <span
          role="img"
          className="plugin-thumbnail-placeholder"
          aria-label="이미지 조회 중"
        />
      )}
    </span>
  );
}
