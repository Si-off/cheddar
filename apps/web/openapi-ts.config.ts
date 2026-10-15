import { defineConfig } from "@hey-api/openapi-ts";

const input = process.env.OPENAPI_INPUT;
if (!input) {
  throw new Error(
    "OPENAPI_INPUT에 실제 OpenAPI 명세의 URL 또는 절대 경로를 지정하세요.",
  );
}

export default defineConfig({
  input,
  output: "src/shared/api/generated",
  plugins: [
    "@hey-api/typescript",
    "@hey-api/sdk",
    "@hey-api/client-fetch",
    "@tanstack/react-query",
  ],
});
