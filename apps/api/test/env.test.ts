import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import test from "node:test";
import { readEnv } from "../src/config/env";

const base = {
  DATABASE_URL: "postgresql://test@127.0.0.1/test",
  FILE_STORAGE_ROOT: tmpdir(),
  AI_PROVIDER: "fake",
};

test("listen 주소는 기본 loopback이고 호스팅 서비스의 PORT는 API_PORT가 없을 때만 따른다", () => {
  assert.equal(readEnv(base).host, "127.0.0.1");
  assert.equal(readEnv(base).port, 3101);
  assert.equal(readEnv({ ...base, API_HOST: "0.0.0.0" }).host, "0.0.0.0");
  assert.equal(readEnv({ ...base, PORT: "10000" }).port, 10000);
  assert.equal(
    readEnv({ ...base, PORT: "10000", API_PORT: "3200" }).port,
    3200,
  );
  assert.throws(() => readEnv({ ...base, PORT: "abc" }));
});

test("쿠키 SameSite=none은 Secure가 붙는 production에서만 허용한다", () => {
  assert.equal(readEnv(base).cookieSameSite, "lax");
  assert.equal(
    readEnv({ ...base, COOKIE_SAME_SITE: "none", NODE_ENV: "production" })
      .cookieSameSite,
    "none",
  );
  assert.throws(() =>
    readEnv({ ...base, COOKIE_SAME_SITE: "none", NODE_ENV: "development" }),
  );
  assert.throws(() => readEnv({ ...base, COOKIE_SAME_SITE: "strict" }));
});
