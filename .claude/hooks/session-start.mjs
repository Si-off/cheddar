import { existsSync, readdirSync } from "node:fs";
import { run } from "./lib.mjs";

const branch = run("git", ["branch", "--show-current"]).stdout || "(detached)";
const status = run("git", ["status", "--porcelain"]).stdout;
const changed = status ? status.split("\n").length : 0;
const records = existsSync("docs/changes")
  ? readdirSync("docs/changes").filter(
      (f) => f.endsWith(".md") && !f.startsWith("_"),
    )
  : [];

const lines = [`브랜치: ${branch}`, `미커밋 변경: ${changed}개 파일`];
if (records.length > 0) {
  lines.push(
    `진행 중 작업 기록: ${records.map((f) => `docs/changes/${f}`).join(", ")}`,
  );
}
console.log(lines.join("\n"));
