import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const key = createHash("sha256")
  .update(fileURLToPath(new URL(".", import.meta.url)))
  .digest("hex")
  .slice(0, 12);
export default defineConfig({
  testDir: "./src/pages",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  outputDir: join(tmpdir(), "cheddar-playwright", key, "results"),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:5176",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
