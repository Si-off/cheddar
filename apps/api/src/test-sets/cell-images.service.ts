import { randomUUID } from "node:crypto";
import { Inject, Injectable, StreamableFile } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import sharp from "sharp";
import { notFound } from "../common/errors";
import type { CellImageDto } from "../contracts/cell-image.dto";
import { cellImages } from "../database/schema";
import { LocalStorage } from "../storage/local-storage";
import { MAX_CELL_IMAGE_BYTES } from "./cell-image-upload.interceptor";
import { forbidden, type SetSubject, TestSetsStore } from "./test-sets.store";
import { validationFailed } from "./values";

const formats: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
@Injectable()
export class CellImagesService {
  constructor(
    @Inject(TestSetsStore) private readonly store: TestSetsStore,
    @Inject(LocalStorage) private readonly storage: LocalStorage,
  ) {}
  async upload(
    id: string,
    subject: SetSubject,
    file?: Express.Multer.File,
  ): Promise<CellImageDto> {
    let saved: { setId: string; id: string } | undefined;
    try {
      return await this.store.database.db.transaction(async (tx) => {
        const { row, access, actor } = await this.store.visible(
          id,
          subject,
          tx,
          true,
        );
        if (!access.canEdit) throw forbidden();
        if (!file?.buffer.length)
          return validationFailed("이미지 파일을 선택해주세요.");
        if (file.buffer.length > MAX_CELL_IMAGE_BYTES)
          return validationFailed("10MB 이하 이미지만 넣을 수 있습니다.");
        let width: number, height: number, contentType: string;
        try {
          const image = sharp(file.buffer, { failOn: "warning" });
          const meta = await image.metadata();
          contentType = formats[meta.format ?? ""];
          if (
            !contentType ||
            contentType !== file.mimetype ||
            !meta.width ||
            !meta.height
          )
            throw new Error("image");
          width = meta.width;
          height = meta.height;
          // 헤더만 위조한 파일과 손상된 픽셀 데이터도 거부한다.
          await image.stats();
        } catch {
          return validationFailed(
            "PNG, JPG, GIF, WebP 이미지만 넣을 수 있습니다. 파일이 손상됐다면 다른 이미지를 선택해주세요.",
          );
        }
        const imageId = randomUUID();
        const storageKey = await this.storage.saveImage(
          row.id,
          imageId,
          file.buffer,
        );
        saved = { setId: row.id, id: imageId };
        await tx.insert(cellImages).values({
          id: imageId,
          testSetId: row.id,
          storageKey,
          contentType,
          width,
          height,
          byteSize: file.buffer.length,
          accountId: actor.kind === "account" ? actor.id : null,
          visitorSessionId: actor.kind === "visitor" ? actor.id : null,
        });
        return { id: imageId, width, height };
      });
    } catch (error) {
      if (saved) await this.storage.removeImage(saved.setId, saved.id);
      throw error;
    }
  }
  async read(id: string, subject: SetSubject, imageId: string) {
    const image = await this.store.database.db.transaction(async (tx) => {
      const { row } = await this.store.visible(id, subject, tx, true);
      const [image] = await tx
        .select()
        .from(cellImages)
        .where(
          and(eq(cellImages.testSetId, row.id), eq(cellImages.id, imageId)),
        );
      if (!image) throw notFound();
      return image;
    });
    const handle = await this.storage.open(image.storageKey);
    try {
      return { image, bytes: await handle.readFile() };
    } finally {
      await handle.close();
    }
  }
  async download(
    id: string,
    subject: SetSubject,
    imageId: string,
    response: Response,
  ) {
    const { image, bytes } = await this.read(id, subject, imageId);
    response.setHeader("Cache-Control", "private, max-age=31536000, immutable");
    return new StreamableFile(bytes, {
      type: image.contentType,
      length: bytes.length,
    });
  }
}
