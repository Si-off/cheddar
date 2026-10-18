import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { API_ENV, type ApiEnv } from "../config/env";
import { DatabaseService } from "../database/database.service";
import { aiProviderCosts } from "../database/schema";
import { fetchCosts } from "./provider-costs";
import type { AiProvider } from "./usage";

@Injectable()
export class ProviderCostsService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private active?: Promise<void>;
  private readonly abort = new AbortController();
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.costSync?.openai && !this.env.costSync?.anthropic) return;
    void this.sync().catch(() => undefined);
    this.timer = setInterval(() => {
      void this.sync().catch(() => undefined);
    }, this.env.costSync.intervalMs);
    this.timer.unref();
  }

  // Re-fetch the trailing 7 UTC days, including the current partial day.
  // Replace only after all pages validate, so delayed/corrected reports converge.
  sync(start?: Date, end?: Date): Promise<void> {
    if (this.active) return this.active;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const until = end ?? new Date(today.getTime() + 86_400_000);
    const from = start ?? new Date(today.getTime() - 6 * 86_400_000);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(until.getTime()) ||
      from.getTime() % 86_400_000 ||
      until.getTime() % 86_400_000 ||
      until <= from ||
      until.getTime() - from.getTime() > 31 * 86_400_000
    )
      return Promise.reject(
        new Error("Cost sync requires 1-31 complete UTC date buckets"),
      );
    this.active = this.run(from, until).finally(() => {
      this.active = undefined;
    });
    return this.active;
  }

  private async run(start: Date, end: Date) {
    let failed = false;
    for (const provider of ["openai", "anthropic"] as AiProvider[]) {
      const source = this.env.costSync?.[provider];
      if (!source) continue;
      try {
        const syncedAt = new Date();
        const rows = await fetchCosts(
          provider,
          source,
          start,
          end,
          AbortSignal.any([this.abort.signal, AbortSignal.timeout(60_000)]),
        );
        await this.database.db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${`ai-costs:${provider}:${source.scopeId}`}, 0))`,
          );
          const range = and(
            eq(aiProviderCosts.provider, provider),
            eq(aiProviderCosts.scopeId, source.scopeId),
            gte(aiProviderCosts.bucketStart, start),
            lt(aiProviderCosts.bucketStart, end),
          );
          const newer = await tx
            .select({ itemKey: aiProviderCosts.itemKey })
            .from(aiProviderCosts)
            .where(and(range, gt(aiProviderCosts.syncedAt, syncedAt)))
            .limit(1);
          if (newer.length) return;
          await tx.delete(aiProviderCosts).where(range);
          for (let offset = 0; offset < rows.length; offset += 200)
            await tx
              .insert(aiProviderCosts)
              .values(
                rows
                  .slice(offset, offset + 200)
                  .map((row) => ({ ...row, syncedAt })),
              );
        });
        process.stdout.write(
          `${JSON.stringify({ event: "ai_costs_synced", provider, rows: rows.length })}\n`,
        );
      } catch {
        failed = true;
        process.stderr.write(
          `${JSON.stringify({ event: "ai_cost_sync_failed", provider })}\n`,
        );
      }
    }
    if (failed)
      throw new Error(
        "Provider cost sync failed; previous records retained for failed providers",
      );
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.abort.abort();
    await this.active?.catch(() => undefined);
  }
}
