import type { SelectedFrame } from "../../../protocol/messages";

export type FrameState = "waiting" | "uploading" | "done" | "failed";
type Extracted = { name: string; document: unknown; images: Blob[] };

/**
 * 플러그인을 연 동안 한 번의 업로드를 맡는다. 추출에 성공한 프레임은 다시 시도할 때
 * 다시 추출하지 않고, 실패한 프레임만 다시 추출한다. 서버 전송은 한 번에 한다.
 */
export class FrameUpload {
  private readonly extracted = new Map<string, Extracted>();
  readonly states = new Map<string, FrameState>();

  constructor(
    readonly sessionId: string,
    readonly frames: SelectedFrame[],
  ) {
    for (const frame of frames) this.states.set(frame.nodeId, "waiting");
  }

  get failedCount() {
    return [...this.states.values()].filter((s) => s === "failed").length;
  }
  get doneCount() {
    return this.extracted.size;
  }

  /** 아직 추출하지 않은 프레임을 차례로 추출한다. 실패한 개수를 돌려준다. */
  async extract(
    exportFrame: (
      nodeId: string,
    ) => Promise<{ image: Uint8Array; data: string }>,
    slice: (png: Uint8Array) => Promise<Blob[]>,
    onChange: () => void,
    signal: AbortSignal,
  ) {
    for (const frame of this.frames) {
      if (signal.aborted) break;
      if (this.extracted.has(frame.nodeId)) continue;
      this.states.set(frame.nodeId, "uploading");
      onChange();
      try {
        const { image, data } = await exportFrame(frame.nodeId);
        this.extracted.set(frame.nodeId, {
          name: frame.name,
          document: JSON.parse(data),
          images: await slice(image),
        });
        this.states.set(frame.nodeId, "done");
      } catch (error) {
        this.states.set(frame.nodeId, "failed");
        // 세션이 끝났거나 문서가 바뀌면 남은 프레임도 같은 이유로 실패한다
        if (
          error instanceof Error &&
          ["SESSION_EXPIRED", "FRAME_CHANGED", "DISCONNECTED"].includes(
            error.message,
          )
        ) {
          for (const rest of this.frames)
            if (!this.extracted.has(rest.nodeId))
              this.states.set(rest.nodeId, "failed");
          onChange();
          throw error;
        }
      }
      onChange();
    }
    return this.failedCount;
  }

  /** 서버에 보낼 내용. 모든 프레임을 추출한 뒤에만 부른다. */
  payload() {
    if (this.extracted.size !== this.frames.length)
      throw new Error("NOT_EXTRACTED");
    const items = this.frames.map(
      (f) => this.extracted.get(f.nodeId) as Extracted,
    );
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
