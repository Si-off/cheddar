import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { API_ENV, type ApiEnv } from "../config/env";

/**
 * Figma 토큰을 AES-256-GCM으로 암호화한다. 키는 DB와 따로 파일 저장소에 두어
 * DB만 유출돼도 토큰을 읽을 수 없게 한다. 처음 쓸 때 만든다.
 */
@Injectable()
export class FigmaTokenCipher {
  private key: Promise<Buffer> | null = null;
  constructor(@Inject(API_ENV) private readonly config: ApiEnv) {}
  private load() {
    this.key ??= (async () => {
      const folder = join(this.config.storageRoot, ".secrets");
      const path = join(folder, "figma-token.key");
      await mkdir(folder, { recursive: true, mode: 0o700 });
      try {
        const handle = await open(
          path,
          constants.O_CREAT |
            constants.O_EXCL |
            constants.O_WRONLY |
            constants.O_NOFOLLOW,
          0o600,
        );
        try {
          const key = randomBytes(32);
          await handle.writeFile(key);
          await handle.sync();
          return key;
        } finally {
          await handle.close();
        }
      } catch (error) {
        if (
          !(error instanceof Error && "code" in error) ||
          error.code !== "EEXIST"
        )
          throw error;
        const key = await readFile(path, {
          flag: constants.O_RDONLY | constants.O_NOFOLLOW,
        });
        if (key.length !== 32) throw new Error("Invalid Figma token key.");
        return key;
      }
    })().catch((error) => {
      this.key = null;
      throw error;
    });
    return this.key;
  }
  async encrypt(text: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", await this.load(), iv);
    const data = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
    return ["v1", iv, cipher.getAuthTag(), data]
      .map((part) =>
        typeof part === "string" ? part : part.toString("base64"),
      )
      .join(":");
  }
  async decrypt(value: string) {
    const [version, iv, tag, data] = value.split(":");
    if (version !== "v1" || !iv || !tag || !data)
      throw new Error("Invalid encrypted token.");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      await this.load(),
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(data, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }
}
