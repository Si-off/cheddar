import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { readEnv } from "../src/config/env";

const base = {
  DATABASE_URL: "postgresql://test@127.0.0.1/test",
  FILE_STORAGE_ROOT: tmpdir(),
  AI_PROVIDER: "fake",
};

test("listen 주소와 포트는 기본 loopback 3101이고 API_HOST, API_PORT로 바꾼다", () => {
  assert.equal(readEnv(base).host, "127.0.0.1");
  assert.equal(readEnv(base).port, 3101);
  assert.equal(readEnv({ ...base, API_HOST: "0.0.0.0" }).host, "0.0.0.0");
  assert.equal(readEnv({ ...base, API_PORT: "3200" }).port, 3200);
  assert.throws(() => readEnv({ ...base, API_PORT: "abc" }));
});
