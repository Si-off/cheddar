import "reflect-metadata";
import { readEnv } from "../src/config/env";
import { DatabaseService } from "../src/database/database.service";
import { ProviderCostsService } from "../src/generation/provider-costs.service";

async function main() {
  const config = readEnv();
  if (!config.costSync?.openai && !config.costSync?.anthropic)
    throw new Error(
      "Configure a provider admin key and cost project/workspace ID first.",
    );
  const args = process.argv.slice(2);
  if (
    args.length !== 0 &&
    (args.length !== 2 || args.some((arg) => !/^\d{4}-\d{2}-\d{2}$/.test(arg)))
  )
    throw new Error(
      "Usage: ai:costs:sync [UTC_FROM_DATE UTC_UNTIL_DATE_EXCLUSIVE]",
    );
  const dates = args.map((arg) => new Date(`${arg}T00:00:00.000Z`));
  if (
    dates.some(
      (date, i) =>
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== args[i],
    )
  )
    throw new Error("Invalid UTC date.");
  const database = new DatabaseService(config);
  const service = new ProviderCostsService(config, database);
  try {
    await service.sync(dates[0], dates[1]);
  } finally {
    await service.onModuleDestroy();
    await database.onModuleDestroy();
  }
}
main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Cost sync failed."}\n`,
  );
  process.exitCode = 1;
});
