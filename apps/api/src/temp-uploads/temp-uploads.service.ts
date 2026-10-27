import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import sharp from "sharp";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { invalid, notFound } from "../common/errors";
import type { TempUploadAddedDto } from "../contracts/figma.dto";
import type { TempUploadDto } from "../contracts/temp-upload.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import { generationJobs, tempFrames, tempUploads } from "../database/schema";
import { FigmaService } from "../figma/figma.service";
import { CLEANUP_QUEUE, QueueService } from "../generation/queue.service";
import { LocalStorage } from "../storage/local-storage";
import { sourceImageFormat, toTiles } from "./images";
import {
  imageMime,
  MAX_FRAMES,
  MAX_UPLOAD_BYTES,
  parseManifest,
} from "./manifest";

type StagedFrame = { name: string; document: unknown; images: Buffer[] };

const imageDocument = (name: string, width: number, height: number) => ({
  schemaVersion: 2,
  board: { id: "image", name, width, height },
  texts: [],
  tree: [],
  links: [],
  notes: [],
});

@Injectable()
export class TempUploadsService {
  constructor(
    @Inject(DatabaseService) readonly database: DatabaseService,
    @Inject(LocalStorage) readonly storage: LocalStorage,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(FigmaService) private readonly figma: FigmaService,
  ) {}
  async create(
    accountId: string,
    manifest: string,
    images: Express.Multer.File[],
  ): Promise<TempUploadDto> {
    await this.authorization.active(accountId);
    const parsed = parseManifest(manifest, images);
    let offset = 0;
    const frames = parsed.map((frame) => {
      const files = images.slice(offset, offset + frame.imageCount);
      offset += frame.imageCount;
      return { ...frame, images: files.map((f) => f.buffer) };
    });
    const { upload } = await this.append(accountId, undefined, frames);
    return upload;
  }

  /** 사람이 올린 화면 이미지를 장마다 프레임 하나로 붙인다. */
  async addImages(
    accountId: string,
    uploadId: string | undefined,
    files: Express.Multer.File[],
  ) {
    await this.authorization.active(accountId);
    if (!files.length || files.length > MAX_FRAMES) throw invalid();
    const frames: StagedFrame[] = [];
    for (const file of files) {
      if (!(await sourceImageFormat(file.buffer))) throw invalid();
      const images = await toTiles(file.buffer).catch(() => {
        throw invalid();
      });
      const name = Buffer.from(file.originalname, "latin1")
        .toString("utf8")
        .trim()
        .slice(0, 1000);
      const { height, width } = await sharp(file.buffer).rotate().metadata();
      frames.push({
        name: name || "이미지",
        // 글자 구조가 없는 이미지는 빈 화면 문서로 두고 AI가 이미지에서 읽는다
        document: imageDocument(name || "이미지", width ?? 0, height ?? 0),
        images,
      });
    }
    return this.append(accountId, uploadId, frames);
  }

  /** Figma 링크의 보드를 읽어 붙인다. 한도를 넘는 보드는 넣지 않고 개수만 알린다. */
  async addFigmaLink(
    accountId: string,
    uploadId: string | undefined,
    url: string,
  ) {
    await this.authorization.active(accountId);
    const room = uploadId
      ? MAX_FRAMES -
        (await this.frames((await this.writable(uploadId, accountId)).id))
          .length
      : MAX_FRAMES;
    if (room <= 0) throw invalid();
    const read = await this.figma.readLink(accountId, url, room);
    const added = await this.append(accountId, uploadId, read.frames);
    return {
      ...added,
      title: read.title,
      omittedCount: added.omittedCount + read.omittedCount,
    };
  }

  private async bytes(keys: string[]) {
    let total = 0;
    for (const key of keys) {
      const handle = await this.storage.open(key);
      try {
        total += (await handle.stat()).size;
      } finally {
        await handle.close();
      }
    }
    return total;
  }

  /** 아직 생성에 쓰지 않은 내 업로드. 만료됐거나 생성이 가져간 업로드는 404 */
  private async writable(id: string, accountId: string) {
    const row = await this.owned(id, accountId);
    if (row.claimedAt) throw notFound();
    return row;
  }

  /**
   * 업로드를 만들거나 이어 붙인다. 붙일 때마다 만료를 한 시간 뒤로 미룬다.
   * 파일을 먼저 기록하고 행은 한 트랜잭션에서 넣는다. 실패하면 이번에 기록한 파일만 지운다.
   */
  async append(
    accountId: string,
    uploadId: string | undefined,
    frames: StagedFrame[],
  ): Promise<TempUploadAddedDto> {
    const created = !uploadId;
    const id = uploadId ?? randomUUID();
    if (uploadId) await this.writable(uploadId, accountId);
    const staged: string[] = [];
    const published: string[] = [];
    let addedFrameIds: string[] = [];
    let omittedCount = 0;
    try {
      // 파일 기록 중 프로세스가 종료되어도 만료 정리가 찾을 수 있게 행을 먼저 남긴다.
      if (created)
        await this.database.db.insert(tempUploads).values({ id, accountId });
      const files = frames.map((frame) =>
        frame.images.map((bytes) => ({ fileId: randomUUID(), bytes })),
      );
      for (const file of files.flat()) {
        staged.push(file.fileId);
        await this.storage.stage(file.fileId, file.bytes);
      }
      await this.database.db.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(tempUploads)
          .where(eq(tempUploads.id, id))
          .for("update");
        if (!row || row.claimedAt || row.accountId !== accountId)
          throw notFound();
        const existing = await this.frames(id, tx);
        // 프레임 수와 문서, 이미지를 합친 크기가 업로드 한도 안에 드는 만큼만 넣는다
        let used =
          (await this.bytes(existing.flatMap((f) => f.imageStorageKeys))) +
          existing.reduce((n, f) => n + Buffer.byteLength(f.screenDocument), 0);
        let room = 0;
        for (const [index, frame] of frames.entries()) {
          const size =
            Buffer.byteLength(JSON.stringify(frame.document)) +
            (files[index] ?? []).reduce((n, f) => n + f.bytes.length, 0);
          if (
            existing.length + room >= MAX_FRAMES ||
            used + size > MAX_UPLOAD_BYTES
          )
            break;
          used += size;
          room++;
        }
        if (!room) throw invalid();
        omittedCount = frames.length - room;
        const start = existing.reduce((n, f) => Math.max(n, f.position + 1), 0);
        const rows = frames.slice(0, room).map((frame, index) => ({
          id: randomUUID(),
          uploadId: id,
          name: frame.name,
          screenDocument: JSON.stringify(frame.document),
          imageStorageKeys: (files[index] ?? []).map(
            (f) => `${id}/${f.fileId}`,
          ),
          position: start + index,
        }));
        for (const file of files.slice(0, room).flat()) {
          await this.storage.publish(id, file.fileId);
          published.push(file.fileId);
        }
        await tx.insert(tempFrames).values(rows);
        await tx
          .update(tempUploads)
          .set({ expiresAt: sql`now() + interval '1 hour'` })
          .where(eq(tempUploads.id, id));
        addedFrameIds = rows.map((r) => r.id);
      });
    } catch (error) {
      await Promise.all(
        staged
          .filter((fileId) => !published.includes(fileId))
          .map((fileId) => this.storage.discardStage(fileId)),
      );
      if (created) {
        await this.storage.removeUpload(id);
        await this.database.db
          .delete(tempUploads)
          .where(eq(tempUploads.id, id));
      } else
        await Promise.all(
          published.map((fileId) => this.storage.removeUploadFile(id, fileId)),
        );
      throw error;
    }
    // 한도를 넘어 넣지 않은 파일은 기록만 하고 게시하지 않았다. 커밋 뒤라 실패해도 게시한 파일은 두고,
    // 남은 기록은 예약 정리(cleanupStages)가 지운다.
    await Promise.all(
      staged
        .filter((fileId) => !published.includes(fileId))
        .map((fileId) => this.storage.discardStage(fileId).catch(() => {})),
    );
    // 만료 시각별 작업과 주기적 복구 정리 모두 사용한다.
    try {
      await this.queue.boss.send(
        CLEANUP_QUEUE,
        {},
        { startAfter: new Date(Date.now() + 3600000) },
      );
    } catch {
      process.stderr.write(`임시 업로드 정리 예약 대기: ${id}\n`);
    }
    return {
      upload: await this.detail(id, accountId),
      addedFrameIds,
      omittedCount,
    };
  }
  async owned(
    id: string,
    accountId: string,
    db: IdentityDatabase = this.database.db,
    lock = false,
  ) {
    const query = db
      .select()
      .from(tempUploads)
      .where(
        and(
          eq(tempUploads.id, id),
          eq(tempUploads.accountId, accountId),
          or(
            gt(tempUploads.expiresAt, new Date()),
            isNotNull(tempUploads.claimedAt),
          ),
        ),
      );
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw notFound();
    return row;
  }
  frames(id: string, db: IdentityDatabase = this.database.db) {
    return db
      .select()
      .from(tempFrames)
      .where(eq(tempFrames.uploadId, id))
      .orderBy(tempFrames.position, tempFrames.id);
  }
  async detail(id: string, accountId: string): Promise<TempUploadDto> {
    const row = await this.owned(id, accountId);
    return {
      id,
      expiresAt: row.expiresAt.toISOString(),
      frames: (await this.frames(id)).map((f) => ({
        id: f.id,
        name: f.name,
        imageCount: f.imageStorageKeys.length,
      })),
    };
  }
  async thumbnail(id: string, frameId: string, accountId: string) {
    await this.owned(id, accountId);
    const frame = (await this.frames(id)).find((f) => f.id === frameId);
    if (!frame?.imageStorageKeys[0]) throw notFound();
    const handle = await this.storage.open(frame.imageStorageKeys[0]);
    try {
      const bytes = await handle.readFile();
      return { bytes, type: imageMime(bytes) ?? "application/octet-stream" };
    } finally {
      await handle.close();
    }
  }
  // 파일을 먼저 지운다. 중간에 종료돼도 행이 남아 다음 예약 실행이 이어서 정리한다.
  async remove(id: string, tx: DatabaseTransaction) {
    await tx
      .select()
      .from(tempUploads)
      .where(eq(tempUploads.id, id))
      .for("update");
    await this.storage.removeUpload(id);
    await tx.delete(tempUploads).where(eq(tempUploads.id, id));
  }
  async cleanup() {
    await this.storage.cleanupStages(new Date(Date.now() - 3600000));
    const rows = await this.database.db
      .select()
      .from(tempUploads)
      .where(lte(tempUploads.expiresAt, new Date()));
    for (const row of rows)
      await this.database.db.transaction(async (tx) => {
        const [locked] = await tx
          .select()
          .from(tempUploads)
          .where(eq(tempUploads.id, row.id))
          .for("update");
        if (!locked || locked.expiresAt > new Date()) return;
        const [active] = await tx
          .select({ id: generationJobs.id })
          .from(generationJobs)
          .where(
            and(
              eq(generationJobs.uploadId, row.id),
              inArray(generationJobs.status, ["pending", "running"]),
            ),
          );
        if (!active) await this.remove(row.id, tx);
      });
    // 완료 트랜잭션 이후 파일 삭제 중 종료된 경우도 복구한다.
    const used = await this.database.db
      .select({ id: tempUploads.id })
      .from(tempUploads)
      .where(
        sql`${tempUploads.claimedAt} is not null and not exists (select 1 from ${generationJobs} where ${generationJobs.uploadId} = ${tempUploads.id} and ${generationJobs.status} in ('pending','running'))`,
      );
    for (const row of used)
      await this.database.db.transaction((tx) => this.remove(row.id, tx));
  }
}
