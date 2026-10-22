import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { CreateAccountDto, LoginDto } from "../src/contracts/identity.dto";

const loginIdErrors = async (
  type: new () => object,
  value: Record<string, unknown>,
) =>
  (await validate(plainToInstance(type, value))).filter(
    (e) => e.property === "loginId",
  );
const account = (loginId: unknown) => ({
  name: "계정",
  loginId,
  role: "member",
  password: "test-password-12345",
});

test("새 아이디는 이메일이 아니어도 되고 공백 제거·소문자화 후 형식을 검사한다", async () => {
  for (const loginId of [
    "qa1",
    "qa.tester",
    "QA_Tester-01",
    "  admin@example.com ",
    "a".repeat(64),
  ]) {
    assert.deepEqual(
      await loginIdErrors(CreateAccountDto, account(loginId)),
      [],
      loginId,
    );
  }
  assert.equal(
    plainToInstance(CreateAccountDto, account("  QA.Tester ")).loginId,
    "qa.tester",
  );
  for (const loginId of [
    "ab",
    "a".repeat(65),
    "홍길동",
    "qa tester",
    "qa+1@example.com",
    "",
    3,
  ]) {
    assert.notDeepEqual(
      await loginIdErrors(CreateAccountDto, account(loginId)),
      [],
      String(loginId),
    );
  }
});

test("이 형식 이전의 이메일 아이디도 로그인 요청은 형식 때문에 막지 않는다", async () => {
  for (const loginId of ["qa+1@example.com", `${"a".repeat(70)}@example.com`])
    assert.deepEqual(
      await loginIdErrors(LoginDto, { loginId, password: "password" }),
      [],
      loginId,
    );
  assert.equal(
    plainToInstance(LoginDto, { loginId: " QA+1@Example.com ", password: "x" })
      .loginId,
    "qa+1@example.com",
  );
  for (const loginId of ["", "a".repeat(255), 3])
    assert.notDeepEqual(
      await loginIdErrors(LoginDto, { loginId, password: "password" }),
      [],
      String(loginId),
    );
});

test("첫 관리자 아이디도 같은 형식을 따른다", async () => {
  const unused = {} as never;
  for (const loginId of ["ab", "qa+1@example.com", "홍길동"])
    await assert.rejects(
      createFirstAdministrator(unused, unused, loginId, "관리자"),
      loginId,
    );
});
