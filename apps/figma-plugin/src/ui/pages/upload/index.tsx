import {
  Banner,
  Button,
  DrawnCheck,
  EmptyState,
  FrameCard,
  Progress,
  Select,
  useToast,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Frame, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MeDto, sdk, toApiFailure } from "@/shared/api";
import {
  debugRemoteUi,
  exportSelectedFrame,
  FigmaExportError,
  loadLastProject,
  openUploadInWeb,
  prepareFrameUpload,
  releaseFrameUpload,
  requestFrameThumbnail,
  saveLastProject,
  useFigmaConnection,
} from "@/shared/lib/figma-bridge";
import { FrameUpload } from "@/shared/lib/frame-upload";
import { readFrameSource } from "@/shared/lib/screen-document";
import { sliceImage } from "@/shared/lib/tiles";
import { PluginShell } from "@/shared/ui/plugin-shell";
import type { FrameSelection } from "../../../protocol/messages";

type Phase =
  | { name: "select" }
  | { name: "uploading"; upload: FrameUpload; posting: boolean }
  | { name: "failed"; upload: FrameUpload }
  | {
      name: "done";
      uploadId: string;
      projectId: string;
      opened: boolean;
      /** 지워졌거나 읽지 못해 빼고 올린 프레임 수 */
      omitted: number;
    };

// 플러그인 창은 출처가 없는 문서라 blob 주소를 불러오지 못한다. 이미지를 data 주소로 넣는다.
function dataUrl(image: Uint8Array) {
  let binary = "";
  for (let i = 0; i < image.length; i += 0x8000)
    binary += String.fromCharCode(...image.subarray(i, i + 0x8000));
  return `data:image/png;base64,${btoa(binary)}`;
}

/**
 * 선택이 바뀌면 그 선택의 미리보기를 차례로 받아 온다. 받아 둔 미리보기는 업로드 화면에서도 쓰도록
 * 지우지 않는다. selection이 null이면 새로 받지 않는다.
 */
function useThumbnails(selection: FrameSelection | null) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  // 선택이 바뀌면(프레임 편집 포함) 새로 받아 바꾼다. 새 이미지가 올 때까지 이전 이미지를 둔다.
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    void (async () => {
      for (const frame of selection.frames) {
        if (cancelled) return;
        try {
          const { image } = await requestFrameThumbnail(
            selection.version,
            frame.nodeId,
          );
          if (cancelled) return;
          const url = dataUrl(image);
          setUrls((current) => ({ ...current, [frame.nodeId]: url }));
        } catch {
          // 미리보기가 없어도 업로드는 할 수 있다
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selection]);
  return urls;
}

// main이 보낸 REST 원본으로 화면 문서를 만든다. 서버 상한을 넘으면 줄여서 올린다.
async function exportFrame(sessionId: string, nodeId: string) {
  const started = performance.now();
  const { frame, image, source } = await exportSelectedFrame(sessionId, nodeId);
  const received = performance.now();
  const { document, reduced } = readFrameSource(source);
  if (reduced)
    console.info("[cheddar] 화면 문서를 줄여서 올립니다", {
      frame: frame.name,
    });
  debugRemoteUi("frame read", {
    sourceChars: source.document.length,
    exportMs: Math.round(received - started),
    buildMs: Math.round(performance.now() - received),
  });
  return { frame, image, document };
}
// 프레임을 올리지 못한 이유를 사용자가 할 수 있는 일로 알려준다. 이유가 섞이면 다시 시도를 안내한다.
// 큰 이미지는 줄여서 다시 그리므로, 줄여도 20MB를 넘을 때만 나눠 올리라고 한다.
const failureHint = (code: string | null) =>
  code === "IMAGE_TOO_LARGE"
    ? "프레임 이미지가 20MB를 넘습니다. 취소한 뒤 Figma에서 프레임을 나눠 다시 올리세요."
    : "다시 시도하세요.";

/** 고를 수 있는 프로젝트와 고른 값. 지난번 고른 프로젝트를 기본값으로 쓴다. */
function useProjectChoice() {
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: async () =>
      (await sdk.listProjects({ throwOnError: true })).data.items,
  });
  const remembered = useQuery({
    queryKey: ["last-project"],
    queryFn: loadLastProject,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const [picked, setPicked] = useState<string | null>(null);
  const items = projects.data ?? [];
  const fallback =
    items.find((p) => p.id === remembered.data)?.id ??
    (items.length === 1 ? items[0]?.id : undefined);
  const projectId = items.find((p) => p.id === picked)?.id ?? fallback ?? null;
  return {
    projects,
    items,
    projectId,
    ready: projects.isSuccess && !remembered.isPending,
    pick: (id: string | null) => {
      setPicked(id);
      void saveLastProject(id).catch(() => undefined);
    },
  };
}

// Figma와 연결이 끊겨 더 읽을 수 없는 경우. 플러그인을 다시 실행해야 한다.
const disconnected = (error: unknown) =>
  error instanceof FigmaExportError &&
  ["SESSION_EXPIRED", "DISCONNECTED"].includes(error.code);
const DISCONNECTED_MESSAGE =
  "Figma와 연결이 끊겼습니다. 플러그인을 다시 실행하세요.";
const startFailure = (error: unknown) =>
  disconnected(error)
    ? DISCONNECTED_MESSAGE
    : error instanceof FigmaExportError && error.code === "INVALID_SELECTION"
      ? "올릴 프레임이 없습니다."
      : "프레임을 읽지 못했습니다. 다시 시도하세요.";

export function UploadPage({
  account,
  onSignOut,
  onSignedOut,
}: {
  account: MeDto;
  /** 계정 메뉴의 로그아웃 */
  onSignOut: () => void;
  /** 업로드 중 로그인이 끝났을 때 */
  onSignedOut: () => void;
}) {
  const toast = useToast();
  const choice = useProjectChoice();
  const selection = useFigmaConnection((s) => s.selection);
  const [phase, setPhase] = useState<Phase>({ name: "select" });
  const [, rerender] = useState(0);
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), []);
  const thumbnails = useThumbnails(phase.name === "select" ? selection : null);

  const frames = selection?.frames ?? [];

  const release = (upload: FrameUpload) => releaseFrameUpload(upload.sessionId);
  const loginEnded = () =>
    sdk.getMe({ throwOnError: true }).then(
      () => false,
      (error) => toApiFailure(error).code === "UNAUTHENTICATED",
    );
  const signOut = (upload: FrameUpload) => {
    release(upload);
    onSignedOut();
    toast.show({
      tone: "danger",
      message: "로그인이 해제되었습니다. 로그인 후 프레임을 다시 올리세요.",
    });
  };
  const openInWeb = (uploadId: string, projectId: string) =>
    openUploadInWeb(uploadId, projectId).then(
      () => true,
      () => false,
    );
  const finish = async (
    upload: FrameUpload,
    projectId: string,
    signal: AbortSignal,
  ) => {
    const failed = await upload.extract(
      (nodeId) => exportFrame(upload.sessionId, nodeId),
      sliceImage,
      () => rerender((n) => n + 1),
      signal,
    );
    if (signal.aborted) return;
    // 읽은 프레임이 하나라도 있으면 그것만 올린다. 하나도 없을 때만 멈춘다.
    if (upload.doneCount === 0) {
      if (upload.stopped) {
        release(upload);
        setPhase({ name: "select" });
        toast.show({ tone: "danger", message: DISCONNECTED_MESSAGE });
        return;
      }
      if (failed === 0) {
        release(upload);
        setPhase({ name: "select" });
        toast.show({ tone: "danger", message: "올릴 프레임이 없습니다." });
        return;
      }
      setPhase({ name: "failed", upload });
      toast.show({
        tone: "danger",
        message: `프레임 ${failed}개를 올리지 못했습니다. ${failureHint(upload.commonFailure)}`,
      });
      return;
    }
    setPhase({ name: "uploading", upload, posting: true });
    // 로그인이 끝났으면 이미지를 보내는 동안 기다리게 하지 않고 바로 로그인 화면으로 보낸다
    const ended = await loginEnded();
    if (signal.aborted) return;
    if (ended) return signOut(upload);
    const { manifest, images } = upload.payload();
    try {
      // 로그아웃으로 화면이 닫히면 요청을 끊고, 늦게 온 응답으로 브라우저를 열거나 다시 로그아웃하지 않는다
      const { data } = await sdk.createTempUpload({
        body: { manifest, "images[]": images },
        throwOnError: true,
        signal,
      });
      if (signal.aborted) return;
      release(upload);
      const done = {
        name: "done",
        uploadId: data.id,
        projectId,
        omitted: upload.failedCount + upload.skippedCount,
      } as const;
      setPhase({ ...done, opened: false });
      if (await openInWeb(data.id, projectId))
        setPhase({ ...done, opened: true });
      else
        toast.show({
          tone: "danger",
          message:
            "브라우저를 열지 못했습니다. 새 테스트 세트 다시 열기를 누르세요.",
        });
    } catch (error) {
      if (signal.aborted) return;
      const failure = toApiFailure(error);
      // 보내는 사이 로그인이 끝나면 서버가 이미지를 다 받기 전에 응답해 브라우저는 연결 오류로 본다
      const ended =
        failure.code === "UNAUTHENTICATED" ||
        (failure.code === "NETWORK" && (await loginEnded()));
      if (signal.aborted) return;
      if (ended) return signOut(upload);
      setPhase({ name: "failed", upload });
      toast.show({ tone: "danger", message: failure.message });
    }
  };
  const start = async () => {
    const { projectId } = choice;
    if (!selection || !projectId) return;
    const controller = new AbortController();
    run.current = controller;
    try {
      const prepared = await prepareFrameUpload(selection.version);
      const upload = new FrameUpload(prepared.sessionId, prepared.frames);
      setPhase({ name: "uploading", upload, posting: false });
      await finish(upload, projectId, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ name: "select" });
      toast.show({
        tone: "danger",
        message: startFailure(error),
      });
    }
  };
  const retry = async (upload: FrameUpload) => {
    const { projectId } = choice;
    if (!projectId) return;
    const controller = new AbortController();
    run.current = controller;
    setPhase({ name: "uploading", upload, posting: false });
    try {
      await finish(upload, projectId, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      release(upload);
      setPhase({ name: "select" });
      toast.show({
        tone: "danger",
        message: startFailure(error),
      });
    }
  };

  const shell = { account, onSignOut };
  if (phase.name === "done") {
    const openedName = choice.items.find((p) => p.id === phase.projectId)?.name;
    return (
      <PluginShell
        {...shell}
        footer={
          <>
            <Button
              variant="primary"
              block
              icon={ExternalLink}
              onClick={async () => {
                if (await openInWeb(phase.uploadId, phase.projectId))
                  setPhase({ ...phase, opened: true });
                else
                  toast.show({
                    tone: "danger",
                    message: "브라우저를 열지 못했습니다.",
                  });
              }}
            >
              새 테스트 세트 다시 열기
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => setPhase({ name: "select" })}
            >
              다른 프레임 올리기
            </Button>
          </>
        }
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success">
            <DrawnCheck drawn size="lg" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-title">업로드 완료</span>
            {phase.opened && openedName && (
              <span className="text-fg-muted">
                {openedName}에 새 테스트 세트를 열었습니다.
              </span>
            )}
            {phase.omitted > 0 && (
              <span className="text-fg-muted">
                프레임 {phase.omitted}개는 빼고 올렸습니다.
              </span>
            )}
          </div>
        </div>
      </PluginShell>
    );
  }

  if (phase.name === "uploading" || phase.name === "failed") {
    const { upload } = phase;
    const total = upload.frames.length;
    const value =
      phase.name === "uploading" && phase.posting
        ? 95
        : (upload.doneCount / total) * 90;
    return (
      <PluginShell
        {...shell}
        footer={
          phase.name === "failed" ? (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  release(upload);
                  setPhase({ name: "select" });
                }}
              >
                취소
              </Button>
              <Button
                variant="primary"
                icon={RotateCcw}
                className="flex-2"
                onClick={() => void retry(upload)}
              >
                다시 시도
              </Button>
            </div>
          ) : (
            <p className="m-0 text-center text-caption text-fg-muted">
              끝날 때까지 플러그인을 닫지 마세요
            </p>
          )
        }
      >
        <div className="flex flex-col gap-3.5">
          {phase.name === "uploading" && (
            <Progress label="업로드 중" value={value} />
          )}
          <div className="grid grid-cols-3 gap-x-2 gap-y-3">
            {upload.frames.map((frame) => {
              const state = upload.states.get(frame.nodeId);
              return (
                <FrameCard
                  key={frame.nodeId}
                  name={frame.name}
                  imageSrc={thumbnails[frame.nodeId]}
                  // 서버가 받기 전에는 완료로 보이지 않게 한다
                  state={
                    state === "failed" || state === "skipped"
                      ? "failed"
                      : phase.name === "uploading"
                        ? "uploading"
                        : undefined
                  }
                />
              );
            })}
          </div>
        </div>
      </PluginShell>
    );
  }

  return (
    <PluginShell
      {...shell}
      footer={
        <Button
          variant="primary"
          block
          icon={Upload}
          disabled={!frames.length || !choice.projectId}
          onClick={() => void start()}
        >
          {frames.length ? `프레임 ${frames.length}개 업로드` : "프레임 업로드"}
        </Button>
      }
    >
      <div className="flex flex-1 flex-col gap-3.5">
        {choice.projects.isError ? (
          <Banner
            tone="danger"
            title="프로젝트를 불러오지 못했습니다"
            actions={
              <Button size="sm" onClick={() => void choice.projects.refetch()}>
                다시 시도
              </Button>
            }
          />
        ) : choice.ready && !choice.items.length ? (
          <Banner tone="warning" title="고를 수 있는 프로젝트가 없습니다" />
        ) : (
          <Select
            label="프로젝트"
            size="sm"
            required
            disabled={!choice.ready}
            placeholder="프로젝트 선택"
            items={choice.items.map((p) => ({ value: p.id, label: p.name }))}
            value={choice.projectId}
            onValueChange={choice.pick}
          />
        )}
        {frames.length ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <span className="flex-1 text-label">프레임</span>
              <span className="text-caption text-fg-muted tabular-nums">
                {frames.length}개
              </span>
            </div>
            <div className="grid grid-cols-3 gap-x-2 gap-y-3">
              {frames.map((frame) => (
                <FrameCard
                  key={frame.nodeId}
                  name={frame.name}
                  imageSrc={thumbnails[frame.nodeId]}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center">
            <EmptyState
              compact
              icon={Frame}
              title="선택한 프레임이 없습니다"
              description="캔버스에서 Frame이나 Section을 선택하세요."
            />
          </div>
        )}
      </div>
    </PluginShell>
  );
}
