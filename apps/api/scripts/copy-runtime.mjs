import { copyFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export async function copyRuntime(output) {
  const folder = join(output, "src/generation/pi");
  await mkdir(folder, { recursive: true });
  await copyFile("src/generation/pi/sdk.mjs", join(folder, "sdk.mjs"));
}
if (process.argv[1]?.endsWith("copy-runtime.mjs")) await copyRuntime("dist");
