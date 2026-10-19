import assert from "node:assert/strict";
import test from "node:test";
import {
  hashPassword,
  hashToken,
  newToken,
  verifyPassword,
} from "../src/auth/credentials";

test("scrypt 비밀번호는 임의 salt를 사용하며 올바른 비밀번호만 통과", async () => {
  const first = await hashPassword("테스트-비밀번호-123"),
    second = await hashPassword("테스트-비밀번호-123");
  assert.notEqual(first, second);
  assert.ok(!first.includes("비밀번호"));
  assert.equal(await verifyPassword("테스트-비밀번호-123", first), true);
  assert.equal(await verifyPassword("잘못된 비밀번호", first), false);
  assert.equal(await verifyPassword("어떤 비밀번호", null), false);
  assert.equal(await verifyPassword("어떤 비밀번호", "broken"), false);
});
test("세션과 링크는 임의 256비트 토큰을 발급하고 SHA-256만 저장", () => {
  const first = newToken(),
    second = newToken();
  assert.match(first, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.match(hashToken(first), /^[a-f0-9]{64}$/);
  assert.notEqual(hashToken(first), first);
  assert.equal(hashToken(first), hashToken(first));
});
