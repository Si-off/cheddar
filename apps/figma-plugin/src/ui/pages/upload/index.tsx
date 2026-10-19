import {
  Banner,
  Button,
  DrawnCheck,
  EmptyState,
  FrameCard,
  Progress,
  useToast,
} from "@cheddar/ui";
import { ExternalLink, Frame, RotateCcw, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MeDto, sdk, toApiFailure } from "@/shared/api";
import {
  exportSelectedFrame,
  FigmaExportError,
  openUploadInWeb,
  prepareFrameUpload,
  releaseFrameUpload,
  requestFrameThumbnail,
  useFigmaConnection,
  validateFrameUpload,
} from "@/shared/lib/figma-bridge";
import { FrameUpload } from "@/shared/lib/frame-upload";
import { sliceImage } from "@/shared/lib/tiles";
import { PluginShell } from "@/shared/ui/plugin-shell";
import type { FrameSelection } from "../../../protocol/messages";

type Phase =
  | { name: "select" }
  | { name: "uploading"; upload: FrameUpload; posting: boolean }
  | { name: "failed"; upload: FrameUpload }
  | { name: "done"; uploadId: string };

/** 선택이 바뀌면 그 선택의 미리보기를 차례로 받아 온다 */
function useThumbnails(selection: FrameSelection | null) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    const made: string[] = [];
    setUrls({});
    void (async () => {
      for (const frame of selection.frames) {
        if (cancelled) return;
        try {
          const { image } = await requestFrameThumbnail(
            selection.version,
            frame.nodeId,
          );
          if (cancelled) return;
          const url = URL.createObjectURL(
            new Blob([image as BlobPart], { type: "image/png" }),
          );
          made.push(url);
          setUrls((current) => ({ ...current, [frame.nodeId]: url }));
        } catch {
          // 미리보기가 없어도 업로드는 할 수 있다
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const url of made) URL.revokeObjectURL(url);
    };
  }, [selection]);
  return urls;
}

// 세션이 끝났거나 문서가 바뀌면 같은 세션으로는 다시 시도할 수 없다
const sessionLost = (error: unknown) =>
  error instanceof FigmaExportError &&
  ["SESSION_EXPIRED", "FRAME_CHANGED", "DISCONNECTED"].includes(error.code);

export function UploadPage({
  account,
  onSignedOut,
}: {
  account: MeDto;
  onSignedOut: () => void;
}) {
  const toast = useToast();
  const selection = useFigmaConnection((s) => s.selection);
  const [phase, setPhase] = useState<Phase>({ name: "select" });
  const [, rerender] = useState(0);
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), []);
  const thumbnails = useThumbnails(phase.name === "select" ? selection : null);

  const frames = selection?.frames ?? [];
  const invalid =
    !!selection &&
    (selection.unsupportedCount > 0 || selection.emptySectionCount > 0);

  const release = (upload: FrameUpload) => releaseFrameUpload(upload.sessionId);
  const finish = async (upload: FrameUpload, signal: AbortSignal) => {
    const failed = await upload.extract(
      (nodeId) => exportSelectedFrame(upload.sessionId, nodeId),
      sliceImage,
      () => rerender((n) => n + 1),
      signal,
    );
    if (signal.aborted) return;
    if (failed) {
      setPhase({ name: "failed", upload });
      toast.show({
        tone: "danger",
        message: `${failed}개를 올리지 못했습니다`,
      });
      return;
    }
    setPhase({ name: "uploading", upload, posting: true });
    // 다시 시도 사이에 문서가 바뀌었으면 이전에 읽은 내용을 보내지 않는다
    await validateFrameUpload(upload.sessionId);
    const { manifest, images } = upload.payload();
    try {
      const { data } = await sdk.createTempUpload({
        body: { manifest, "images[]": images },
        throwOnError: true,
      });
      release(upload);
      setPhase({ name: "done", uploadId: data.id });
      void openUploadInWeb(data.id).catch(() =>
        toast.show({
          tone: "danger",
          message:
            "브라우저를 열지 못했습니다. 새 테스트 세트 다시 열기를 누르세요.",
        }),
      );
    } catch (error) {
      const failure = toApiFailure(error);
      if (failure.code === "UNAUTHENTICATED") {
        release(upload);
        onSignedOut();
        return;
      }
      setPhase({ name: "failed", upload });
      toast.show({ tone: "danger", message: failure.message });
    }
  };
  const start = async () => {
    if (!selection) return;
    const controller = new AbortController();
    run.current = controller;
    try {
      const prepared = await prepareFrameUpload(selection.version);
      const upload = new FrameUpload(prepared.sessionId, prepared.frames);
      setPhase({ name: "uploading", upload, posting: false });
      await finish(upload, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      setPhase({ name: "select" });
      toast.show({
        tone: "danger",
        message: sessionLost(error)
          ? "프레임이 바뀌었습니다. 다시 선택하세요."
          : "프레임을 읽지 못했습니다. 다시 시도하세요.",
      });
    }
  };
  const retry = async (upload: FrameUpload) => {
    const controller = new AbortController();
    run.current = controller;
    setPhase({ name: "uploading", upload, posting: false });
    try {
      await finish(upload, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      release(upload);
      setPhase({ name: "select" });
      toast.show({
        tone: "danger",
        message: sessionLost(error)
          ? "프레임이 바뀌었습니다. 다시 선택하세요."
          : "프레임을 읽지 못했습니다. 다시 시도하세요.",
      });
    }
  };

  if (phase.name === "done")
    return (
      <PluginShell
        account={account}
        footer={
          <>
            <Button
              variant="primary"
              block
              icon={ExternalLink}
              onClick={() =>
                void openUploadInWeb(phase.uploadId).catch(() =>
                  toast.show({
                    tone: "danger",
                    message: "브라우저를 열지 못했습니다.",
                  }),
                )
              }
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
          <span className="text-title">업로드 완료</span>
        </div>
      </PluginShell>
    );

  if (phase.name === "uploading" || phase.name === "failed") {
    const { upload } = phase;
    const total = upload.frames.length;
    const value =
      phase.name === "uploading" && phase.posting
        ? 95
        : (upload.doneCount / total) * 90;
    return (
      <PluginShell
        account={account}
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
                    state === "failed"
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
      account={account}
      footer={
        <Button
          variant="primary"
          block
          icon={Upload}
          disabled={!frames.length || invalid}
          onClick={() => void start()}
        >
          {frames.length ? `프레임 ${frames.length}개 업로드` : "프레임 업로드"}
        </Button>
      }
    >
      {invalid && (
        <Banner tone="warning" className="mb-3.5">
          {(selection?.unsupportedCount ?? 0) > 0
            ? "Frame이나 Section만 올릴 수 있습니다. 다른 레이어는 선택에서 빼세요."
            : "프레임이 없는 Section이 있습니다."}
        </Banner>
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
        !invalid && (
          <div className="flex flex-1 flex-col justify-center">
            <EmptyState
              compact
              icon={Frame}
              title="선택한 프레임이 없습니다"
              description="캔버스에서 Frame이나 Section을 선택하세요."
            />
          </div>
        )
      )}
    </PluginShell>
  );
}
