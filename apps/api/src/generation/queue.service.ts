import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PgBoss } from "pg-boss";
import { API_ENV, type ApiEnv } from "../config/env";

export const GENERATION_QUEUE = "cheddar-generation-stage";
export const CLEANUP_QUEUE = "cheddar-temp-cleanup";
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  readonly boss: PgBoss;
  constructor(@Inject(API_ENV) readonly env: ApiEnv) {
    this.boss = new PgBoss({ connectionString: env.databaseUrl, max: 3 });
    this.boss.on("error", () =>
      process.stderr.write("생성 작업 큐 연결을 확인하세요.\n"),
    );
  }
  async onModuleInit() {
    if (this.env.workersEnabled === false) return;
    await this.boss.start();
    await this.boss.createQueue(GENERATION_QUEUE, {
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: true,
      expireInSeconds: 1800,
    });
    await this.boss.createQueue(CLEANUP_QUEUE, {
      retryLimit: 2,
      retryDelay: 1,
      retryBackoff: true,
    });
  }
  async enqueue(jobId: string, stage: string) {
    await this.boss.send(GENERATION_QUEUE, { jobId, stage });
  }
  async onModuleDestroy() {
    await this.boss.stop({ graceful: true, timeout: 10000 });
  }
}
@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}
