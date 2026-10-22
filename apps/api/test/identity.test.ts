import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { hashToken } from "../src/auth/credentials";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import type {
  AccountDto,
  AccountPageDto,
  MeDto,
} from "../src/contracts/identity.dto";
import { accounts, sessions } from "../src/database/schema";
import { openTestDatabase } from "./database";

const password = "테스트-비밀번호-12345";
const code = (expected: string) => (error: unknown) =>
  error instanceof ApiError && error.code === expected;
test("실제 PostgreSQL에서 관리자·구성원, 계정과 비밀번호·세션 계약", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(
    { ...lease.config, workersEnabled: false },
    lease.folder,
  );
  try {
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`;
    const service = app.get(AccountsService),
      auth = app.get(AuthService),
      authorization = app.get(AuthorizationService);
    const bootstrap = await createFirstAdministrator(
      authorization,
      service,
      " ADMIN@example.com ",
      "첫 관리자",
    );
    lease.accountIds.push(bootstrap.account.id);
    const adminId = bootstrap.account.id;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = adminCookie,
    ) =>
      fetch(base + path, {
        method,
        headers: {
          Origin: lease.config.corsOrigins[0],
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return response.json() as Promise<T>;
    };
    const error = async (
      response: Response,
      status: number,
      expected: string,
    ) => {
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        expected,
      );
    };
    let adminCookie = "";
    await t.test(
      "첫 관리자는 임의 임시 비밀번호로 즉시 로그인하며 두 번 만들 수 없다",
      async () => {
        assert.equal(bootstrap.account.role, "admin");
        assert.equal(bootstrap.account.status, "active");
        assert.equal(bootstrap.account.loginId, "admin@example.com");
        assert.ok(bootstrap.password.length >= 16);
        const login = await request(
          "/auth/login",
          "POST",
          { loginId: "ADMIN@EXAMPLE.COM", password: bootstrap.password },
          "",
        );
        await json<MeDto>(login);
        const cookie = login.headers.get("set-cookie") ?? "";
        assert.match(cookie, /HttpOnly/i);
        assert.match(cookie, /SameSite=Lax/i);
        assert.doesNotMatch(cookie, /; Secure/i);
        assert.equal(
          login.headers.get("access-control-allow-credentials"),
          "true",
        );
        adminCookie = cookie.split(";")[0];
        assert.equal(
          (
            await request("/auth/password", "POST", {
              currentPassword: bootstrap.password,
              newPassword: password,
            })
          ).status,
          204,
        );
        await assert.rejects(
          createFirstAdministrator(
            authorization,
            service,
            "again",
            "다음 관리자",
          ),
          code("ALREADY_BOOTSTRAPPED"),
        );
        const me = await json<MeDto>(await request("/auth/me"));
        assert.deepEqual(
          Object.keys(me).sort(),
          ["id", "name", "loginId", "role", "status"].sort(),
        );
        assert.equal(me.role, "admin");
        await error(
          await request(
            "/auth/login",
            "POST",
            { loginId: me.loginId, password: "wrong" },
            "",
          ),
          401,
          "INVALID_CREDENTIALS",
        );
        await error(
          await request("/auth/me", "GET", undefined, ""),
          401,
          "UNAUTHENTICATED",
        );
      },
    );
    let member!: AccountDto, memberCookie!: string;
    await t.test(
      "관리자는 처음 비밀번호를 정하고 계정 DTO와 중복 아이디 검증을 받는다",
      async () => {
        member = await json<AccountDto>(
          await request("/accounts", "POST", {
            name: " 구성원 ",
            loginId: " QA.Member ",
            role: "member",
            password,
          }),
          201,
        );
        lease.accountIds.push(member.id);
        assert.deepEqual(
          Object.keys(member).sort(),
          ["id", "name", "loginId", "role", "status", "createdAt"].sort(),
        );
        assert.equal(member.name, "구성원");
        assert.equal(member.loginId, "qa.member");
        assert.equal(member.status, "active");
        assert.ok(!Number.isNaN(Date.parse(member.createdAt)));
        const login = await request(
          "/auth/login",
          "POST",
          { loginId: member.loginId, password },
          "",
        );
        await json(login);
        memberCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
        assert.equal(
          (
            await request("/accounts", "POST", {
              name: "중복",
              loginId: member.loginId.toUpperCase(),
              role: "member",
              password,
            })
          ).status,
          409,
        );
        for (const patch of [
          { password: "short" },
          { password: "x".repeat(129) },
          { role: "administrator" },
          { loginId: "bad id" },
        ])
          assert.equal(
            (
              await request("/accounts", "POST", {
                name: "오류",
                loginId: randomUUID(),
                role: "member",
                password,
                ...patch,
              })
            ).status,
            400,
          );
        for (const body of [
          { loginId: "new.id" },
          { name: null },
          { role: null },
          { affiliationId: randomUUID() },
          { assignments: [] },
          { expiresAt: null },
        ])
          assert.equal(
            (await request(`/accounts/${member.id}`, "PATCH", body)).status,
            400,
          );
        assert.equal(
          (
            await json<AccountDto>(
              await request(`/accounts/${member.id}`, "PATCH", {
                name: "새 이름",
              }),
            )
          ).name,
          "새 이름",
        );
      },
    );
    await t.test("구성원은 모든 계정 관리 API에서 403", async () => {
      for (const [path, method, body] of [
        ["/accounts", "GET", undefined],
        [
          "/accounts",
          "POST",
          { name: "금지", loginId: "forbidden", role: "admin", password },
        ],
        [`/accounts/${member.id}`, "GET", undefined],
        [`/accounts/${member.id}`, "PATCH", { role: "admin" }],
        [`/accounts/${member.id}/deactivate`, "POST", undefined],
        [`/accounts/${member.id}/reactivate`, "POST", undefined],
        [`/accounts/${member.id}/password`, "PUT", { password }],
      ] as const)
        await error(
          await request(path, method, body, memberCookie),
          403,
          "FORBIDDEN",
        );
    });
    await t.test("마지막 활성 관리자의 강등·비활성화는 롤백한다", async () => {
      for (const [path, method, body] of [
        [`/accounts/${adminId}`, "PATCH", { role: "member" }],
        [`/accounts/${adminId}/deactivate`, "POST", undefined],
      ] as const)
        await error(
          await request(path, method, body),
          409,
          "LAST_ACTIVE_ADMIN",
        );
      assert.equal((await service.detail(adminId)).role, "admin");
      assert.equal((await service.detail(adminId)).status, "active");
    });
    await t.test(
      "내 비밀번호 오류와 길이를 검사하고 지금 세션만 유지한다",
      async () => {
        const other = await auth.login(member.loginId, password);
        await error(
          await request(
            "/auth/password",
            "POST",
            { currentPassword: "wrong", newPassword: password },
            memberCookie,
          ),
          400,
          "CURRENT_PASSWORD_INCORRECT",
        );
        assert.equal(await auth.authenticate(other.token), member.id);
        assert.equal(
          (
            await request(
              "/auth/password",
              "POST",
              { currentPassword: password, newPassword: "short" },
              memberCookie,
            )
          ).status,
          400,
        );
        const next = "새로운-비밀번호-12345";
        assert.equal(
          (
            await request(
              "/auth/password",
              "POST",
              { currentPassword: password, newPassword: next },
              memberCookie,
            )
          ).status,
          204,
        );
        await json(await request("/auth/me", "GET", undefined, memberCookie));
        await assert.rejects(
          auth.authenticate(other.token),
          code("UNAUTHENTICATED"),
        );
        await assert.rejects(
          auth.login(member.loginId, password),
          code("INVALID_CREDENTIALS"),
        );
        const expired = await auth.login(member.loginId, next);
        await lease.database.db
          .update(sessions)
          .set({ expiresAt: new Date(0) })
          .where(eq(sessions.tokenHash, hashToken(expired.token)));
        await assert.rejects(
          auth.changePassword(member.id, expired.token, next, password),
          code("UNAUTHENTICATED"),
        );
        await assert.rejects(
          auth.login(member.loginId, password),
          code("INVALID_CREDENTIALS"),
        );
      },
    );
    await t.test(
      "관리자 비밀번호 다시 정하기는 모든 세션을 끊고 비활성 계정을 자동 활성화하지 않는다",
      async () => {
        const prior = await auth.login(member.loginId, "새로운-비밀번호-12345");
        assert.equal(
          (
            await request(`/accounts/${member.id}/password`, "PUT", {
              password,
            })
          ).status,
          204,
        );
        for (const cookie of [memberCookie, `${SESSION_COOKIE}=${prior.token}`])
          await error(
            await request("/auth/me", "GET", undefined, cookie),
            401,
            "UNAUTHENTICATED",
          );
        memberCookie = `${SESSION_COOKIE}=${(await auth.login(member.loginId, password)).token}`;
        assert.equal(
          (
            await json<AccountDto>(
              await request(`/accounts/${member.id}/deactivate`, "POST"),
              201,
            )
          ).status,
          "inactive",
        );
        await error(
          await request("/auth/me", "GET", undefined, memberCookie),
          401,
          "UNAUTHENTICATED",
        );
        await assert.rejects(
          auth.login(member.loginId, password),
          code("INVALID_CREDENTIALS"),
        );
        assert.equal(
          (
            await request(`/accounts/${member.id}/password`, "PUT", {
              password,
            })
          ).status,
          204,
        );
        assert.equal((await service.detail(member.id)).status, "inactive");
        assert.equal(
          (
            await json<AccountDto>(
              await request(`/accounts/${member.id}/reactivate`, "POST"),
              201,
            )
          ).status,
          "active",
        );
        await error(
          await request("/auth/me", "GET", undefined, memberCookie),
          401,
          "UNAUTHENTICATED",
        );
        memberCookie = `${SESSION_COOKIE}=${(await auth.login(member.loginId, password)).token}`;
      },
    );
    await t.test(
      "검색·등급·상태와 기존 limit/offset 페이지 방식을 유지한다",
      async () => {
        const page = await json<AccountPageDto>(
          await request(
            "/accounts?search=qa.member&role=member&status=active&limit=1&offset=0",
          ),
        );
        assert.equal(page.total, 1);
        assert.deepEqual(
          page.items.map((a) => a.id),
          [member.id],
        );
        const next = await json<AccountPageDto>(
          await request("/accounts?role=member&limit=1&offset=1"),
        );
        assert.equal(next.total, 1);
        assert.deepEqual(next.items, []);
        for (const query of [
          "role=unknown",
          "status=invited",
          "status=expired",
          `roleId=${randomUUID()}`,
          `affiliationId=${randomUUID()}`,
        ])
          assert.equal((await request(`/accounts?${query}`)).status, 400);
      },
    );
    await t.test(
      "이전된 비밀번호 없는 계정은 관리자가 비밀번호를 정한 뒤 활성화한다",
      async () => {
        const [migrated] = await lease.database.db
          .insert(accounts)
          .values({
            name: "이전 계정",
            loginId: "migrated.invitee",
            role: "member",
            status: "inactive",
          })
          .returning();
        lease.accountIds.push(migrated.id);
        await error(
          await request(`/accounts/${migrated.id}/reactivate`, "POST"),
          409,
          "PASSWORD_REQUIRED",
        );
        assert.equal(
          (
            await request(`/accounts/${migrated.id}/password`, "PUT", {
              password,
            })
          ).status,
          204,
        );
        assert.equal((await service.detail(migrated.id)).status, "inactive");
        assert.equal(
          (await request(`/accounts/${migrated.id}/reactivate`, "POST")).status,
          201,
        );
        assert.equal(
          (await auth.login(migrated.loginId, password)).account.id,
          migrated.id,
        );
        await service.setActive(migrated.id, false);
      },
    );
    await t.test("동시 관리자 변경에서도 최소 한 명을 남긴다", async () => {
      const second = await service.create({
        name: "다른 관리자",
        loginId: "second.admin",
        role: "admin",
        password,
      });
      lease.accountIds.push(second.id);
      const result = await Promise.allSettled([
        service.update(adminId, { role: "member" }),
        service.setActive(second.id, false),
      ]);
      assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
      const rejected = result.find((r) => r.status === "rejected");
      assert.ok(
        rejected?.status === "rejected" &&
          code("LAST_ACTIVE_ADMIN")(rejected.reason),
      );
      const active = (await lease.database.db.select().from(accounts)).filter(
        (a) => a.role === "admin" && a.status === "active",
      );
      assert.equal(active.length, 1);
      await service.update(adminId, { role: "admin" });
      await service.setActive(second.id, false);
    });
    await t.test(
      "삭제한 API는 다시 열리지 않고 로그아웃은 현재 세션을 폐기한다",
      async () => {
        for (const [path, method] of [
          ["/auth/invitations", "GET"],
          ["/auth/password-resets", "POST"],
          ["/roles", "GET"],
          ["/affiliations", "GET"],
          [`/accounts/${member.id}/invitation`, "POST"],
          [`/accounts/${member.id}/password-reset`, "POST"],
          [`/accounts/${member.id}/owned-test-sets`, "GET"],
        ])
          assert.equal((await request(path, method)).status, 404);
        assert.equal(
          (await request("/auth/logout", "POST", undefined, memberCookie))
            .status,
          204,
        );
        await error(
          await request("/auth/me", "GET", undefined, memberCookie),
          401,
          "UNAUTHENTICATED",
        );
      },
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
