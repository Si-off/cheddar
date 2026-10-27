import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { isUUID } from "class-validator";
import { API_ENV, type ApiEnv } from "../config/env";
import type { FileStorage } from "./storage";

@Injectable()
export class LocalStorage implements FileStorage {
  private root: string;
  constructor(@Inject(API_ENV) private readonly config: ApiEnv) {
    this.root = config.storageRoot;
  }
  private uuid(value: string) {
    if (!isUUID(value)) throw new Error("Invalid storage identifier.");
  }
  private async directory(path: string) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe storage directory.");
  }
  async initialize() {
    await mkdir(this.config.storageRoot, { recursive: true, mode: 0o700 });
    await this.directory(this.config.storageRoot);
    this.root = await realpath(this.config.storageRoot);
    await mkdir(join(this.root, ".incoming"), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, ".cell-images"), {
      recursive: true,
      mode: 0o700,
    });
    await this.directory(join(this.root, ".cell-images"));
    await this.check();
    const pendingCount = (await readdir(join(this.root, ".incoming"))).length;
    if (pendingCount)
      process.stderr.write(
        `Storage has ${pendingCount} unfinished upload(s); no files deleted.\n`,
      );
  }
  async check() {
    await this.directory(this.root);
    await this.directory(join(this.root, ".incoming"));
    await access(this.root, constants.R_OK | constants.W_OK);
    await access(join(this.root, ".incoming"), constants.R_OK | constants.W_OK);
  }
  async stage(fileId: string, bytes: Buffer) {
    this.uuid(fileId);
    await this.check();
    const handle = await open(
      join(this.root, ".incoming", fileId),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async publish(uploadId: string, fileId: string) {
    this.uuid(uploadId);
    this.uuid(fileId);
    await this.check();
    const parent = join(this.root, uploadId);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await this.directory(parent);
    // fileId is a fresh UUID backed by a unique DB primary key; never overwrite an existing blob.
    try {
      await lstat(join(parent, fileId));
      throw new Error("Storage key already exists.");
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
    await rename(join(this.root, ".incoming", fileId), join(parent, fileId));
  }
  async discardStage(fileId: string) {
    this.uuid(fileId);
    await this.check();
    try {
      await unlink(join(this.root, ".incoming", fileId));
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
  async cleanupStages(before: Date) {
    await this.check();
    const folder = join(this.root, ".incoming");
    for (const fileId of await readdir(folder)) {
      if (!isUUID(fileId)) continue;
      try {
        const entry = await lstat(join(folder, fileId));
        if (entry.isFile() && !entry.isSymbolicLink() && entry.mtime <= before)
          await this.discardStage(fileId);
      } catch (error) {
        // 업로드 게시나 다른 서버의 정리가 먼저 끝난 경우다.
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        )
          throw error;
      }
    }
  }
  async open(storageKey: string) {
    const parts = storageKey.split("/");
    const image = parts.length === 3 && parts[0] === ".cell-images";
    if (parts.length !== 2 && !image) throw new Error("Invalid storage key.");
    const [uploadId, fileId] = image ? parts.slice(1) : parts;
    this.uuid(uploadId);
    this.uuid(fileId);
    await this.check();
    const root = image ? join(this.root, ".cell-images") : this.root;
    await this.directory(root);
    await this.directory(join(root, uploadId));
    const path = join(root, uploadId, fileId);
    // O_NOFOLLOW is not enforced on Windows; inspect the directory entry too.
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink())
      throw new Error("Invalid stored file.");
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!(await handle.stat()).isFile())
        throw new Error("Invalid stored file.");
      return handle;
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
  async saveImage(testSetId: string, imageId: string, bytes: Buffer) {
    this.uuid(testSetId);
    this.uuid(imageId);
    await this.check();
    const root = join(this.root, ".cell-images");
    await this.directory(root);
    const parent = join(root, testSetId);
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await this.directory(parent);
    const handle = await open(
      join(parent, imageId),
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } catch (error) {
      await unlink(join(parent, imageId));
      throw error;
    } finally {
      await handle.close();
    }
    return `.cell-images/${testSetId}/${imageId}`;
  }
  async removeImage(testSetId: string, imageId: string) {
    this.uuid(testSetId);
    this.uuid(imageId);
    const root = join(this.root, ".cell-images");
    await this.directory(root);
    await this.directory(join(root, testSetId));
    await unlink(join(root, testSetId, imageId));
  }
  /** 이어 붙이다 실패한 업로드의 파일 하나를 지운다. 업로드의 다른 파일은 그대로 둔다. */
  async removeUploadFile(uploadId: string, fileId: string) {
    this.uuid(uploadId);
    this.uuid(fileId);
    await this.check();
    try {
      await this.directory(join(this.root, uploadId));
      await unlink(join(this.root, uploadId, fileId));
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
  async removeUpload(uploadId: string) {
    this.uuid(uploadId);
    await this.check();
    const path = join(this.root, uploadId);
    try {
      await this.directory(path);
      await rm(path, { recursive: true });
    } catch (error) {
      if (
        !(error instanceof Error && "code" in error && error.code === "ENOENT")
      )
        throw error;
    }
  }
}
