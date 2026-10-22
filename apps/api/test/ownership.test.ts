import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { and, eq } from "drizzle-orm";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import type { OwnedTestSetListDto } from "../src/contracts/identity.dto";
import { projects, testSetMembers, testSets } from "../src/database/schema";
import { RolesService } from "../src/roles/roles.service";
import { openTestDatabase } from "./database";

test("실제 PostgreSQL에서 소유 테스트 세트 목록과 한 세트 소유자 이전", async (t) => {
  const lease = await openTestDatabase();
  const app = await createApp(
    { ...lease.config, workersEnabled: false },
    lease.folder,
  );
  try {
    await app.listen(0, "127.0.0.1");
    const base = `${await app.getUrl()}/api/v1/accounts`,
      db = lease.database.db,
      accounts = app.get(AccountsService),
      auth = app.get(AuthService);
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      accounts,
      "ownership-admin@example.com",
      "소유자 이전 관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "소유자-이전-비밀번호-12345";
    await auth.setPassword(admin.token, password, "invite");
    const login = async (loginId: string) =>
      `${SESSION_COOKIE}=${(await auth.login(loginId, password)).token}`;
    const adminCookie = await login(admin.account.loginId);
    const person = async (active = true) => {
      const result = await accounts.create({
        name: "이전 대상",
        loginId: `${randomUUID()}@example.com`,
        affiliationId: admin.account.affiliation.id,
        assignments: [],
      });
      lease.accountIds.push(result.account.id);
      if (active) await auth.setPassword(result.token, password, "invite");
      return result.account;
    };
    const [project, otherProject] = await db
      .insert(projects)
      .values([
        { name: "이전 프로젝트", createdBy: admin.account.id },
        { name: "다른 프로젝트", createdBy: admin.account.id },
      ])
      .returning();
    const createSet = async (
      ownerId: string,
      name = "소유 테스트 세트",
      projectId = project.id,
    ) =>
      (
        await db
          .insert(testSets)
          .values({ ownerId, name, projectId })
          .returning()
      )[0];
    const source = await person(),
      target = await person(),
      outsider = await person();
    await accounts.setActive(source.id, false);
    const request = (
      path: string,
      method = "GET",
      body?: unknown,
      cookie = adminCookie,
    ) =>
      fetch(`${base}/${path}`, {
        method,
        headers: {
          Cookie: cookie,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const transfer = (
      fromId: string,
      setId: string,
      toId: string,
      cookie = adminCookie,
    ) =>
      request(
        `${fromId}/owned-test-sets/${setId}/owner`,
        "POST",
        { accountId: toId },
        cookie,
      );
    const error = async (response: Response, status: number, code: string) => {
      assert.equal(response.status, status, await response.clone().text());
      const body = (await response.json()) as { error: { code: string } };
      assert.equal(body.error.code, code);
    };
    const owner = async (id: string) =>
      (await db.select().from(testSets).where(eq(testSets.id, id)))[0].ownerId;
    const membership = (setId: string, accountId: string) =>
      db
        .select()
        .from(testSetMembers)
        .where(
          and(
            eq(testSetMembers.testSetId, setId),
            eq(testSetMembers.accountId, accountId),
          ),
        );

    await t.test(
      "소유 세트만 이름순으로 프로젝트 이름과 반환하고 빈 목록·없는 계정을 구분",
      async () => {
        const last = await createSet(source.id, "B 세트"),
          first = await createSet(source.id, "A 세트", otherProject.id);
        await createSet(outsider.id);
        const response = await request(`${source.id}/owned-test-sets`);
        assert.equal(response.status, 200);
        assert.deepEqual((await response.json()) as OwnedTestSetListDto, {
          items: [
            { id: first.id, name: first.name, projectName: otherProject.name },
            { id: last.id, name: last.name, projectName: project.name },
          ],
        });
        assert.deepEqual(
          await (await request(`${target.id}/owned-test-sets`)).json(),
          { items: [] },
        );
        await error(
          await request(`${randomUUID()}/owned-test-sets`),
          404,
          "NOT_FOUND",
        );
      },
    );
    await t.test(
      "지정한 한 세트만 이전하고 새 소유자 구성원 행만 정리",
      async () => {
        const selected = await createSet(source.id),
          untouched = await createSet(source.id);
        await db.insert(testSetMembers).values([
          { testSetId: selected.id, accountId: target.id, access: "view" },
          { testSetId: selected.id, accountId: outsider.id, access: "edit" },
          { testSetId: untouched.id, accountId: target.id, access: "edit" },
        ]);
        const response = await transfer(source.id, selected.id, target.id);
        assert.equal(response.status, 204, await response.clone().text());
        assert.equal(await response.text(), "");
        assert.equal(await owner(selected.id), target.id);
        assert.equal(await owner(untouched.id), source.id);
        assert.deepEqual(await membership(selected.id, target.id), []);
        assert.equal(
          (await membership(selected.id, outsider.id))[0].access,
          "edit",
        );
        assert.equal(
          (await membership(untouched.id, target.id))[0].access,
          "edit",
        );
        const responseList = await request(`${source.id}/owned-test-sets`);
        const list = (await responseList.json()) as OwnedTestSetListDto;
        assert.ok(!list.items.some((item) => item.id === selected.id));
        assert.ok(list.items.some((item) => item.id === untouched.id));
      },
    );
    await t.test("구성원이 아닌 활성 계정에도 이전", async () => {
      const set = await createSet(source.id);
      assert.equal((await transfer(source.id, set.id, target.id)).status, 204);
      assert.equal(await owner(set.id), target.id);
    });
    await t.test("원래 소유자가 활성·초대·만료면 409", async () => {
      for (const state of ["active", "invited", "expired"] as const) {
        const from = await person(state !== "invited");
        if (state === "expired")
          await accounts.update(from.id, { expiresAt: "2000-01-01T00:00:00Z" });
        const set = await createSet(from.id);
        await error(
          await transfer(from.id, set.id, target.id),
          409,
          "OWNERSHIP_ACCOUNT_STATE",
        );
        assert.equal(await owner(set.id), from.id);
      }
    });
    await t.test(
      "새 소유자가 비활성·만료·초대면 409이고 소유자와 구성원은 유지",
      async () => {
        for (const state of ["inactive", "expired", "invited"] as const) {
          const to = await person(state !== "invited");
          if (state === "inactive") await accounts.setActive(to.id, false);
          if (state === "expired")
            await accounts.update(to.id, { expiresAt: "2000-01-01T00:00:00Z" });
          const set = await createSet(source.id);
          await db.insert(testSetMembers).values({
            testSetId: set.id,
            accountId: to.id,
            access: "view",
          });
          await error(
            await transfer(source.id, set.id, to.id),
            409,
            "OWNERSHIP_ACCOUNT_STATE",
          );
          assert.equal(await owner(set.id), source.id);
          assert.equal((await membership(set.id, to.id)).length, 1);
        }
      },
    );
    await t.test("다른 계정 소유·없는 세트·없는 대상 계정은 404", async () => {
      const other = await createSet(outsider.id),
        own = await createSet(source.id);
      for (const [fromId, setId, toId] of [
        [source.id, other.id, target.id],
        [source.id, randomUUID(), target.id],
        [randomUUID(), own.id, target.id],
        [source.id, own.id, randomUUID()],
      ])
        await error(await transfer(fromId, setId, toId), 404, "NOT_FOUND");
      assert.equal(await owner(other.id), outsider.id);
      assert.equal(await owner(own.id), source.id);
    });
    await t.test(
      "account.manage가 없거나 프로젝트 범위에만 있으면 두 API 모두 403",
      async () => {
        const set = await createSet(source.id),
          cookie = await login(outsider.loginId);
        const denied = async () => {
          await error(
            await request(
              `${source.id}/owned-test-sets`,
              "GET",
              undefined,
              cookie,
            ),
            403,
            "FORBIDDEN",
          );
          await error(
            await transfer(source.id, set.id, outsider.id, cookie),
            403,
            "FORBIDDEN",
          );
        };
        await denied();
        const role = await app.get(RolesService).create({
          name: randomUUID(),
          permissions: ["account.manage"],
          requiresExpiry: false,
          defaultExpiryDays: null,
        });
        lease.roleIds.push(role.id);
        await accounts.update(outsider.id, {
          assignments: [
            { roleId: role.id, scope: "projects", projectIds: [project.id] },
          ],
        });
        await denied();
        assert.equal(await owner(set.id), source.id);
      },
    );
    await t.test("새 소유자 UUID 필수·잘못된 본문과 경로는 400", async () => {
      const set = await createSet(source.id);
      for (const body of [
        {},
        { accountId: null },
        { accountId: "wrong" },
        { accountId: target.id, extra: true },
      ])
        assert.equal(
          (
            await request(
              `${source.id}/owned-test-sets/${set.id}/owner`,
              "POST",
              body,
            )
          ).status,
          400,
        );
      assert.equal((await request("wrong/owned-test-sets")).status, 400);
      assert.equal((await transfer(source.id, "wrong", target.id)).status, 400);
      assert.equal(await owner(set.id), source.id);
    });
    await t.test("같은 세트 동시 이전은 하나만 성공", async () => {
      const set = await createSet(source.id);
      const results = await Promise.all([
        transfer(source.id, set.id, target.id),
        transfer(source.id, set.id, outsider.id),
      ]);
      assert.deepEqual(
        results.map((response) => response.status).sort(),
        [204, 404],
      );
      assert.equal(
        await owner(set.id),
        results[0].status === 204 ? target.id : outsider.id,
      );
    });
  } finally {
    await app.close();
    await lease.close();
  }
});
