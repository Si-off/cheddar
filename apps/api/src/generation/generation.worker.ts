import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { and, inArray, sql } from "drizzle-orm";
import { GENERATION_CONCURRENCY } from "../config/env";
import { generationJobs, generationSteps } from "../database/schema";
import { TempUploadsService } from "../temp-uploads/temp-uploads.service";
import { GenerationService } from "./generation.service";
import { STAGES, type Stage } from "./model-config";
import { CLEANUP_QUEUE, GENERATION_QUEUE, QueueService } from "./queue.service";
import { StageRunner } from "./stage-runner";
@Injectable()
export class GenerationWorker implements OnApplicationBootstrap {
  constructor(
    @Inject(QueueService) private readonly queue: QueueService,
    @Inject(GenerationService) private readonly generation: GenerationService,
    @Inject(StageRunner) private readonly runner: StageRunner,
    @Inject(TempUploadsService) private readonly uploads: TempUploadsService,
  ) {}
  async onApplicationBootstrap() {
    if (this.queue.env.workersEnabled === false) return;
    const options = {
      pollingIntervalSeconds: this.queue.env.queuePollingSeconds ?? 2,
    };
    await this.queue.boss.work<{ jobId: string; stage: string }>(
      GENERATION_QUEUE,
      {
        ...options,
        localConcurrency:
          this.queue.env.generationConcurrency ?? GENERATION_CONCURRENCY,
      },
      async (jobs) => {
        for (const job of jobs)
          if (STAGES.includes(job.data.stage as Stage))
            await this.runner.process(job.data.jobId, job.data.stage as Stage);
      },
    );
    await this.queue.boss.work(CLEANUP_QUEUE, options, async () => {
      await this.uploads.cleanup();
      await this.generation.recover();
      const db = this.generation.store.database.db;
      const rows = await db
        .select({ id: generationJobs.id })
        .from(generationJobs)
        .where(
          and(
            inArray(generationJobs.status, ["completed", "failed"]),
            sql`exists (select 1 from ${generationSteps} where ${generationSteps.jobId} = ${generationJobs.id} and (${generationSteps.input} is not null or ${generationSteps.output} is not null))`,
          ),
        );
      for (const row of rows) await this.generation.cleanupJob(row.id);
    });
    await this.queue.boss.schedule(CLEANUP_QUEUE, "* * * * *");
    await this.generation.recover();
    await this.queue.boss.send(CLEANUP_QUEUE, {});
  }
}
