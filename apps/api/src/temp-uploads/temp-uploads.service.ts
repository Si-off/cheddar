import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq, gt, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { AuthorizationService } from "../authorization/authorization.service";
import { notFound } from "../common/errors";
import type { TempUploadDto } from "../contracts/temp-upload.dto";
import {
  DatabaseService,
  type DatabaseTransaction,
} from "../database/database.service";
import { generationJobs, tempFrames, tempUploads } from "../database/schema";
import { CLEANUP_QUEUE, QueueService } from "../generation/queue.service";
import { LocalStorage } from "../storage/local-storage";
import { imageMime, parseManifest } from "./manifest";

@Injectable()
export class TempUploadsService {
  constructor(
    @Inject(DatabaseService) readonly database: DatabaseService,
    @Inject(LocalStorage) readonly storage: LocalStorage,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(QueueService) private readonly queue: QueueService,
  ) {}
  async create(
    accountId: string,
    manifest: string,
    images: Express.Multer.File[],
  ): Promise<TempUploadDto> {
    await this.authorization.active(accountId);
    const frames = parseManifest(manifest, images);
    const id = randomUUID();
    const staged: string[] = [];
    try {
      // 파일 기록 중 프로세스가 종료되어도 만료 정리가 찾을 수 있게 행을 먼저 남긴다.
      await this.database.db.insert(tempUploads).values({ id, accountId });
      let offset = 0;
      const rows: (typeof tempFrames.$inferInsert)[] = [];
      for (const [position, frame] of frames.entries()) {
        const keys: string[] = [];
        for (const file of images.slice(offset, offset + frame.imageCount)) {
          const fileId = randomUUID();
          staged.push(fileId);
          await this.storage.stage(fileId, file.buffer);
          await this.storage.publish(id, fileId);
          keys.push(`${id}/${fileId}`);
        }
        offset += frame.imageCount;
        rows.push({
          id: randomUUID(),
          uploadId: id,
          name: frame.name,
          screenDocument: JSON.stringify(frame.document),
          imageStorageKeys: keys,
          position,
        });
      }
      await this.database.db.transaction(async (tx) => {
        await tx.insert(tempFrames).values(rows);
      });
    } catch (error) {
      await Promise.all(
        staged.map((fileId) => this.storage.discardStage(fileId)),
      );
      await this.storage.removeUpload(id);
      await this.database.db.delete(tempUploads).where(eq(tempUploads.id, id));
      throw error;
    }
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
    return this.detail(id, accountId);
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
