import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AffiliationsService } from "../src/affiliations/affiliations.service";
import { AuthService } from "../src/auth/auth.service";
import { hashToken } from "../src/auth/credentials";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { GLOBAL_ONLY, PERMISSIONS } from "../src/authorization/permissions";
import { createApp } from "../src/common/application";
import { ApiError } from "../src/common/errors";
import {
  AccountQueryDto,
  type CreateAccountDto,
  type CreateRoleDto,
  type MeDto,
} from "../src/contracts/identity.dto";
import {
  authTokens,
  projects,
  roles,
  sessions,
  testSets,
} from "../src/database/schema";
import { RolesService } from "../src/roles/roles.service";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";

const password = "테스트-비밀번호-12345";
const code = (expected: string) => (error: unknown) =>
  error instanceof ApiError && error.code === expected;
test("실제 PostgreSQL에서 계정, 초대, 세션과 권한 계약", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(lease.config, lease.folder);
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const service = app.get(AccountsService),
      auth = app.get(AuthService),
      authorization = app.get(AuthorizationService),
      roleService = app.get(RolesService),
      affiliationService = app.get(AffiliationsService);
    const db = lease.database.db;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie?: string,
      origin = "http://127.0.0.1:5173",
    ) =>
      fetch(base + path, {
        method,
        headers: {
          Origin: origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const bootstrap = await createFirstAdministrator(
      authorization,
      service,
      "ADMIN@example.com",
      "첫 관리자",
    );
    lease.accountIds.push(bootstrap.account.id);
    const adminId = bootstrap.account.id,
      affiliationId = bootstrap.account.affiliation.id;
    const roleList = await roleService.list();
    const administrator = roleList.find((r) => r.name === "관리자"),
      member = roleList.find((r) => r.name === "구성원"),
      external = roleList.find((r) => r.name === "외부 참여자"),
      visitor = roleList.find((r) => r.fixed);
    assert.ok(administrator && member && external && visitor);
    const create = async (overrides: Partial<CreateAccountDto> = {}) => {
      const result = await service.create({
        name: "새 계정",
        email: `${randomUUID()}@example.com`,
        affiliationId,
        assignments: [],
        ...overrides,
      });
      lease.accountIds.push(result.account.id);
      return result;
    };
    const role = async (overrides: Partial<CreateRoleDto> = {}) => {
      const result = await roleService.create({
        name: randomUUID(),
        permissions: [],
        requiresExpiry: false,
        defaultExpiryDays: null,
        ...overrides,
      });
      lease.roleIds.push(result.id);
      return result;
    };
    await t.test("기본 데이터와 첫 관리자 CLI 계약, 초대 수락", async () => {
      assert.deepEqual(
        [...administrator.permissions].sort(),
        PERMISSIONS.filter((p) => p !== "test_set.view_all").sort(),
      );
      assert.deepEqual(
        [...member.permissions].sort(),
        [
          "test_set.create",
          "test_set.invite",
          "test_set.public_link",
          "test_set.export",
          "project.manage",
          "project.create",
          "plugin.upload",
        ].sort(),
      );
      assert.deepEqual(external.permissions, ["test_set.export"]);
      assert.equal(external.defaultExpiryDays, 90);
      assert.equal(bootstrap.account.status, "invited");
      assert.equal(bootstrap.account.email, "admin@example.com");
      await assert.rejects(
        auth.login("admin@example.com", password),
        code("INVALID_CREDENTIALS"),
      );
      const inspection = await auth.inspectToken(bootstrap.token, "invite");
      assert.equal(inspection.name, "첫 관리자");
      await auth.setPassword(bootstrap.token, password, "invite");
      await assert.rejects(
        auth.setPassword(bootstrap.token, password, "invite"),
        code("INVALID_AUTH_TOKEN"),
      );
      await assert.rejects(
        createFirstAdministrator(
          authorization,
          service,
          "again@example.com",
          "두 번째",
        ),
        code("ALREADY_BOOTSTRAPPED"),
      );
    });
    const login = await request("/api/v1/auth/login", "POST", {
      email: "ADMIN@example.com",
      password,
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get("set-cookie") ?? "",
      cookie = cookieHeader.split(";")[0];
    await t.test("로그인 쿠키, 내 정보와 CORS 자격 증명", async () => {
      assert.match(cookieHeader, /HttpOnly/i);
      assert.match(cookieHeader, /SameSite=Lax/i);
      assert.doesNotMatch(cookieHeader, /; Secure/i);
      assert.equal(
        login.headers.get("access-control-allow-credentials"),
        "true",
      );
      const me = (await (
        await request("/api/v1/auth/me", "GET", undefined, cookie)
      ).json()) as MeDto;
      assert.equal(me.id, adminId);
      assert.equal(me.affiliation.name, "사내");
      assert.ok(
        me.permissions.some(
          (p) => p.permission === "role.manage" && p.scope === "global",
        ),
      );
      assert.ok(
        !me.permissions.some((p) => p.permission === "test_set.view_all"),
      );
      assert.ok(!JSON.stringify(me).includes("passwordHash"));
      const session = await db
        .select()
        .from(sessions)
        .where(eq(sessions.accountId, adminId));
      assert.ok(
        session.some((s) => s.tokenHash === hashToken(cookie.split("=")[1])),
      );
      assert.ok(!JSON.stringify(session).includes(cookie.split("=")[1]));
      assert.equal((await request("/api/v1/auth/me")).status, 401);
      assert.equal(
        (
          await request(
            "/api/v1/accounts",
            "POST",
            {},
            cookie,
            "https://other.example",
          )
        ).status,
        403,
      );
      assert.equal((await request("/health/live")).status, 200);
      assert.equal((await request("/health/ready")).status, 200);
    });
    await t.test(
      "비밀번호 오류와 초대됨·만료·비활성 계정 로그인 거부",
      async () => {
        await assert.rejects(
          auth.login("admin@example.com", "wrong"),
          code("INVALID_CREDENTIALS"),
        );
        await assert.rejects(
          auth.login("missing@example.com", password),
          code("INVALID_CREDENTIALS"),
        );
        const account = await create();
        await assert.rejects(
          auth.login(account.account.email, password),
          code("INVALID_CREDENTIALS"),
        );
        await auth.setPassword(account.token, password, "invite");
        const session = await auth.login(account.account.email, password);
        await service.update(account.account.id, {
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        });
        assert.equal(
          (await service.detail(account.account.id)).status,
          "expired",
        );
        await assert.rejects(
          auth.login(account.account.email, password),
          code("INVALID_CREDENTIALS"),
        );
        await assert.rejects(
          auth.authenticate(session.token),
          code("UNAUTHENTICATED"),
        );
        await service.update(account.account.id, { expiresAt: null });
        await service.setActive(account.account.id, false);
        await assert.rejects(
          auth.login(account.account.email, password),
          code("INVALID_CREDENTIALS"),
        );
        await service.setActive(account.account.id, true);
        assert.ok(await auth.login(account.account.email, password));
      },
    );
    await t.test("초대 재발급·7일 만료·용도 구분·한 번만 수락", async () => {
      const account = await create();
      const records = await db
        .select()
        .from(authTokens)
        .where(eq(authTokens.accountId, account.account.id));
      assert.equal(records[0].tokenHash, hashToken(account.token));
      assert.ok(
        Math.abs(
          records[0].expiresAt.getTime() -
            records[0].createdAt.getTime() -
            7 * 86400000,
        ) < 100,
      );
      const reissued = await service.issue(account.account.id, "invite");
      await assert.rejects(
        auth.inspectToken(account.token, "invite"),
        code("INVALID_AUTH_TOKEN"),
      );
      await assert.rejects(
        auth.setPassword(reissued.token, password, "reset"),
        code("INVALID_AUTH_TOKEN"),
      );
      await db
        .update(authTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(authTokens.tokenHash, hashToken(reissued.token)));
      await assert.rejects(
        auth.inspectToken(reissued.token, "invite"),
        code("INVALID_AUTH_TOKEN"),
      );
      await assert.rejects(
        auth.setPassword(reissued.token, password, "invite"),
        code("INVALID_AUTH_TOKEN"),
      );
      const newest = await service.issue(account.account.id, "invite");
      const attempts = await Promise.allSettled([
        auth.setPassword(newest.token, password, "invite"),
        auth.setPassword(newest.token, password, "invite"),
      ]);
      assert.equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
    });
    await t.test(
      "관리자 발급 재설정 링크와 로그아웃이 기존 세션을 폐기",
      async () => {
        const account = await create();
        await auth.setPassword(account.token, password, "invite");
        const session = await auth.login(account.account.email, password);
        const reset = await service.issue(account.account.id, "reset");
        const replacement = `${password}-새값`;
        await auth.setPassword(reset.token, replacement, "reset");
        await assert.rejects(
          auth.authenticate(session.token),
          code("UNAUTHENTICATED"),
        );
        await assert.rejects(
          auth.login(account.account.email, password),
          code("INVALID_CREDENTIALS"),
        );
        await assert.rejects(
          auth.setPassword(reset.token, replacement, "reset"),
          code("INVALID_AUTH_TOKEN"),
        );
        const logged = await auth.login(account.account.email, replacement);
        await auth.logout(logged.token);
        await assert.rejects(
          auth.authenticate(logged.token),
          code("UNAUTHENTICATED"),
        );
      },
    );
    await t.test(
      "역할 합산과 여러 프로젝트 범위, 전체만 권한 무시",
      async () => {
        const [p1, p2, p3] = await db
          .insert(projects)
          .values(
            [1, 2, 3].map((i) => ({
              name: `프로젝트${i}`,
              createdBy: adminId,
            })),
          )
          .returning();
        const scoped = await role({
          permissions: ["test_set.export", "test_set.create", ...GLOBAL_ONLY],
        });
        const global = await role({ permissions: ["test_set.invite"] });
        const account = await create({
          assignments: [
            {
              roleId: scoped.id,
              scope: "projects",
              projectIds: [p1.id, p2.id],
            },
            { roleId: global.id, scope: "global", projectIds: [] },
          ],
        });
        await auth.setPassword(account.token, password, "invite");
        assert.equal(
          await authorization.can(account.account.id, "test_set.export", p1.id),
          true,
        );
        assert.equal(
          await authorization.can(account.account.id, "test_set.export", p2.id),
          true,
        );
        assert.equal(
          await authorization.can(account.account.id, "test_set.export", p3.id),
          false,
        );
        assert.equal(
          await authorization.can(account.account.id, "test_set.export"),
          false,
        );
        assert.equal(
          await authorization.can(account.account.id, "test_set.invite", p3.id),
          true,
        );
        for (const permission of GLOBAL_ONLY) {
          assert.equal(
            await authorization.can(account.account.id, permission, p1.id),
            false,
          );
          assert.equal(
            await authorization.can(account.account.id, permission),
            false,
          );
        }
        await service.update(account.account.id, {
          assignments: [
            {
              roleId: scoped.id,
              scope: "projects",
              projectIds: [p1.id, p2.id],
            },
            { roleId: global.id, scope: "global", projectIds: [] },
            { roleId: scoped.id, scope: "global", projectIds: [] },
          ],
        });
        assert.equal(
          await authorization.can(account.account.id, "project.create"),
          true,
        );
        const login = await auth.login(account.account.email, password);
        // Global-only capabilities in project assignments cannot grant access to controllers.
        await service.update(account.account.id, {
          assignments: [
            { roleId: scoped.id, scope: "projects", projectIds: [p1.id] },
          ],
        });
        assert.equal(
          (
            await request(
              "/api/v1/accounts",
              "GET",
              undefined,
              `cheddar_session=${login.token}`,
            )
          ).status,
          403,
        );
        await assert.rejects(
          create({
            assignments: [
              { roleId: scoped.id, scope: "projects", projectIds: [] },
            ],
          }),
          code("VALIDATION_ERROR"),
        );
        await assert.rejects(
          create({
            assignments: [
              { roleId: scoped.id, scope: "global", projectIds: [p1.id] },
            ],
          }),
          code("VALIDATION_ERROR"),
        );
      },
    );
    await t.test(
      "마지막 역할 관리자 권한·할당·비활성화·만료 변경 보호",
      async () => {
        await assert.rejects(
          roleService.update(administrator.id, {
            permissions: administrator.permissions.filter(
              (p) => p !== "role.manage",
            ),
          }),
          code("LAST_ROLE_MANAGER"),
        );
        await assert.rejects(
          service.update(adminId, { assignments: [] }),
          code("LAST_ROLE_MANAGER"),
        );
        await assert.rejects(
          service.update(adminId, {
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }),
          code("LAST_ROLE_MANAGER"),
        );
        await assert.rejects(
          service.setActive(adminId, false),
          code("LAST_ROLE_MANAGER"),
        );
        assert.equal((await service.detail(adminId)).status, "active");
        assert.equal(await authorization.can(adminId, "role.manage"), true);
      },
    );
    await t.test("동시에 두 관리자를 비활성화해도 한 명은 남음", async () => {
      const second = await create({
        assignments: [
          { roleId: administrator.id, scope: "global", projectIds: [] },
        ],
      });
      await auth.setPassword(second.token, password, "invite");
      const results = await Promise.allSettled([
        service.setActive(adminId, false),
        service.setActive(second.account.id, false),
      ]);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        results.filter(
          (r) => r.status === "rejected" && code("LAST_ROLE_MANAGER")(r.reason),
        ).length,
        1,
      );
      const inactiveId =
        (await service.detail(adminId)).status === "inactive"
          ? adminId
          : second.account.id;
      await service.setActive(inactiveId, true);
    });
    await t.test(
      "만료일 필수와 가장 짧은 기본 기간, 역할 변경도 검증",
      async () => {
        await assert.rejects(
          create({
            assignments: [
              { roleId: external.id, scope: "global", projectIds: [] },
            ],
          }),
          code("VALIDATION_ERROR"),
        );
        const short = await role({
          requiresExpiry: true,
          defaultExpiryDays: 30,
        });
        const account = await create({
          assignments: [
            { roleId: external.id, scope: "global", projectIds: [] },
            { roleId: short.id, scope: "global", projectIds: [] },
          ],
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
        assert.equal(account.account.defaultExpiryDays, 30);
        await assert.rejects(
          service.update(account.account.id, { expiresAt: null }),
          code("VALIDATION_ERROR"),
        );
        const ordinary = await role(),
          assigned = await create({
            assignments: [
              { roleId: ordinary.id, scope: "global", projectIds: [] },
            ],
          });
        await assert.rejects(
          roleService.update(ordinary.id, {
            requiresExpiry: true,
            defaultExpiryDays: 10,
          }),
          code("VALIDATION_ERROR"),
        );
        await service.update(assigned.account.id, {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        });
        assert.equal(
          (
            await roleService.update(ordinary.id, {
              requiresExpiry: true,
              defaultExpiryDays: 10,
            })
          ).requiresExpiry,
          true,
        );
        await assert.rejects(
          role({ requiresExpiry: true, defaultExpiryDays: null }),
          code("VALIDATION_ERROR"),
        );
      },
    );
    await t.test(
      "링크 방문자는 할당·삭제·다른 권한·이름 변경 불가",
      async () => {
        await assert.rejects(
          create({
            assignments: [
              { roleId: visitor.id, scope: "global", projectIds: [] },
            ],
          }),
          code("VALIDATION_ERROR"),
        );
        await assert.rejects(
          roleService.remove(visitor.id),
          code("FIXED_ROLE"),
        );
        await assert.rejects(
          roleService.update(visitor.id, { name: "새 이름" }),
          code("FIXED_ROLE"),
        );
        await assert.rejects(
          roleService.update(visitor.id, { permissions: ["project.create"] }),
          code("FIXED_ROLE"),
        );
        try {
          assert.deepEqual(
            (await roleService.update(visitor.id, { permissions: [] }))
              .permissions,
            [],
          );
          assert.deepEqual(
            (
              await roleService.update(visitor.id, {
                permissions: ["test_set.export"],
              })
            ).permissions,
            ["test_set.export"],
          );
        } finally {
          await roleService.update(visitor.id, {
            permissions: ["test_set.export"],
          });
        }
        const copied = await roleService.duplicate(visitor.id, randomUUID());
        lease.roleIds.push(copied.id);
        assert.equal(copied.fixed, false);
      },
    );
    await t.test("할당된 역할과 계정이 있는 소속은 삭제 불가", async () => {
      await assert.rejects(
        roleService.remove(administrator.id),
        code("ROLE_ASSIGNED"),
      );
      await assert.rejects(
        affiliationService.remove(affiliationId),
        code("AFFILIATION_IN_USE"),
      );
      const empty = await affiliationService.save(randomUUID());
      lease.affiliationIds.push(empty.id);
      const person = await create({ affiliationId: empty.id });
      await service.setActive(person.account.id, false);
      await assert.rejects(
        affiliationService.remove(empty.id),
        code("AFFILIATION_IN_USE"),
      );
      const deletable = await role();
      await roleService.remove(deletable.id);
      const deletableAffiliation = await affiliationService.save(randomUUID());
      await affiliationService.remove(deletableAffiliation.id);
    });
    await t.test(
      "계정 검색, 소속·역할·상태 필터와 소유권 이전 서비스",
      async () => {
        const person = await create({
          name: "검색전용",
          assignments: [{ roleId: member.id, scope: "global", projectIds: [] }],
        });
        const query = Object.assign(new AccountQueryDto(), {
          search: "검색전용",
          roleId: member.id,
          affiliationId,
          status: "invited",
        });
        const page = await service.list(query);
        assert.equal(page.total, 1);
        assert.equal(page.items[0].id, person.account.id);
        const [project] = await db
          .insert(projects)
          .values({ name: "이전 프로젝트", createdBy: adminId })
          .returning();
        const [set] = await db
          .insert(testSets)
          .values({
            name: "소유 세트",
            projectId: project.id,
            ownerId: person.account.id,
          })
          .returning();
        await assert.rejects(
          service.transferOwnership(person.account.id, adminId),
          code("OWNERSHIP_ACCOUNT_STATE"),
        );
        await service.setActive(person.account.id, false);
        assert.equal(
          await service.transferOwnership(person.account.id, adminId),
          1,
        );
        assert.equal(
          (await db.select().from(testSets).where(eq(testSets.id, set.id)))[0]
            .ownerId,
          adminId,
        );
      },
    );
    await t.test("계정 DTO 오류·중복 이메일, 운영 쿠키 Secure", async () => {
      const current = await auth.login("admin@example.com", password),
        currentCookie = `cheddar_session=${current.token}`;
      assert.equal(
        (
          await request(
            "/api/v1/accounts?limit=101",
            "GET",
            undefined,
            currentCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            `/api/v1/accounts/${adminId}`,
            "PATCH",
            { name: null },
            currentCookie,
          )
        ).status,
        400,
      );
      assert.equal(
        (
          await request(
            "/api/v1/accounts",
            "POST",
            {
              name: "중복",
              email: "admin@example.com",
              affiliationId,
              assignments: [],
            },
            currentCookie,
          )
        ).status,
        409,
      );
      const production = await createApp(
        { ...lease.config, production: true },
        lease.folder,
      );
      try {
        await production.listen(0, "127.0.0.1");
        const response = await fetch(
          `${await production.getUrl()}/api/v1/auth/login`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: "admin@example.com", password }),
          },
        );
        assert.equal(response.status, 200);
        assert.match(response.headers.get("set-cookie") ?? "", /; Secure/i);
      } finally {
        await production.close();
      }
      const logout = await request(
        "/api/v1/auth/logout",
        "POST",
        undefined,
        currentCookie,
      );
      assert.equal(logout.status, 204);
      assert.equal(
        (await request("/api/v1/auth/me", "GET", undefined, currentCookie))
          .status,
        401,
      );
    });
    // System keys are only seed/bootstrap identifiers, never authorization conditions.
    assert.equal(
      (await db.select().from(roles).where(eq(roles.systemKey, "link_visitor")))
        .length,
      1,
    );
  } finally {
    try {
      await app.close();
    } finally {
      await lease.close();
    }
  }
});
