import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import type { ProjectTemplateDto } from "../src/contracts/ia.dto";
import { projects, projectTemplates } from "../src/database/schema";
import { ProjectsRepository } from "../src/projects/projects.repository";
import { TemplatesRepository } from "../src/templates/templates.repository";
import { openTestDatabase } from "./database";

test("project template HTTP saves a complete version while preserving column identity", async (t) => {
  const lease = await openTestDatabase();
  const module = await Test.createTestingModule({
    imports: [appModule(lease.config, lease.folder)],
  }).compile();
  const app = module.createNestApplication({ logger: false });
  try {
    configureApp(app, lease.config);
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const project = await new ProjectsRepository(lease.database).create({
      name: "양식 검증",
    });
    lease.projects.push(project.id);
    const path = `${base}/api/v1/projects/${project.id}/template`;
    const read = async (): Promise<ProjectTemplateDto> => {
      const response = await fetch(path);
      assert.equal(response.status, 200);
      return (await response.json()) as ProjectTemplateDto;
    };
    const put = (body: unknown) =>
      fetch(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    const initial = await read();

    await t.test(
      "GET is a stable read and the transaction snapshot boundary is exported",
      async () => {
        assert.equal(initial.revision, 1);
        assert.equal(initial.columns.length, 2);
        assert.ok(initial.view.every((column) => column.width >= 100));
        assert.deepEqual(
          initial.columns.slice(0, 8).map((column) => column.name),
          ["테스트 ID", "테스트 항목"],
        );
        assert.deepEqual(await read(), initial);
        const snapshot = await lease.database.db.transaction(async (tx) => {
          await tx
            .select()
            .from(projects)
            .where(eq(projects.id, project.id))
            .for("update");
          return app.get(TemplatesRepository).readSnapshot(tx, project.id);
        });
        assert.deepEqual(snapshot, initial);
        assert.equal(
          (await fetch(`${base}/api/v1/projects/${randomUUID()}/template`))
            .status,
          404,
        );
      },
    );

    await t.test(
      "invalid snapshots and changed system identities fail without partial writes",
      async () => {
        const columnId = randomUUID();
        for (const input of [
          { columns: initial.columns.slice(1), view: initial.view.slice(1) },
          { columns: initial.columns, view: initial.view.slice(1) },
          {
            columns: [
              { ...initial.columns[0], id: columnId },
              ...initial.columns.slice(1),
            ],
            view: [{ ...initial.view[0], columnId }, ...initial.view.slice(1)],
          },
          {
            columns: initial.columns.map((column) => ({
              ...column,
              name: " ",
            })),
            view: initial.view,
          },
          {
            columns: initial.columns,
            view: initial.view.map((column) => ({ ...column, width: 0 })),
          },
          {
            columns: initial.columns,
            view: initial.view.map((column) => ({
              ...column,
              width: 2147483648,
            })),
          },
        ]) {
          assert.equal(
            (await put({ ...input, expectedRevision: 1 })).status,
            400,
          );
          assert.deepEqual(await read(), initial);
        }
      },
    );

    let saved: ProjectTemplateDto;
    await t.test(
      "column rename, order, width and text custom columns commit together; stale edits conflict",
      async () => {
        const custom = {
          id: randomUUID(),
          kind: "custom",
          valueType: "text",
          name: "메모",
        };
        const columns = [
          ...initial.columns.map((column, index) => ({
            ...column,
            name: index === 0 ? "번호" : column.name,
          })),
          custom,
        ];
        const view = [
          { columnId: custom.id, width: 240 },
          ...[...initial.view].reverse(),
        ];
        const response = await put({ expectedRevision: 1, columns, view });
        assert.equal(response.status, 200);
        saved = (await response.json()) as ProjectTemplateDto;
        assert.equal(saved.revision, 2);
        assert.deepEqual(saved.columns, columns);
        assert.deepEqual(saved.view, view);
        assert.deepEqual(await read(), saved);
        const stale = await put({
          expectedRevision: 1,
          columns: initial.columns,
          view: initial.view,
        });
        assert.equal(stale.status, 409);
        assert.equal(
          (
            (await stale.json()) as {
              error: { details: { currentRevision: number } };
            }
          ).error.details.currentRevision,
          2,
        );
        const attempts = await Promise.all(
          [0, 1].map(() => put({ expectedRevision: 2, columns, view })),
        );
        assert.deepEqual(attempts.map((r) => r.status).sort(), [200, 409]);
        const current = await read();
        const remove = await put({
          expectedRevision: current.revision,
          columns: initial.columns,
          view: initial.view,
        });
        assert.equal(remove.status, 200);
        assert.deepEqual((await read()).columns, initial.columns);
      },
    );

    await t.test(
      "a missing stored template is not silently recreated by GET or the snapshot boundary",
      async () => {
        const empty = await new ProjectsRepository(lease.database).create({
          name: "불변조건 검증",
        });
        lease.projects.push(empty.id);
        await lease.database.db
          .delete(projectTemplates)
          .where(eq(projectTemplates.projectId, empty.id));
        assert.equal(
          (await fetch(`${base}/api/v1/projects/${empty.id}/template`)).status,
          404,
        );
        const [row] = await lease.database.db
          .select()
          .from(projectTemplates)
          .where(eq(projectTemplates.projectId, empty.id));
        assert.equal(row, undefined);
      },
    );
  } finally {
    await app.close();
    await lease.close();
  }
});
