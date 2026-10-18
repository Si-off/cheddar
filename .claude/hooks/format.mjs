import { existsSync } from "node:fs";
import { readStdinJson, run } from "./lib.mjs";

const input = readStdinJson();
const file = String(input?.tool_input?.file_path ?? "");
const formattable = /\.(ts|tsx|js|jsx|mjs|cjs|json|css)$/i;
const skip = /[\\/](generated|dist|node_modules|migrations[\\/]meta)[\\/]/;

if (file && formattable.test(file) && !skip.test(file) && existsSync(file)) {
  run("pnpm", [
    "exec",
    "biome",
    "check",
    "--write",
    "--no-errors-on-unmatched",
    file,
  ]);
}
