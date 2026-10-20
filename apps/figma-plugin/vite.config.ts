import { createHash } from "node:crypto";
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = fileURLToPath(new URL(".", import.meta.url));
const cacheKey = createHash("sha256").update(root).digest("hex").slice(0, 12);

// 원격 UI 개발 서버 전용. Figma 안의 UI가 보낸 진단 로그를 저장소 밖 파일에 남긴다
function remoteUiLog(): Plugin {
  const file = join(tmpdir(), "cheddar-plugin-ui.log");
  const write = (detail: string) =>
    appendFileSync(file, `${new Date().toISOString()} ${detail}\n`);
  return {
    name: "cheddar-remote-ui-log",
    apply: "serve",
    configureServer(server) {
      server.config.logger.info(`  원격 UI 진단 로그: ${file}`);
      server.middlewares.use((req, res, next) => {
        if (req.method !== "POST" || req.url !== "/__cheddar/log")
          return next();
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk.toString().slice(0, 8000);
        });
        req.on("end", () => {
          write(body);
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // 값이 있으면 UI를 번들에 넣지 않고 이 주소에 올릴 파일로 만든다
  const remoteUrl = loadEnv(mode, process.cwd(), "VITE_").VITE_PLUGIN_UI_URL;
  const remoteBase = remoteUrl
    ? new URL(remoteUrl).pathname.replace(/\/?$/, "/")
    : undefined;
  return {
    base: remoteBase ?? "./",
    plugins: [
      react(),
      tailwindcss(),
      remoteBase ? remoteUiLog() : viteSingleFile(),
    ],
    cacheDir: join(tmpdir(), "cheddar-vite", cacheKey, "plugin-ui"),
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src/ui", import.meta.url)) },
    },
    server: { host: "127.0.0.1", port: 5174, strictPort: true },
    preview: { host: "127.0.0.1", port: 4174, strictPort: true },
    build: {
      // 원격 UI는 플러그인 파일과 섞이지 않게 따로 두고 매번 비운다
      outDir: remoteBase ? "dist/ui" : "dist",
      emptyOutDir: Boolean(remoteBase),
      reportCompressedSize: false,
      modulePreload: false,
    },
  };
});
