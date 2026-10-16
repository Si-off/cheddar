import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { and, eq } from "drizzle-orm";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import type { IaItemDto, IaPageDto } from "../src/contracts/ia.dto";
import {
  projects as projectTable,
  testCaseIaLinks,
  testCases,
  testScenarios,
} from "../src/database/schema";
import { ProjectsRepository } from "../src/projects/projects.repository";
import { openTestDatabase } from "./database";

async function errorValue(response: Response) {
  return (
    (await response.json()) as {
      error: { code: string; details: { currentRevision: number } };
    }
  ).error;
}

test("IA HTTP preserves identity, hierarchy and references under concurrent changes", async (t) => {
  const lease = await openTestDatabase();
  const module = await Test.createTestingModule({
    imports: [appModule(lease.config, lease.folder)],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    configureApp(app, lease.config);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const makeProject = async () => {
      const project = await new ProjectsRepository(lease.database).create({
        name: "IA 검증",
      });
      lease.projects.push(project.id);
      return project.id;
    };
    const projectId = await makeProject(),
      otherId = await makeProject();
    const path = (id = projectId) => `/api/v1/projects/${id}/ia`;
    const request = (url: string, method = "GET", body?: unknown) =>
      fetch(base + url, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });
    const create = async (
      screenId: string,
      parentId?: string | null,
      project = projectId,
    ): Promise<IaItemDto> => {
      const response = await request(path(project), "POST", {
        screenId,
        name: " 주문 화면 ",
        parentId,
        position: 0,
      });
      assert.equal(response.status, 201);
      return (await response.json()) as IaItemDto;
    };
    const root = await create(" ORD-01 ");

    await t.test(
      "screen IDs trim, distinguish case, and are unique per project under a race",
      async () => {
        assert.equal(root.screenId, "ORD-01");
        assert.equal(root.name, "주문 화면");
        await create("ord-01");
        await create("ORD-01", null, otherId);
        const duplicate = await request(path(), "POST", {
          screenId: " ORD-01 ",
          name: "중복",
          position: 0,
        });
        assert.equal(duplicate.status, 409);
        assert.equal((await errorValue(duplicate)).code, "SCREEN_ID_CONFLICT");
        const racers = await Promise.all(
          [0, 1].map(() =>
            request(path(), "POST", {
              screenId: "RACE",
              name: "동시 등록",
              position: 1,
            }),
          ),
        );
        assert.deepEqual(racers.map((r) => r.status).sort(), [201, 409]);
        const invalid = await request(path(), "POST", {
          screenId: " ",
          name: "화면",
          position: 0,
        });
        assert.equal(invalid.status, 400);
      },
    );

    await t.test(
      "missing projects, foreign parents and item paths are rejected without leaking records",
      async () => {
        assert.equal((await request(path(randomUUID()))).status, 404);
        assert.equal(
          (
            await request(path(randomUUID()), "POST", {
              screenId: "X",
              name: "화면",
              position: 0,
            })
          ).status,
          404,
        );
        const foreign = await create("FOREIGN", null, otherId);
        for (const parentId of [foreign.id, randomUUID()]) {
          assert.equal(
            (
              await request(path(), "POST", {
                screenId: "X",
                name: "화면",
                position: 0,
                parentId,
              })
            ).status,
            404,
          );
        }
        assert.equal(
          (
            await request(`${path(otherId)}/${root.id}`, "PATCH", {
              expectedRevision: 1,
              name: "변경",
            })
          ).status,
          404,
        );
        assert.equal(
          (
            await request(
              `${path(otherId)}/${root.id}?expectedRevision=1`,
              "DELETE",
            )
          ).status,
          404,
        );
      },
    );

    const child = await create("CHILD", root.id);
    await t.test(
      "self, descendant and simultaneous cross-parent cycles are blocked",
      async () => {
        for (const parentId of [root.id, child.id]) {
          assert.equal(
            (
              await request(`${path()}/${root.id}`, "PATCH", {
                expectedRevision: 1,
                parentId,
              })
            ).status,
            400,
          );
        }
        const a = await create("A"),
          b = await create("B");
        const responses = await Promise.all([
          request(`${path()}/${a.id}`, "PATCH", {
            expectedRevision: 1,
            parentId: b.id,
          }),
          request(`${path()}/${b.id}`, "PATCH", {
            expectedRevision: 1,
            parentId: a.id,
          }),
        ]);
        assert.deepEqual(responses.map((r) => r.status).sort(), [200, 400]);
      },
    );

    await t.test(
      "partial edits preserve omitted fields, reject empty/null edits and retain revisions on failure",
      async () => {
        for (const input of [
          {},
          { name: null },
          { screenId: null },
          { position: null },
        ]) {
          assert.equal(
            (
              await request(`${path()}/${root.id}`, "PATCH", {
                expectedRevision: 1,
                ...input,
              })
            ).status,
            400,
          );
        }
        const first = await request(`${path()}/${child.id}`, "PATCH", {
          expectedRevision: 1,
          description: "설명",
        });
        assert.equal(first.status, 200);
        const saved = (await first.json()) as IaItemDto;
        assert.equal(saved.parentId, root.id);
        assert.equal(saved.screenId, child.screenId);
        const clear = await request(`${path()}/${child.id}`, "PATCH", {
          expectedRevision: 2,
          description: null,
        });
        assert.equal(clear.status, 200);
        assert.equal(((await clear.json()) as IaItemDto).description, null);
        const conflict = await request(`${path()}/${child.id}`, "PATCH", {
          expectedRevision: 1,
          name: "오래된 입력",
        });
        assert.equal(conflict.status, 409);
        assert.equal((await errorValue(conflict)).details.currentRevision, 3);
        const races = await Promise.all(
          ["첫 수정", "다른 수정"].map((name) =>
            request(`${path()}/${child.id}`, "PATCH", {
              expectedRevision: 3,
              name,
            }),
          ),
        );
        assert.deepEqual(races.map((r) => r.status).sort(), [200, 409]);
      },
    );

    await t.test(
      "children and cases prevent deletion; renaming a screen keeps the case UUID reference",
      async () => {
        const blocked = await request(
          `${path()}/${root.id}?expectedRevision=1`,
          "DELETE",
        );
        assert.equal(blocked.status, 409);
        assert.equal((await errorValue(blocked)).code, "REFERENCE_IN_USE");
        const linked = await create("LINKED");
        const [testScenario] = await lease.database.db
          .insert(testScenarios)
          .values({
            projectId,
            name: "참조 검증",
            kind: "unit",
            sourceTemplateRevision: 1,
          })
          .returning();
        const caseId = randomUUID();
        await lease.database.db.insert(testCases).values({
          id: caseId,
          projectId,
          testScenarioId: testScenario.id,
          position: 0,
          caseCode: "",
          title: "",
        });
        await lease.database.db
          .insert(testCaseIaLinks)
          .values({ projectId, caseId, iaItemId: linked.id, position: 0 });
        assert.equal(
          (await request(`${path()}/${linked.id}?expectedRevision=1`, "DELETE"))
            .status,
          409,
        );
        const renamed = await request(`${path()}/${linked.id}`, "PATCH", {
          expectedRevision: 1,
          screenId: "RENAMED",
        });
        assert.equal(renamed.status, 200);
        assert.equal(((await renamed.json()) as IaItemDto).id, linked.id);
        const [relation] = await lease.database.db
          .select()
          .from(testCaseIaLinks)
          .where(eq(testCaseIaLinks.caseId, caseId));
        assert.equal(relation.iaItemId, linked.id);
        const staleDelete = await request(
          `${path()}/${linked.id}?expectedRevision=1`,
          "DELETE",
        );
        assert.equal(staleDelete.status, 409);
        assert.equal((await errorValue(staleDelete)).code, "REVISION_CONFLICT");
        await lease.database.db
          .delete(testCaseIaLinks)
          .where(eq(testCaseIaLinks.caseId, caseId));
        assert.equal(
          (await request(`${path()}/${linked.id}`, "DELETE")).status,
          400,
        );
        assert.equal(
          (await request(`${path()}/${linked.id}?expectedRevision=2`, "DELETE"))
            .status,
          204,
        );
        assert.equal(
          (await request(`${path()}/${linked.id}?expectedRevision=2`, "DELETE"))
            .status,
          404,
        );
      },
    );

    await t.test(
      "project locking serializes reference writers with deletion",
      async () => {
        const target = await create("LOCKED");
        const [testScenario] = await lease.database.db
          .insert(testScenarios)
          .values({
            projectId,
            name: "경합 검증",
            kind: "unit",
            sourceTemplateRevision: 1,
          })
          .returning();
        const caseId = randomUUID();
        await lease.database.db.insert(testCases).values({
          id: caseId,
          projectId,
          testScenarioId: testScenario.id,
          position: 0,
          caseCode: "",
          title: "",
        });
        let ready!: () => void, release!: () => void;
        const locked = new Promise<void>((resolve) => {
          ready = resolve;
        });
        const finish = new Promise<void>((resolve) => {
          release = resolve;
        });
        const writer = lease.database.db.transaction(async (tx) => {
          await tx
            .select()
            .from(projectTable)
            .where(eq(projectTable.id, projectId))
            .for("update");
          await tx
            .insert(testCaseIaLinks)
            .values({ projectId, caseId, iaItemId: target.id, position: 0 });
          ready();
          await finish;
        });
        await locked;
        const deletion = request(
          `${path()}/${target.id}?expectedRevision=1`,
          "DELETE",
        );
        release();
        await writer;
        assert.equal((await deletion).status, 409);
        const [relation] = await lease.database.db
          .select()
          .from(testCaseIaLinks)
          .where(
            and(
              eq(testCaseIaLinks.caseId, caseId),
              eq(testCaseIaLinks.iaItemId, target.id),
            ),
          );
        assert.ok(relation);
      },
    );

    const listed = (await (await request(path())).json()) as IaPageDto;
    assert.ok(
      listed.items.some(
        (row) => row.id === root.id && row.screenId === "ORD-01",
      ),
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
