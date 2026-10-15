import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2017",
    outDir: "dist",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: fileURLToPath(new URL("./src/main/index.ts", import.meta.url)),
      name: "CheddarPlugin",
      formats: ["iife"],
      fileName: () => "main.js",
    },
  },
});
