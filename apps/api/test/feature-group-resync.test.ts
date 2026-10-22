import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { FeatureGroupDto } from "../src/contracts/project.dto";
import type { TestSetDto } from "../src/contracts/test-set.dto";
import { type LiveChange, LiveEvents } from "../src/live/live-events";
import { TestSetsService } from "../src/test-sets/test-sets.service";
import { generationFixture } from "./generation-fixture";

test("기능 그룹 변경은 프로젝트의 모든 세트를 갱신하고 커밋 뒤 resync를 보낸다", async (t) => {
  const f = await generationFixture();
  try {
    const sets = f.app.get(TestSetsService);
    const first = await f.makeSet();
    const empty = await sets.create(f.accountId, {
      projectId: first.project.id,
      name: "빈 세트",
      memo: "",
    });
    const foreign = await f.makeSet();
    const ids = [first.id, empty.id, foreign.id];
    const detail = async (id: string): Promise<TestSetDto> => {
      const response = await fetch(`${f.base}/test-sets/${id}`, {
        headers: { Cookie: f.cookie },
      });
      assert.equal(response.status, 200);
      return response.json() as Promise<TestSetDto>;
    };
    const snapshots = () => Promise.all(ids.map(detail));
    const request = (path: string, method: string, body?: unknown) =>
      fetch(`${f.base}/projects/${first.project.id}/feature-groups${path}`, {
        method,
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const changes: LiveChange[] = [];
    const committed = new Map<string, TestSetDto>();
    const off = f.app.get(LiveEvents).subscribe(async (change) => {
      changes.push(change);
      if (change.type === "resync") {
        // 별도 연결에서 읽어 이벤트 발행 시점에 커밋된 상태인지 확인한다.
        committed.set(change.testSetId, await detail(change.testSetId));
      }
    });
    try {
      const changeGroup = async (
        path: string,
        method: string,
        body: unknown,
        status: number,
      ) => {
        const before = await snapshots();
        changes.length = 0;
        committed.clear();
        const response = await request(path, method, body);
        assert.equal(response.status, status, await response.clone().text());
        const after = await snapshots();
        assert.deepEqual(
          [...changes].sort((a, b) =>
            JSON.stringify(a).localeCompare(JSON.stringify(b)),
          ),
          [first.id, empty.id]
            .sort()
            .map((testSetId) => ({ type: "resync", testSetId })),
        );
        for (const i of [0, 1]) {
          assert.equal(after[i].version, before[i].version + 1);
          assert.ok(after[i].updatedAt > before[i].updatedAt);
          assert.deepEqual(committed.get(ids[i]), after[i]);
        }
        assert.deepEqual(after[2], before[2]);
        return { response, after };
      };
      let group!: FeatureGroupDto, second!: FeatureGroupDto;
      await t.test("추가는 케이스 없는 세트도 갱신한다", async () => {
        const { response, after } = await changeGroup(
          "",
          "POST",
          { name: "로그인", description: "" },
          201,
        );
        group = (await response.json()) as FeatureGroupDto;
        for (const set of after.slice(0, 2))
          assert.deepEqual(set.featureGroups, [
            { id: group.id, name: group.name },
          ]);
      });
      const caseId = randomUUID();
      const added = await fetch(`${f.base}/test-sets/${first.id}/ops`, {
        method: "POST",
        headers: { Cookie: f.cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          ops: [
            {
              type: "add_case",
              caseId,
              afterCaseId: null,
              featureGroupId: group.id,
            },
          ],
        }),
      });
      assert.equal(added.status, 200, await added.clone().text());
      await t.test("이름 변경도 version과 그룹 응답을 갱신한다", async () => {
        const { after } = await changeGroup(
          `/${group.id}`,
          "PATCH",
          { name: "새 로그인" },
          200,
        );
        for (const set of after.slice(0, 2))
          assert.equal(set.featureGroups[0].name, "새 로그인");
        assert.equal(after[0].cases[0].featureGroupId, group.id);
      });
      await t.test("순서 변경은 프로젝트 전체 목록을 갱신한다", async () => {
        const { response } = await changeGroup(
          "",
          "POST",
          { name: "결제", description: "" },
          201,
        );
        second = (await response.json()) as FeatureGroupDto;
        const { after } = await changeGroup(
          "/order",
          "PUT",
          { ids: [second.id, group.id] },
          200,
        );
        for (const set of after.slice(0, 2))
          assert.deepEqual(
            set.featureGroups.map((g) => g.id),
            [second.id, group.id],
          );
      });
      await t.test(
        "삭제는 소속을 null로 바꾸고 그룹을 목록에서 제거한다",
        async () => {
          const { after } = await changeGroup(
            `/${group.id}`,
            "DELETE",
            undefined,
            204,
          );
          assert.equal(
            after[0].cases.find((c) => c.id === caseId)?.featureGroupId,
            null,
          );
          for (const set of after.slice(0, 2))
            assert.deepEqual(set.featureGroups, [
              { id: second.id, name: second.name },
            ]);
        },
      );
      await t.test(
        "실패한 변경은 version과 이벤트를 남기지 않는다",
        async () => {
          for (const [path, method, body, status] of [
            ["", "POST", { name: second.name, description: "" }, 409],
            ["/order", "PUT", { ids: [] }, 409],
            [`/${group.id}`, "DELETE", undefined, 404],
            [`/${group.id}`, "PATCH", { name: "실패" }, 404],
          ] as const) {
            const before = await snapshots();
            changes.length = 0;
            const response = await request(path, method, body);
            assert.equal(
              response.status,
              status,
              await response.clone().text(),
            );
            assert.deepEqual(await snapshots(), before);
            assert.deepEqual(changes, []);
          }
        },
      );
      await t.test(
        "커밋 실패는 그룹 삭제와 FK 변경, 모든 세트의 버전 증가를 롤백한다",
        async () => {
          const response = await fetch(`${f.base}/test-sets/${first.id}/ops`, {
            method: "POST",
            headers: { Cookie: f.cookie, "Content-Type": "application/json" },
            body: JSON.stringify({
              ops: [
                {
                  type: "set_feature_group",
                  caseId,
                  featureGroupId: second.id,
                },
              ],
            }),
          });
          assert.equal(response.status, 200);
          const before = await snapshots();
          changes.length = 0;
          // 커밋 시 실행되는 제약 트리거로 전체 롤백을 검증한다.
          const fault = `group_resync_${randomUUID().replaceAll("-", "")}`;
          await f.lease.database.pool.query(
            `CREATE FUNCTION "${fault}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'TEST_GROUP_COMMIT_FAILED'; END $$`,
          );
          try {
            await f.lease.database.pool.query(
              `CREATE CONSTRAINT TRIGGER "${fault}" AFTER UPDATE ON test_sets DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "${fault}"()`,
            );
            assert.equal(
              (await request(`/${second.id}`, "DELETE")).status,
              500,
            );
          } finally {
            await f.lease.database.pool.query(
              `DROP TRIGGER IF EXISTS "${fault}" ON test_sets`,
            );
            await f.lease.database.pool.query(`DROP FUNCTION "${fault}"()`);
          }
          assert.deepEqual(await snapshots(), before);
          assert.deepEqual(changes, []);
        },
      );
    } finally {
      off();
    }
  } finally {
    await f.close();
  }
});
