import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { eq, inArray } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { hashToken, newToken } from "../src/auth/credentials";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import { readEnv } from "../src/config/env";
import type { MeDto } from "../src/contracts/identity.dto";
import type {
  CreatedPluginConnectionDto,
  PluginConnectionTokenDto,
} from "../src/contracts/plugin-connection.dto";
import type { ProjectListDto } from "../src/contracts/project.dto";
import {
  accounts as accountRows,
  pluginConnections,
} from "../src/database/schema";
import { ProjectsService } from "../src/projects/projects.service";
import { RolesService } from "../src/roles/roles.service";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";

test("실제 PostgreSQL에서 플러그인 브라우저 로그인과 제한된 Bearer 인증", async (t) => {
  const lease = await openTestDatabase();
  const config = {
    ...lease.config,
    allowFigmaNullOrigin: true,
    workersEnabled: false,
  };
  const app = await createApp(config, lease.folder);
  const db = lease.database.db;
  const requestHashes: string[] = [];
  try {
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1`;
    const accounts = app.get(AccountsService),
      auth = app.get(AuthService);
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      accounts,
      "plugin-admin@example.com",
      "플러그인 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "플러그인-테스트-비밀번호-12345";
    await auth.setPassword(admin.token, password, "invite");
    const cookie = `${SESSION_COOKIE}=${(await auth.login(admin.account.email, password)).token}`;
    const person = await accounts.create({
      name: "플러그인 사용자",
      email: "plugin-person@example.com",
      affiliationId: admin.account.affiliation.id,
      assignments: [],
    });
    lease.accountIds.push(person.account.id);
    await auth.setPassword(person.token, password, "invite");
    let personCookie = `${SESSION_COOKIE}=${(await auth.login(person.account.email, password)).token}`;
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(base + path, {
        method,
        headers: {
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const json = async <T>(response: Response, status = 200): Promise<T> => {
      assert.equal(response.status, status, await response.clone().text());
      return (await response.json()) as T;
    };
    const error = async (response: Response, status: number, code: string) => {
      assert.equal(
        (await json<{ error: { code: string } }>(response, status)).error.code,
        code,
      );
    };
    const create = async () => {
      const result = await json<CreatedPluginConnectionDto>(
        await request("/plugin-connections", "POST", undefined, {
          Origin: "null",
        }),
        201,
      );
      requestHashes.push(hashToken(result.requestToken));
      return result;
    };
    const exchange = (requestToken: string) =>
      request(
        "/plugin-connections/token",
        "POST",
        { requestToken },
        { Origin: "null" },
      );
    const approve = (requestToken: string, actorCookie = cookie) =>
      request(
        `/plugin-connections/requests/${requestToken}/approve`,
        "POST",
        undefined,
        { Cookie: actorCookie },
      );
    const issue = async (actorCookie = cookie) => {
      const created = await create();
      assert.equal(
        (await approve(created.requestToken, actorCookie)).status,
        204,
      );
      return {
        ...created,
        ...(await json<PluginConnectionTokenDto>(
          await exchange(created.requestToken),
        )),
      };
    };
    const bearer = (token: string) => ({
      Authorization: `Bearer ${token}`,
      Origin: "null",
    });
    const me = (token: string) =>
      request("/auth/me", "GET", undefined, bearer(token));
    const row = async (requestToken: string) =>
      (
        await db
          .select()
          .from(pluginConnections)
          .where(
            eq(pluginConnections.requestTokenHash, hashToken(requestToken)),
          )
      )[0];
    const upload = (token: string) => {
      const form = new FormData();
      form.append(
        "manifest",
        JSON.stringify({
          frames: [
            {
              name: "로그인 화면",
              document: { text: "로그인" },
              imageCount: 0,
            },
          ],
        }),
      );
      return fetch(`${base}/temp-uploads`, {
        method: "POST",
        headers: bearer(token),
        body: form,
      });
    };

    await t.test(
      "생성 → pending 202 → 브라우저 승인 → 일회성 발급과 계정 정보",
      async () => {
        const created = await create();
        assert.match(created.requestToken, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(
          Math.abs(Date.parse(created.expiresAt) - Date.now() - 600000) < 5000,
        );
        assert.equal((await row(created.requestToken)).tokenHash, null);
        assert.deepEqual(
          await json(await exchange(created.requestToken), 202),
          { status: "pending" },
        );
        const inspect = () =>
          request(
            `/plugin-connections/requests/${created.requestToken}`,
            "GET",
            undefined,
            { Cookie: cookie },
          );
        assert.deepEqual(await json(await inspect()), { status: "pending" });
        assert.equal((await approve(created.requestToken)).status, 204);
        assert.deepEqual(await json(await inspect()), { status: "approved" });
        await error(
          await approve(created.requestToken),
          409,
          "PLUGIN_CONNECTION_ALREADY_APPROVED",
        );
        const issued = await json<PluginConnectionTokenDto>(
          await exchange(created.requestToken),
        );
        assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
        assert.notEqual(issued.token, created.requestToken);
        assert.deepEqual(issued.account, await auth.me(admin.account.id));
        const stored = await row(created.requestToken);
        assert.equal(stored.requestTokenHash, hashToken(created.requestToken));
        assert.equal(stored.tokenHash, hashToken(issued.token));
        assert.ok(stored.approvedAt);
        assert.ok(
          Math.abs(
            (stored.tokenExpiresAt?.getTime() ?? 0) -
              Date.now() -
              30 * 86400000,
          ) < 5000,
        );
        await error(
          await exchange(created.requestToken),
          410,
          "PLUGIN_CONNECTION_EXPIRED",
        );
        const response = await me(issued.token);
        assert.deepEqual(await json<MeDto>(response), issued.account);
        assert.equal(
          response.headers.get("access-control-allow-origin"),
          "null",
        );
        assert.equal(
          response.headers.get("access-control-allow-credentials"),
          null,
        );
        assert.equal((await upload(issued.token)).status, 201);
        await db
          .update(pluginConnections)
          .set({ expiresAt: new Date(0) })
          .where(eq(pluginConnections.id, stored.id));
        assert.equal(
          (await me(issued.token)).status,
          200,
          "요청 10분 만료와 발급 토큰 30일 만료는 별개다.",
        );
        await db
          .update(pluginConnections)
          .set({ tokenExpiresAt: new Date(0) })
          .where(eq(pluginConnections.id, stored.id));
        await error(await me(issued.token), 401, "UNAUTHENTICATED");
      },
    );

    await t.test(
      "없는 요청, 만료, 비활성 계정과 로그인하지 않은 승인 거부",
      async () => {
        const unknown = newToken();
        await error(
          await request(
            `/plugin-connections/requests/${unknown}`,
            "GET",
            undefined,
            { Cookie: cookie },
          ),
          404,
          "NOT_FOUND",
        );
        await error(await approve(unknown), 404, "NOT_FOUND");
        await error(await exchange(unknown), 410, "PLUGIN_CONNECTION_EXPIRED");
        for (const approved of [false, true]) {
          const created = await create();
          if (approved)
            assert.equal((await approve(created.requestToken)).status, 204);
          await db
            .update(pluginConnections)
            .set({ expiresAt: new Date(0) })
            .where(
              eq(
                pluginConnections.requestTokenHash,
                hashToken(created.requestToken),
              ),
            );
          assert.deepEqual(
            await json(
              await request(
                `/plugin-connections/requests/${created.requestToken}`,
                "GET",
                undefined,
                { Cookie: cookie },
              ),
            ),
            { status: "expired" },
          );
          await error(
            await approve(created.requestToken),
            410,
            "PLUGIN_CONNECTION_EXPIRED",
          );
          await error(
            await exchange(created.requestToken),
            410,
            "PLUGIN_CONNECTION_EXPIRED",
          );
        }
        const created = await create();
        await error(
          await approve(created.requestToken, ""),
          401,
          "UNAUTHENTICATED",
        );
        await error(
          await request(`/plugin-connections/requests/${created.requestToken}`),
          401,
          "UNAUTHENTICATED",
        );
        await accounts.setActive(person.account.id, false);
        await error(
          await approve(created.requestToken, personCookie),
          401,
          "UNAUTHENTICATED",
        );
        assert.equal((await row(created.requestToken)).status, "pending");
        await accounts.setActive(person.account.id, true);
        personCookie = `${SESSION_COOKIE}=${(await auth.login(person.account.email, password)).token}`;
      },
    );

    await t.test(
      "동시 승인은 한 계정만 연결하고 동시 교환은 한 번만 발급",
      async () => {
        const created = await create();
        const approvals = await Promise.all([
          approve(created.requestToken),
          approve(created.requestToken, personCookie),
        ]);
        assert.deepEqual(approvals.map((r) => r.status).sort(), [204, 409]);
        const responses = await Promise.all([
          exchange(created.requestToken),
          exchange(created.requestToken),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 410]);
        const winner = responses.find((r) => r.status === 200);
        assert.ok(winner);
        const issued = await json<PluginConnectionTokenDto>(winner);
        assert.equal(
          issued.account.id,
          approvals[0].status === 204 ? admin.account.id : person.account.id,
        );
        assert.equal((await me(issued.token)).status, 200);
      },
    );

    await t.test(
      "Bearer 허용 경로와 폐기, 쿠키와 토큰 간 인증 대체 차단",
      async () => {
        const first = await issue(),
          second = await issue();
        for (const [path, method] of [
          ["/accounts", "GET"],
          ["/projects", "POST"],
          ["/projects/00000000-0000-4000-8000-000000000000", "GET"],
          ["/auth/logout", "POST"],
          ["/plugin-connections/requests/unknown", "GET"],
          [
            `/plugin-connections/requests/${first.requestToken}/approve`,
            "POST",
          ],
          ["/temp-uploads/00000000-0000-4000-8000-000000000000", "GET"],
        ]) {
          await error(
            await request(path, method, undefined, {
              Authorization: `Bearer ${first.token}`,
            }),
            401,
            "UNAUTHENTICATED",
          );
        }
        await error(
          await request("/plugin-connections/current", "DELETE", undefined, {
            Cookie: cookie,
          }),
          401,
          "UNAUTHENTICATED",
        );
        await error(
          await request("/auth/me", "GET", undefined, {
            Authorization: "Bearer invalid",
            Cookie: cookie,
          }),
          401,
          "UNAUTHENTICATED",
        );
        await error(await me(first.requestToken), 401, "UNAUTHENTICATED");
        const sessionToken = cookie.slice(SESSION_COOKIE.length + 1);
        await error(await me(sessionToken), 401, "UNAUTHENTICATED");
        await error(
          await request("/auth/me", "GET", undefined, {
            Cookie: `${SESSION_COOKIE}=${first.token}`,
          }),
          401,
          "UNAUTHENTICATED",
        );
        assert.equal(
          (
            await request(
              "/plugin-connections/current",
              "DELETE",
              undefined,
              bearer(first.token),
            )
          ).status,
          204,
        );
        assert.equal((await row(first.requestToken)).status, "revoked");
        assert.ok((await row(first.requestToken)).revokedAt);
        await error(await me(first.token), 401, "UNAUTHENTICATED");
        await error(
          await request(
            "/plugin-connections/current",
            "DELETE",
            undefined,
            bearer(first.token),
          ),
          401,
          "UNAUTHENTICATED",
        );
        assert.equal(
          (await me(second.token)).status,
          200,
          "다른 플러그인 연결을 폐기하지 않는다.",
        );
        assert.equal(
          (await request("/auth/me", "GET", undefined, { Cookie: cookie }))
            .status,
          200,
        );
      },
    );

    await t.test("업로드는 현재 전체 plugin.upload 권한을 요구", async () => {
      const connection = await issue(personCookie);
      assert.equal(connection.account.name, person.account.name);
      assert.equal((await me(connection.token)).status, 200);
      await error(await upload(connection.token), 403, "FORBIDDEN");
      const role = await app.get(RolesService).create({
        name: randomUUID(),
        permissions: ["plugin.upload"],
        requiresExpiry: false,
        defaultExpiryDays: null,
      });
      lease.roleIds.push(role.id);
      const project = await app.get(ProjectsService).create(admin.account.id, {
        name: "플러그인 권한 프로젝트",
        description: "",
      });
      await accounts.update(person.account.id, {
        assignments: [
          { roleId: role.id, scope: "projects", projectIds: [project.id] },
        ],
      });
      await error(await upload(connection.token), 403, "FORBIDDEN");
      await accounts.update(person.account.id, {
        assignments: [{ roleId: role.id, scope: "global", projectIds: [] }],
      });
      assert.equal((await upload(connection.token)).status, 201);
      await accounts.update(person.account.id, { assignments: [] });
      await error(await upload(connection.token), 403, "FORBIDDEN");
    });

    await t.test(
      "플러그인 토큰은 볼 수 있는 프로젝트 목록만 받는다",
      async () => {
        const project = await app
          .get(ProjectsService)
          .create(admin.account.id, {
            name: "플러그인 목록 프로젝트",
            description: "",
          });
        const ids = async (token: string) =>
          (
            await json<ProjectListDto>(
              await request("/projects", "GET", undefined, bearer(token)),
            )
          ).items.map((item) => item.id);
        const adminConnection = await issue();
        assert.ok((await ids(adminConnection.token)).includes(project.id));
        assert.deepEqual(
          await ids(adminConnection.token),
          (
            await json<ProjectListDto>(
              await request("/projects", "GET", undefined, { Cookie: cookie }),
            )
          ).items.map((item) => item.id),
          "브라우저와 같은 목록을 받는다.",
        );
        const personConnection = await issue(personCookie);
        assert.ok(!(await ids(personConnection.token)).includes(project.id));
      },
    );

    await t.test(
      "계정 만료 확인, 비활성화와 비밀번호 변경 시 모든 연결 영구 폐기",
      async () => {
        const first = await issue(personCookie),
          second = await issue(personCookie);
        await db
          .update(accountRows)
          .set({ expiresAt: new Date(0) })
          .where(eq(accountRows.id, person.account.id));
        await error(await me(first.token), 401, "UNAUTHENTICATED");
        await db
          .update(accountRows)
          .set({ expiresAt: null })
          .where(eq(accountRows.id, person.account.id));
        const beforeDeactivation = await create();
        assert.equal(
          (await approve(beforeDeactivation.requestToken, personCookie)).status,
          204,
        );
        await accounts.setActive(person.account.id, false);
        await error(await me(first.token), 401, "UNAUTHENTICATED");
        await accounts.setActive(person.account.id, true);
        await error(
          await exchange(beforeDeactivation.requestToken),
          410,
          "PLUGIN_CONNECTION_EXPIRED",
        );
        for (const connection of [first, second]) {
          await error(await me(connection.token), 401, "UNAUTHENTICATED");
          assert.ok((await row(connection.requestToken)).revokedAt);
        }
        personCookie = `${SESSION_COOKIE}=${(await auth.login(person.account.email, password)).token}`;
        const beforeReset = await issue(personCookie);
        const approved = await create();
        assert.equal(
          (await approve(approved.requestToken, personCookie)).status,
          204,
        );
        const reset = await accounts.issue(person.account.id, "reset");
        await auth.setPassword(reset.token, `${password}-변경`, "reset");
        await error(await me(beforeReset.token), 401, "UNAUTHENTICATED");
        await error(
          await exchange(approved.requestToken),
          410,
          "PLUGIN_CONNECTION_EXPIRED",
        );
        assert.ok((await row(beforeReset.requestToken)).revokedAt);
        personCookie = `${SESSION_COOKIE}=${(await auth.login(person.account.email, `${password}-변경`)).token}`;
        const beforeExpiryUpdate = await issue(personCookie);
        await accounts.update(person.account.id, {
          expiresAt: new Date(0).toISOString(),
        });
        await error(await me(beforeExpiryUpdate.token), 401, "UNAUTHENTICATED");
        await accounts.update(person.account.id, { expiresAt: null });
        await error(await me(beforeExpiryUpdate.token), 401, "UNAUTHENTICATED");
        assert.ok((await row(beforeExpiryUpdate.requestToken)).revokedAt);
      },
    );

    await t.test(
      "null Origin은 플래그를 켠 지정 메서드와 경로에만 credentials 없이 허용",
      async () => {
        const allowed = [
          ["/plugin-connections", "POST"],
          ["/plugin-connections/token", "POST"],
          ["/auth/me", "GET"],
          ["/projects", "GET"],
          ["/temp-uploads", "POST"],
          ["/plugin-connections/current", "DELETE"],
        ];
        const blocked = [
          ["/auth/login", "POST"],
          ["/projects", "POST"],
          ["/projects/unknown", "GET"],
          ["/plugin-connections/requests/unknown", "GET"],
          ["/plugin-connections/requests/unknown/approve", "POST"],
          ["/temp-uploads/unknown", "GET"],
          ["/temp-uploads", "GET"],
          ["/auth/me", "POST"],
        ];
        for (const [path, method] of [...allowed, ...blocked]) {
          const response = await request(path, "OPTIONS", undefined, {
            Origin: "null",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "authorization,content-type",
          });
          assert.equal(
            response.headers.get("access-control-allow-origin"),
            allowed.some(([p, m]) => p === path && m === method)
              ? "null"
              : null,
            `${method} ${path}`,
          );
          assert.equal(
            response.headers.get("access-control-allow-credentials"),
            null,
          );
          if (response.headers.get("access-control-allow-origin"))
            assert.match(
              response.headers.get("access-control-allow-headers") ?? "",
              /Authorization/i,
            );
        }
        const created = await create();
        await error(
          await request(
            `/plugin-connections/requests/${created.requestToken}/approve`,
            "POST",
            undefined,
            { Cookie: cookie, Origin: "null" },
          ),
          403,
          "ORIGIN_NOT_ALLOWED",
        );
        assert.equal((await row(created.requestToken)).status, "pending");
        const browser = await request("/auth/me", "GET", undefined, {
          Cookie: cookie,
          Origin: config.corsOrigins[0],
        });
        assert.equal(browser.status, 200);
        assert.equal(
          browser.headers.get("access-control-allow-origin"),
          config.corsOrigins[0],
        );
        assert.equal(
          browser.headers.get("access-control-allow-credentials"),
          "true",
        );
        await error(
          await request("/plugin-connections", "POST", undefined, {
            Origin: "https://untrusted.example",
          }),
          403,
          "ORIGIN_NOT_ALLOWED",
        );
        const disabled = await createApp(
          { ...config, allowFigmaNullOrigin: false },
          lease.folder,
        );
        try {
          await disabled.listen(0, "127.0.0.1");
          for (const [path, method] of allowed) {
            const response = await fetch(
              `${await disabled.getUrl()}/api/v1${path}`,
              {
                method: "OPTIONS",
                headers: {
                  Origin: "null",
                  "Access-Control-Request-Method": method,
                },
              },
            );
            assert.equal(
              response.headers.get("access-control-allow-origin"),
              null,
            );
          }
          assert.equal(
            (
              await fetch(
                `${await disabled.getUrl()}/api/v1/plugin-connections`,
                { method: "POST", headers: { Origin: "null" } },
              )
            ).status,
            403,
          );
        } finally {
          await disabled.close();
        }
      },
    );

    await t.test(
      "원격 플러그인 UI Origin은 지정 경로에만 credentials 없이 허용",
      async () => {
        const pluginUiOrigin = "https://plugin.example.com";
        const remote = await createApp(
          { ...config, allowFigmaNullOrigin: false, pluginUiOrigin },
          lease.folder,
        );
        try {
          await remote.listen(0, "127.0.0.1");
          const remoteBase = `${await remote.getUrl()}/api/v1`;
          const preflight = (path: string, method: string, origin: string) =>
            fetch(`${remoteBase}${path}`, {
              method: "OPTIONS",
              headers: {
                Origin: origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "authorization,content-type",
              },
            });
          for (const [path, method, allowed] of [
            ["/auth/me", "GET", true],
            ["/projects", "GET", true],
            ["/temp-uploads", "POST", true],
            ["/plugin-connections/token", "POST", true],
            ["/auth/login", "POST", false],
            ["/projects", "POST", false],
            ["/temp-uploads", "GET", false],
          ] as const) {
            const response = await preflight(path, method, pluginUiOrigin);
            assert.equal(
              response.headers.get("access-control-allow-origin"),
              allowed ? pluginUiOrigin : null,
              `${method} ${path}`,
            );
            assert.equal(
              response.headers.get("access-control-allow-credentials"),
              null,
            );
          }
          // 원격 UI가 열려 있어도 번들 UI의 null Origin은 플래그 없이 막는다
          assert.equal(
            (await preflight("/auth/me", "GET", "null")).headers.get(
              "access-control-allow-origin",
            ),
            null,
          );
          const created = await create();
          const approve = await fetch(
            `${remoteBase}/plugin-connections/requests/${created.requestToken}/approve`,
            {
              method: "POST",
              headers: { Cookie: cookie, Origin: pluginUiOrigin },
            },
          );
          assert.equal(approve.status, 403);
          assert.equal((await row(created.requestToken)).status, "pending");
          const browser = await fetch(`${remoteBase}/auth/me`, {
            headers: { Cookie: cookie, Origin: config.corsOrigins[0] },
          });
          assert.equal(browser.status, 200);
          assert.equal(
            browser.headers.get("access-control-allow-credentials"),
            "true",
          );
        } finally {
          await remote.close();
        }
      },
    );

    await t.test("OpenAPI operationId와 인증, 교환 DTO 검증 계약", async () => {
      const document = createDocument(app);
      for (const [path, method, operationId] of [
        ["/api/v1/plugin-connections", "post", "createPluginConnection"],
        [
          "/api/v1/plugin-connections/requests/{requestToken}",
          "get",
          "getPluginConnectionRequest",
        ],
        [
          "/api/v1/plugin-connections/requests/{requestToken}/approve",
          "post",
          "approvePluginConnection",
        ],
        [
          "/api/v1/plugin-connections/token",
          "post",
          "exchangePluginConnection",
        ],
        [
          "/api/v1/plugin-connections/current",
          "delete",
          "revokePluginConnection",
        ],
      ] as const)
        assert.equal(document.paths[path][method]?.operationId, operationId);
      for (const operation of [
        document.paths["/api/v1/auth/me"].get,
        document.paths["/api/v1/projects"].get,
        document.paths["/api/v1/temp-uploads"].post,
      ]) {
        assert.deepEqual(
          new Set(operation?.security),
          new Set([{ bearer: [] }, { cookie: [] }]),
        );
      }
      assert.deepEqual(
        document.paths["/api/v1/plugin-connections/current"].delete?.security,
        [{ bearer: [] }],
      );
      for (const body of [
        {},
        { requestToken: "short" },
        { requestToken: "!".repeat(43) },
        { requestToken: newToken(), unexpected: true },
        { requestToken: null },
      ]) {
        await error(
          await request("/plugin-connections/token", "POST", body),
          400,
          "VALIDATION_ERROR",
        );
      }
    });
  } finally {
    try {
      if (requestHashes.length)
        await db
          .delete(pluginConnections)
          .where(inArray(pluginConnections.requestTokenHash, requestHashes));
      await app.close();
    } finally {
      await lease.close();
    }
  }
});

test("환경 설정은 null Origin 플래그를 일반 CORS 목록과 분리하고 development에 한정", () => {
  const env = {
    DATABASE_URL: "postgresql://unused@127.0.0.1/unused",
    FILE_STORAGE_ROOT: process.env.TEMP,
    NODE_ENV: "development",
    AI_PROVIDER: "fake",
  };
  const enabled = readEnv({ ...env, ALLOW_FIGMA_NULL_ORIGIN: "true" });
  assert.equal(enabled.allowFigmaNullOrigin, true);
  assert.ok(!enabled.corsOrigins.includes("null"));
  assert.equal(readEnv(env).allowFigmaNullOrigin, false);
  assert.throws(() =>
    readEnv({
      ...env,
      NODE_ENV: "production",
      ALLOW_FIGMA_NULL_ORIGIN: "true",
    }),
  );
});

test("원격 플러그인 UI Origin은 명시적 Origin만 받고 웹 Origin과 섞지 않는다", () => {
  const env = {
    DATABASE_URL: "postgresql://unused@127.0.0.1/unused",
    FILE_STORAGE_ROOT: join(tmpdir(), "cheddar-env-test"),
    NODE_ENV: "development",
    AI_PROVIDER: "fake",
    CORS_ORIGINS: "http://127.0.0.1:5173",
  };
  assert.equal(readEnv(env).pluginUiOrigin, undefined);
  assert.equal(
    readEnv({ ...env, PLUGIN_UI_ORIGIN: "http://localhost:5174" })
      .pluginUiOrigin,
    "http://localhost:5174",
  );
  for (const value of [
    "http://localhost:5174/",
    "https://plugin.example.com/ui",
    "null",
    "ftp://plugin.example.com",
    "http://127.0.0.1:5173",
  ])
    assert.throws(() => readEnv({ ...env, PLUGIN_UI_ORIGIN: value }), value);
  assert.throws(() =>
    readEnv({
      ...env,
      NODE_ENV: "production",
      PLUGIN_UI_ORIGIN: "http://plugin.example.com",
    }),
  );
  assert.equal(
    readEnv({
      ...env,
      NODE_ENV: "production",
      PLUGIN_UI_ORIGIN: "https://plugin.example.com",
    }).pluginUiOrigin,
    "https://plugin.example.com",
  );
});
