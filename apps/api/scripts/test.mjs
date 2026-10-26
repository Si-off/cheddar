import { spawnSync } from "node:child_process";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { copyRuntime } from "./copy-runtime.mjs";

const output = await mkdtemp(
  join(await realpath(tmpdir()), "cheddar-foundation-tests-"),
);
try {
  const compile = spawnSync(
    process.execPath,
    [
      resolve("node_modules/typescript/bin/tsc"),
      "-p",
      "tsconfig.test.json",
      "--outDir",
      output,
    ],
    { stdio: "inherit" },
  );
  if (compile.status !== 0) process.exitCode = compile.status ?? 1;
  else {
    await copyRuntime(output);
    await writeFile(join(output, "package.json"), ' {"type":"commonjs"}\n');
    await symlink(resolve("node_modules"), join(output, "node_modules"), "dir");
    const tests = spawnSync(
      process.execPath,
      [
        "--test",
        "--test-concurrency=1",
        ...process.argv.slice(2),
        join(output, "test", "*.test.js"),
      ],
      {
        stdio: "inherit",
        env: { ...process.env, API_SOURCE_ROOT: process.cwd() },
      },
    );
    process.exitCode = tests.status ?? 1;
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
