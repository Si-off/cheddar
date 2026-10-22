import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { AccountsService } from "../src/accounts/accounts.service";
import { createFirstAdministrator } from "../src/accounts/bootstrap";
import { AuthService, SESSION_COOKIE } from "../src/auth/auth.service";
import { AuthorizationService } from "../src/authorization/authorization.service";
import { createApp } from "../src/common/application";
import type { TestSetDto } from "../src/contracts/test-set.dto";
import { ProjectsService } from "../src/projects/projects.service";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { openTestDatabase } from "./database";

test("만든 사람과 관리자만 삭제하고 비활성화 뒤에도 만든 사람과 기록을 유지한다", async () => {
  const lease = await openTestDatabase();
  const app = await createApp(
    { ...lease.config, workersEnabled: false },
    lease.folder,
  );
  try {
    await app.listen(0, "127.0.0.1");
    const accounts = app.get(AccountsService),
      auth = app.get(AuthService),
      sets = app.get(TestSetsService);
    const admin = await createFirstAdministrator(
      app.get(AuthorizationService),
      accounts,
      "delete.admin",
      "관리자",
    );
    lease.accountIds.push(admin.account.id);
    const password = "member-password-12345";
    const owner = await accounts.create({
      name: "만든 사람",
      loginId: randomUUID(),
      role: "member",
      password,
    });
    lease.accountIds.push(owner.id);
    const member = await accounts.create({
      name: "다른 구성원",
      loginId: randomUUID(),
      role: "member",
      password,
    });
    lease.accountIds.push(member.id);
    const cookie = async (loginId: string, pass = password) =>
      `${SESSION_COOKIE}=${(await auth.login(loginId, pass)).token}`;
    const adminCookie = await cookie(admin.account.loginId, admin.password),
      ownerCookie = await cookie(owner.loginId),
      memberCookie = await cookie(member.loginId);
    const project = await app
      .get(ProjectsService)
      .create(owner.id, { name: "삭제 규칙", description: "" });
    const makeSet = () =>
      sets.create(owner.id, {
        projectId: project.id,
        name: "만든 사람 보존",
        memo: "",
      });
    const base = `${await app.getUrl()}/api/v1`;
    const request = (id: string, actor: string, method = "GET") =>
      fetch(`${base}/test-sets/${id}`, { method, headers: { Cookie: actor } });
    const set = await makeSet();
    const edit = await fetch(`${base}/test-sets/${set.id}`, {
      method: "PATCH",
      headers: { Cookie: memberCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "구성원 수정" }),
    });
    assert.equal(edit.status, 200);
    assert.equal(((await edit.json()) as TestSetDto).owner.id, owner.id);
    assert.equal((await request(set.id, memberCookie, "DELETE")).status, 403);
    assert.equal((await request(set.id, ownerCookie, "DELETE")).status, 204);
    assert.equal((await request(set.id, ownerCookie)).status, 404);
    const retained = await makeSet();
    await accounts.setActive(owner.id, false);
    const read = await request(retained.id, memberCookie);
    assert.equal(read.status, 200);
    assert.equal(((await read.json()) as TestSetDto).owner.name, owner.name);
    assert.equal(
      (await request(retained.id, ownerCookie, "DELETE")).status,
      401,
    );
    for (const path of [
      `/accounts/${owner.id}/owned-test-sets`,
      `/accounts/${owner.id}/owned-test-sets/${retained.id}/owner`,
    ])
      assert.equal(
        (
          await fetch(base + path, {
            method: path.endsWith("owner") ? "POST" : "GET",
            headers: {
              Cookie: adminCookie,
              "Content-Type": "application/json",
            },
            ...(path.endsWith("owner")
              ? { body: JSON.stringify({ accountId: member.id }) }
              : {}),
          })
        ).status,
        404,
      );
    assert.equal(
      (await request(retained.id, memberCookie, "DELETE")).status,
      403,
    );
    assert.equal(
      (await request(retained.id, adminCookie, "DELETE")).status,
      204,
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
