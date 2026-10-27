import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";

function httpBaseUrl(name: string, configured: string) {
  if (!configured) return "";
  const url = new URL(configured);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(`${name} must be an HTTP(S) base URL`);
  return url.toString().replace(/\/$/, "");
}

// 원격 UI 빌드에서 manifest의 ui 파일. Figma가 띄우면 곧바로 원격 UI로 이동한다
function remoteUiShell(url: string): Plugin {
  return {
    name: "remote-ui-shell",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "index.html",
        source: `<!doctype html>\n<meta charset="utf-8" />\n<script>window.location.href = ${JSON.stringify(url)};</script>\n`,
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  // main은 개발 중에도 감시 빌드라 serve가 아니다. 배포 빌드에는 로컬 주소를 넣지 않는다
  const webBaseUrl = httpBaseUrl(
    "VITE_WEB_BASE_URL",
    env.VITE_WEB_BASE_URL ||
      (mode === "development" ? "http://127.0.0.1:5173" : ""),
  );
  // 값이 있으면 UI를 번들에 넣지 않고 이 주소의 페이지로 띄운다
  const pluginUiUrl = httpBaseUrl(
    "VITE_PLUGIN_UI_URL",
    env.VITE_PLUGIN_UI_URL ?? "",
  );
  // 배포용 manifest가 원격 UI를 막으면 Figma에서 빈 창만 뜬다
  if (pluginUiUrl) {
    const manifest = JSON.parse(
      readFileSync(new URL("./manifest.json", import.meta.url), "utf8"),
    );
    const origin = new URL(pluginUiUrl).origin;
    const { allowedDomains = [], devAllowedDomains = [] } =
      manifest.networkAccess ?? {};
    if (![...allowedDomains, ...devAllowedDomains].includes(origin))
      throw new Error(
        `manifest.json networkAccess must allow ${origin} for the remote UI`,
      );
  }
  return {
    define: {
      __WEB_BASE_URL__: JSON.stringify(webBaseUrl),
      __PLUGIN_UI_ORIGIN__: JSON.stringify(
        pluginUiUrl ? new URL(pluginUiUrl).origin : "",
      ),
    },
    plugins: pluginUiUrl ? [remoteUiShell(`${pluginUiUrl}/`)] : [],
    build: {
      target: "es2017",
      outDir: "dist",
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)),
        name: "FigmaPlugin",
        formats: ["iife"],
        fileName: () => "main.js",
      },
    },
  };
});
