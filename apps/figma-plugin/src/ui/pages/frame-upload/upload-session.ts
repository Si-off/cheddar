import type { SelectedFrame } from "../../../protocol/messages";

export type UploadFrame = SelectedFrame & {
  figmaFileKey: string;
  figmaNodeId: string;
  imageFileId: string;
  dataFileId: string;
};
export type BundleInput = {
  clientRequestId: string;
  name: string;
  frames: Omit<UploadFrame, "nodeId">[];
};
export type UploadResult = { id: string; projectId: string; name: string };
export type UploadProgress = {
  phase: "extracting" | "image" | "data" | "registering";
  index: number;
  total: number;
};
export type UploadGateway = {
  file: (
    projectId: string,
    file: File,
    signal: AbortSignal,
  ) => Promise<{ id: string }>;
  bundle: (
    projectId: string,
    input: BundleInput,
    signal: AbortSignal,
  ) => Promise<UploadResult>;
};
export type FrameExporter = {
  export: (
    sessionId: string,
    nodeId: string,
  ) => Promise<{ image: Uint8Array; data: string }>;
  validate: (sessionId: string) => Promise<unknown>;
};

type PendingFrame = {
  frame: SelectedFrame;
  imageFileId?: string;
  dataFileId?: string;
  extracted?: { image: Uint8Array; data: string };
};

// Lifetime is one open plugin session. Confirmed files survive a retry, while
// exported bytes are released as soon as both files have been acknowledged.
export class FrameUploadSession {
  private readonly pending: PendingFrame[];
  private registration?: BundleInput;
  private running = false;
  constructor(
    readonly projectId: string,
    readonly name: string,
    readonly sessionId: string,
    readonly fileKey: string,
    frames: SelectedFrame[],
    private readonly clientRequestId: string,
  ) {
    this.pending = frames.map((frame) => ({ frame: { ...frame } }));
  }

  get frames() {
    return this.pending.map((item) => item.frame);
  }
  get registrationPending() {
    return this.registration !== undefined;
  }

  async run(
    gateway: UploadGateway,
    exporter: FrameExporter,
    signal: AbortSignal,
    progress: (value: UploadProgress) => void,
  ) {
    if (this.running) throw new Error("An upload is already running.");
    this.running = true;
    try {
      if (!this.registration) {
        await exporter.validate(this.sessionId);
        for (const [index, item] of this.pending.entries()) {
          signal.throwIfAborted();
          const report = (phase: UploadProgress["phase"]) =>
            progress({ phase, index: index + 1, total: this.pending.length });
          if (item.imageFileId && item.dataFileId) continue;
          if (!item.extracted) {
            report("extracting");
            item.extracted = await exporter.export(
              this.sessionId,
              item.frame.nodeId,
            );
          }
          signal.throwIfAborted();
          const filename = item.frame.name
            .replace(/[\r\n\0/\\]/g, "-")
            .slice(0, 180);
          if (!item.imageFileId) {
            report("image");
            const file = new File(
              [new Uint8Array(item.extracted.image)],
              `${filename}.png`,
              { type: "image/png" },
            );
            item.imageFileId = (
              await gateway.file(this.projectId, file, signal)
            ).id;
          }
          if (!item.dataFileId) {
            report("data");
            const file = new File([item.extracted.data], `${filename}.json`, {
              type: "application/json",
            });
            item.dataFileId = (
              await gateway.file(this.projectId, file, signal)
            ).id;
          }
          item.extracted = undefined;
        }
        await exporter.validate(this.sessionId);
        this.registration = {
          clientRequestId: this.clientRequestId,
          name: this.name,
          frames: this.pending.map(({ frame, imageFileId, dataFileId }) => {
            if (!imageFileId || !dataFileId)
              throw new Error("Files are incomplete.");
            return {
              figmaFileKey: this.fileKey,
              figmaNodeId: frame.nodeId,
              name: frame.name,
              width: frame.width,
              height: frame.height,
              imageFileId,
              dataFileId,
            };
          }),
        };
      }
      signal.throwIfAborted();
      progress({
        phase: "registering",
        index: this.pending.length,
        total: this.pending.length,
      });
      // A lost response is retried with exactly the same key and immutable body,
      // even if the Figma selection or document has changed since submission.
      return await gateway.bundle(this.projectId, this.registration, signal);
    } finally {
      this.running = false;
    }
  }
}
