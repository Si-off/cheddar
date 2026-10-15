import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = fileURLToPath(new URL(".", import.meta.url));
const cacheKey = createHash("sha256").update(root).digest("hex").slice(0, 12);

export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  cacheDir: join(tmpdir(), "cheddar-vite", cacheKey, "plugin-ui"),
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/ui", import.meta.url)) },
  },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  preview: { host: "127.0.0.1", port: 4174, strictPort: true },
  build: { outDir: "dist", emptyOutDir: false, reportCompressedSize: false },
});
