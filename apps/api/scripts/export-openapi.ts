import "reflect-metadata";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";

async function main() {
  const app = await createApp(
    {
      databaseUrl: "postgresql://unused:unused@127.0.0.1:1/unused",
      storageRoot: resolve(tmpdir(), "cheddar-openapi-unused"),
      port: 3101,
      host: "127.0.0.1",
      corsOrigins: [],
    },
    resolve(process.cwd(), "migrations"),
  );
  try {
    const document = `${JSON.stringify(createDocument(app), null, 2)}\n`;
    if (process.argv[2] === "--check") {
      if (document !== (await readFile(resolve("openapi.json"), "utf8")))
        throw new Error("OpenAPI is stale.");
      process.stdout.write("OpenAPI matches the current runtime contract.\n");
    } else
      await writeFile(resolve(process.argv[2] ?? "openapi.json"), document);
  } finally {
    await app.close();
  }
}
main().catch(() => {
  process.stderr.write("OpenAPI export failed.\n");
  process.exitCode = 1;
});
