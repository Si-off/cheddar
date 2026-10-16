import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
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
}));
