import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = process.env.DEMO_PLUGIN_OUTPUT || "/output";
await mkdir(resolve(output, "dist"), { recursive: true });
for (const file of ["main.js", "index.html"])
  await copyFile(
    resolve("apps/figma-plugin/dist", file),
    resolve(output, "dist", file),
  );
const manifest = JSON.parse(
  await readFile("apps/figma-plugin/manifest.json", "utf8"),
);
manifest.name = "테스트 시나리오 제네레이터 (시연)";
await writeFile(
  resolve(output, "manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log("Figma 등록 파일: demo/figma-plugin/manifest.json");
