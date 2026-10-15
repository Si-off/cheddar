import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";

// Execute the generated SDK without changing generated files or adding app build outputs.
export async function loadSdk(source: string, output: string) {
  await mkdir(output, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "@tanstack")
        await loadSdkFiles(join(source, entry.name), join(output, entry.name));
    } else if (entry.name.endsWith(".ts"))
      await compile(
        join(source, entry.name),
        join(output, entry.name.replace(/\.ts$/, ".js")),
      );
  }
  return require(join(output, "sdk.gen.js")) as Record<
    string,
    (
      options: Record<string, unknown>,
    ) => Promise<{ data: unknown; error?: unknown; response: Response }>
  >;
}
async function loadSdkFiles(source: string, output: string) {
  await mkdir(output, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.isDirectory())
      await loadSdkFiles(join(source, entry.name), join(output, entry.name));
    else if (entry.name.endsWith(".ts"))
      await compile(
        join(source, entry.name),
        join(output, entry.name.replace(/\.ts$/, ".js")),
      );
  }
}
async function compile(source: string, output: string) {
  const code = ts.transpileModule(await readFile(source, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  await writeFile(output, code.outputText);
}
