import { createHash } from "node:crypto";
import { type AiProvider, money } from "./usage";

export type CostSource = { adminKey: string; scopeId: string };
export type CostRow = {
  provider: AiProvider;
  scopeId: string;
  bucketStart: Date;
  bucketEnd: Date;
  itemKey: string;
  dimensions: Record<string, string | null>;
  amountUsd: string;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid cost report");
  return value as Record<string, unknown>;
};
const dimension = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > 500)
    throw new Error("Invalid cost dimension");
  return value;
};

export async function fetchCosts(
  provider: AiProvider,
  source: CostSource,
  start: Date,
  end: Date,
  signal: AbortSignal,
): Promise<CostRow[]> {
  const openai = provider === "openai";
  const url = new URL(
    openai
      ? "https://api.openai.com/v1/organization/costs"
      : "https://api.anthropic.com/v1/organizations/cost_report",
  );
  url.searchParams.set(
    openai ? "start_time" : "starting_at",
    openai ? String(start.getTime() / 1000) : start.toISOString(),
  );
  url.searchParams.set(
    openai ? "end_time" : "ending_at",
    openai ? String(end.getTime() / 1000) : end.toISOString(),
  );
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", "31");
  for (const group of openai
    ? ["project_id", "line_item"]
    : ["workspace_id", "description"])
    url.searchParams.append(openai ? "group_by" : "group_by[]", group);
  if (openai) url.searchParams.append("project_ids", source.scopeId);
  const rows: CostRow[] = [];
  const cursors = new Set<string>();
  const items = new Set<string>();
  for (let page = 0; page < 100; page++) {
    const response = await fetch(url, {
      headers: openai
        ? { Authorization: `Bearer ${source.adminKey}` }
        : { "x-api-key": source.adminKey, "anthropic-version": "2023-06-01" },
      signal,
    });
    if (!response.ok) throw new Error(`AI_COST_HTTP_${response.status}`);
    const report = object(await response.json());
    if (!Array.isArray(report.data) || typeof report.has_more !== "boolean")
      throw new Error("Invalid cost report page");
    for (const value of report.data) {
      const bucket = object(value);
      const bucketStart = new Date(
        openai ? Number(bucket.start_time) * 1000 : String(bucket.starting_at),
      );
      const bucketEnd = new Date(
        openai ? Number(bucket.end_time) * 1000 : String(bucket.ending_at),
      );
      if (
        !Number.isFinite(bucketStart.getTime()) ||
        !Number.isFinite(bucketEnd.getTime()) ||
        bucketStart.getTime() % 86_400_000 ||
        bucketEnd.getTime() - bucketStart.getTime() !== 86_400_000 ||
        bucketStart < start ||
        bucketEnd > end ||
        !Array.isArray(bucket.results)
      )
        throw new Error("Invalid cost bucket");
      for (const value of bucket.results) {
        const result = object(value);
        const remoteScope = dimension(
          result[openai ? "project_id" : "workspace_id"],
        );
        if ((remoteScope ?? "default") !== source.scopeId) continue;
        const dimensions: Record<string, string | null> = {};
        for (const field of openai
          ? ["project_id", "line_item"]
          : [
              "workspace_id",
              "description",
              "model",
              "service_tier",
              "token_type",
              "context_window",
              "inference_geo",
              "cost_type",
            ])
          dimensions[field] = dimension(result[field]);
        const amount = openai ? object(result.amount) : result;
        if (String(amount.currency).toUpperCase() !== "USD")
          throw new Error("Unsupported cost currency");
        const amountUsd = money(openai ? amount.value : result.amount, !openai);
        const itemKey = createHash("sha256")
          .update(JSON.stringify(dimensions))
          .digest("hex");
        const identity = `${bucketStart.toISOString()}:${itemKey}`;
        if (items.has(identity)) throw new Error("Duplicate cost item");
        items.add(identity);
        rows.push({
          provider,
          scopeId: source.scopeId,
          bucketStart,
          bucketEnd,
          itemKey,
          dimensions,
          amountUsd,
        });
      }
    }
    if (!report.has_more) return rows;
    if (
      typeof report.next_page !== "string" ||
      !report.next_page ||
      cursors.has(report.next_page)
    )
      throw new Error("Invalid cost cursor");
    cursors.add(report.next_page);
    url.searchParams.set("page", report.next_page);
  }
  throw new Error("Cost report exceeds page limit");
}
