import type { GenerationCurrentDto } from "../contracts/generation.dto";
export function formatEvent(event: "progress" | "done", data: object) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
export const heartbeat = ": keep-alive\n\n";
export function jobEvent(job: GenerationCurrentDto) {
  if (job.status === "succeeded")
    return formatEvent("done", {
      status: job.status,
      addedCount: job.addedCount,
      reviewCount: job.reviewCount,
    });
  if (job.status === "failed")
    return formatEvent("done", {
      status: job.status,
      errorMessage: job.errorMessage,
    });
  return formatEvent("progress", { stage: job.stage, status: job.status });
}
