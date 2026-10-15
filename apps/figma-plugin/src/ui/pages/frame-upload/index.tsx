import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Surface,
} from "@cheddar/ui";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  createUpload,
  listProjects,
  uploadFile,
} from "@/shared/api/generated/sdk.gen";
import {
  createRequestId,
  exportSelectedFrame,
  FigmaExportError,
  prepareFrameUpload,
  releaseFrameUpload,
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
        return "선택이 변경되었습니다. 프레임 목록을 확인한 뒤 다시 업로드해주세요.";
      case "FILE_KEY_UNAVAILABLE":
        return "Figma 파일을 확인하지 못했습니다. 개발용 플러그인 설정과 파일을 확인해주세요.";
      case "IMAGE_TOO_LARGE":
        return "이미지가 20 MiB를 넘습니다. 프레임 크기를 줄인 뒤 새로 업로드해주세요.";
      case "DATA_TOO_LARGE":
        return "프레임 데이터가 5 MiB를 넘습니다. 프레임을 나눈 뒤 새로 업로드해주세요.";
      case "SESSION_EXPIRED":
        return "업로드 준비가 만료되었습니다. 현재 선택으로 새 업로드를 시작해주세요.";
      case "DISCONNECTED":
        return "Figma 연결이 끊겼습니다. 플러그인을 다시 열어주세요.";
      case "TIMEOUT":
        return "프레임을 가져오는 데 시간이 오래 걸립니다. 잠시 후 다시 시도해주세요.";
      default:
        return "프레임을 가져오지 못했습니다. 다시 시도해주세요.";
    }
  }
  const code = apiCode(error);
  if (code === "FILE_TOO_LARGE")
    return "파일 크기 제한을 초과했습니다. 이미지 20 MiB, 데이터 5 MiB 이하로 준비해주세요.";
  if (code === "NOT_FOUND")
    return "프로젝트나 업로드 파일을 찾을 수 없습니다. 웹에서 프로젝트를 확인해주세요.";
  if (code === "IDEMPOTENCY_CONFLICT")
    return "이 업로드 요청은 다른 내용으로 이미 등록되었습니다. 웹 업로드 목록에서 기존 묶음을 확인해주세요.";
  if (code === "VALIDATION_ERROR" || code === "UNSUPPORTED_FILE_TYPE")
    return "프레임 파일을 등록하지 못했습니다. 현재 선택으로 새 업로드를 시작해주세요.";
  return registering
    ? "등록 결과를 확인하지 못했습니다. 등록 결과 확인을 눌러주세요."
    : "파일 전송 결과를 확인하지 못했습니다. 서버 연결을 확인한 뒤 다시 시도해주세요.";
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
  extracting: "프레임 가져오는 중",
  image: "이미지 보내는 중",
  data: "데이터 보내는 중",
  registering: "업로드 등록 중",
};

export function FrameUploadPage() {
  const { connected, selection } = useFigmaConnection();
  const [projectId, setProjectId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<
    "idle" | "preparing" | "uploading" | "failed" | "success"
  >("idle");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const [needsNewUpload, setNeedsNewUpload] = useState(false);
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
  const rows = projects.data?.pages.flatMap((page) => page.items) ?? [];
  const options = rows.map((project) => ({
    value: project.id,
    label:
      rows.filter((other) => other.name === project.name).length > 1
        ? `${project.name} · ${project.id.slice(0, 8)}`
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
    <main className="p-page text-body">
      <Surface className="space-y-5">
        <h1 className="text-title font-heading">Figma 프레임</h1>
        {!connected ? (
          <p role="status" className="text-label text-muted">
            Figma에서 플러그인을 열어주세요.
          </p>
        ) : status === "success" && result ? (
          <div className="space-y-4">
            <p role="status" className="text-success">
              {result.name} 업로드를 완료했습니다.
            </p>
            <p className="text-label text-muted">
              프로젝트의 웹 업로드 목록에서 확인할 수 있습니다.
            </p>
            <Button onClick={reset}>새 업로드</Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void upload();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="upload-project">프로젝트</Label>
              <Select
                items={options}
                value={projectId}
                onValueChange={setProjectId}
                disabled={locked || projects.isPending || rows.length === 0}
              >
                <SelectTrigger id="upload-project" className="w-full">
                  <SelectValue placeholder="프로젝트 선택" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {projects.isPending && (
                <p role="status" className="text-label text-muted">
                  프로젝트 불러오는 중
                </p>
              )}
              {projects.isError && (
                <div role="alert" className="space-y-2 text-label text-danger">
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
              {projects.isSuccess && rows.length === 0 && (
                <p className="text-label text-muted">
                  프로젝트가 없습니다. 웹에서 프로젝트를 만든 뒤 다시
                  불러와주세요.
                </p>
              )}
              {projects.isSuccess && rows.length === 0 && (
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
            <section aria-labelledby="selected-frames" className="space-y-2">
              <h2 id="selected-frames" className="text-label font-heading">
                업로드할 프레임 {frames.length}개
              </h2>
              {!locked && selection && selection.sectionCount > 0 && (
                <p className="text-label text-muted">
                  섹션 안의 최상위 Frame을 포함합니다. Frame 내부의 중첩
                  프레임은 별도 항목으로 추가하지 않습니다.
                </p>
              )}
              {frames.length > 0 ? (
                <ol className="divide-y divide-border rounded-panel border border-border">
                  {frames.map((frame) => (
                    <li key={frame.nodeId} className="px-4 py-3">
                      <p className="break-words text-label">{frame.name}</p>
                      <p className="text-caption text-muted">
                        {Math.round(frame.width)} × {Math.round(frame.height)}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : selection &&
                selection.sectionCount === 0 &&
                selection.unsupportedCount === 0 ? (
                <p className="text-label text-muted">
                  Figma에서 업로드할 Frame이나 섹션을 선택해주세요.
                </p>
              ) : null}
              {!locked && selection && selection.unsupportedCount > 0 && (
                <p role="alert" className="text-label text-danger">
                  Frame이나 섹션만 선택해주세요. 다른 레이어나 이름·크기를
                  확인해야 하는 항목이 {selection.unsupportedCount}개 있습니다.
                </p>
              )}
              {!locked && selection && selection.emptySectionCount > 0 && (
                <p role="alert" className="text-label text-danger">
                  Frame이 없는 섹션이 {selection.emptySectionCount}개 있습니다.
                  해당 섹션을 선택에서 제외하거나 Frame이 있는 섹션을
                  선택해주세요.
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
                    : `${frames[progress.index - 1]?.name ?? "프레임"} · 업로드 중단`
                  : progressNames[progress.phase]}{" "}
                · {progress.index}/{progress.total}
              </p>
            )}
            {error && (
              <p role="alert" className="text-label text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
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
                    현재 선택으로 새 업로드
                  </Button>
                )}
            </div>
          </form>
        )}
      </Surface>
    </main>
  );
}
