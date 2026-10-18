import { constants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
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
  async open(storageKey: string) {
    const parts = storageKey.split("/");
    if (parts.length !== 2) throw new Error("Invalid storage key.");
    const [uploadId, fileId] = parts;
    this.uuid(uploadId);
    this.uuid(fileId);
    await this.check();
    await this.directory(join(this.root, uploadId));
    const path = join(this.root, uploadId, fileId);
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
}
