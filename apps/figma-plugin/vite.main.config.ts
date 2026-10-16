import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode, command }) => {
  const configured =
    loadEnv(mode, process.cwd(), "VITE_").VITE_WEB_BASE_URL ||
    (command === "serve" ? "http://127.0.0.1:5173" : "");
  let webBaseUrl = "";
  if (configured) {
    const url = new URL(configured);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("VITE_WEB_BASE_URL must be an HTTP(S) base URL");
    webBaseUrl = url.toString().replace(/\/$/, "");
  }
  return {
    define: { __WEB_BASE_URL__: JSON.stringify(webBaseUrl) },
    build: {
      target: "es2017",
      outDir: "dist",
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            mode === "prototype"
              ? "./src/main/design-prototype.ts"
              : "./src/main/index.ts",
            import.meta.url,
          ),
        ),
        name: "CheddarPlugin",
        formats: ["iife"],
        fileName: () =>
          mode === "prototype" ? "design-prototype-main.js" : "main.js",
      },
    },
  };
});
