import type { SelectedFrame } from "../../../protocol/messages";

export type FrameState =
  | "waiting"
  | "uploading"
  | "done"
  | "failed"
  | "skipped";
type Extracted = { name: string; document: unknown; images: Blob[] };
type Exported = { image: Uint8Array; data: string; frame?: SelectedFrame };

/** 플러그인과 Figma의 연결이 끊겨 더 읽을 수 없는 경우. 이때만 업로드를 멈춘다. */
const STOP = ["SESSION_EXPIRED", "DISCONNECTED"];
/** 한 번 더 읽으면 될 수 있는 일시적인 실패 */
const TRANSIENT = ["EXPORT_FAILED", "TIMEOUT"];

const codeOf = (error: unknown) =>
  error instanceof Error ? error.message : "UNKNOWN";

/**
 * 플러그인을 연 동안 한 번의 업로드를 맡는다. 프레임 하나가 실패해도 나머지는 계속 읽고,
 * 읽은 프레임만 모아 보낸다. 다시 시도하면 실패한 프레임만 다시 읽는다.
 * 업로드 중 지워진 프레임은 건너뛴다(다시 읽지 않는다).
 */
export class FrameUpload {
  private readonly extracted = new Map<string, Extracted>();
  readonly states = new Map<string, FrameState>();
  /** 실패한 프레임의 이유 코드(예: IMAGE_TOO_LARGE) */
  readonly failures = new Map<string, string>();
  /** Figma와 연결이 끊겨 남은 프레임을 읽지 못했으면 그 이유 */
  stopped: string | null = null;

  constructor(
    readonly sessionId: string,
    readonly frames: SelectedFrame[],
  ) {
    for (const frame of frames) this.states.set(frame.nodeId, "waiting");
  }

  private count(state: FrameState) {
    return [...this.states.values()].filter((s) => s === state).length;
  }
  get failedCount() {
    return this.count("failed");
  }
  /** 지워져서 뺀 프레임 수 */
  get skippedCount() {
    return this.count("skipped");
  }
  get doneCount() {
    return this.extracted.size;
  }

  /** 아직 읽지 않은 프레임을 차례로 읽는다. 실패한 개수를 돌려준다. */
  async extract(
    exportFrame: (nodeId: string) => Promise<Exported>,
    slice: (png: Uint8Array) => Promise<Blob[]>,
    onChange: () => void,
    signal: AbortSignal,
  ) {
    for (const frame of this.frames) {
      if (signal.aborted) break;
      const state = this.states.get(frame.nodeId);
      if (this.extracted.has(frame.nodeId) || state === "skipped") continue;
      this.states.set(frame.nodeId, "uploading");
      onChange();
      try {
        const read = await exportFrame(frame.nodeId).catch((error) => {
          // 일시적인 실패는 사용자에게 알리지 않고 한 번 더 읽는다
          if (TRANSIENT.includes(codeOf(error)))
            return exportFrame(frame.nodeId);
          throw error;
        });
        this.extracted.set(frame.nodeId, {
          // 읽는 사이 이름이 바뀌었으면 지금 이름으로 올린다
          name: read.frame?.name ?? frame.name,
          document: JSON.parse(read.data),
          images: await slice(read.image),
        });
        this.states.set(frame.nodeId, "done");
        this.failures.delete(frame.nodeId);
      } catch (error) {
        const code = codeOf(error);
        // 연결이 끊기면 더 읽을 수 없다. 남은 프레임은 실패로 두고, 읽은 프레임은 그대로 올린다.
        if (STOP.includes(code)) {
          this.stopped = code;
          for (const rest of this.frames)
            if (
              !this.extracted.has(rest.nodeId) &&
              this.states.get(rest.nodeId) !== "skipped"
            ) {
              this.states.set(rest.nodeId, "failed");
              this.failures.set(rest.nodeId, code);
            }
          onChange();
          break;
        }
        this.states.set(
          frame.nodeId,
          code === "FRAME_REMOVED" ? "skipped" : "failed",
        );
        if (code !== "FRAME_REMOVED") this.failures.set(frame.nodeId, code);
      }
      onChange();
    }
    return this.failedCount;
  }

  /** 실패한 프레임이 모두 같은 이유로 실패했으면 그 코드, 섞였으면 null */
  get commonFailure() {
    const codes = new Set(this.failures.values());
    return codes.size === 1 ? ([...codes][0] ?? null) : null;
  }

  /** 서버에 보낼 내용. 읽은 프레임만 원래 순서로 담는다. */
  payload() {
    const items = this.frames
      .map((f) => this.extracted.get(f.nodeId))
      .filter((item): item is Extracted => item !== undefined);
    if (items.length === 0) throw new Error("NOT_EXTRACTED");
    return {
      manifest: JSON.stringify({
        frames: items.map((item) => ({
          name: item.name,
          document: item.document,
          imageCount: item.images.length,
        })),
      }),
      images: items.flatMap((item) => item.images),
    };
  }
}
