import { existsSync } from "node:fs";
import { readStdinJson, run } from "./lib.mjs";

const input = readStdinJson();
if (input?.stop_hook_active) process.exit(0);

const changed = run("git", ["diff", "--name-only", "HEAD"]).stdout;
const untracked = run("git", [
  "ls-files",
  "--others",
  "--exclude-standard",
]).stdout;
const files = [...new Set([...changed.split("\n"), ...untracked.split("\n")])]
  .filter((f) => f && /\.(ts|tsx|js|jsx|mjs|cjs|json|css)$/i.test(f))
  .filter(
    (f) =>
      !/(^|\/)(generated|dist|node_modules)\//.test(f) &&
      !/migrations\/meta\//.test(f),
  )
  .filter((f) => existsSync(f));

if (files.length === 0) process.exit(0);

const lint = run("pnpm", [
  "exec",
  "biome",
  "check",
  "--no-errors-on-unmatched",
  ...files,
]);
if (lint.status !== 0) {
  const detail = (lint.stdout || lint.stderr)
    .split("\n")
    .slice(0, 40)
    .join("\n");
  console.log(
    JSON.stringify({
      decision: "block",
      reason: `Biome 검사가 실패했다. 수정 후 다시 종료한다.\n${detail}`,
    }),
  );
}
