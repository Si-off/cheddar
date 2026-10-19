import type { FileHandle } from "node:fs/promises";
export interface FileStorage {
  initialize(): Promise<void>;
  check(): Promise<void>;
  stage(fileId: string, bytes: Buffer): Promise<void>;
  publish(uploadId: string, fileId: string): Promise<void>;
  discardStage(fileId: string): Promise<void>;
  open(storageKey: string): Promise<FileHandle>;
}
