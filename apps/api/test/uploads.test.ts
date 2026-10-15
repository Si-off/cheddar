import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import type { FileDto } from "../src/contracts/files.dto";
import type { ProjectDto } from "../src/contracts/projects.dto";
import type {
  CreateUploadDto,
  UploadDto,
  UploadPageDto,
} from "../src/contracts/uploads.dto";
import { DatabaseService } from "../src/database/database.service";
import { LocalStorage } from "../src/storage/local-storage";
import { UploadsModule } from "../src/uploads/uploads.module";

test("upload bundles preserve ordered frames, project boundaries and retry identity", async (t) => {
  const testUrl = process.env.TEST_DATABASE_URL;
  assert.ok(
    testUrl,
    "TEST_DATABASE_URL is required; integration tests are never skipped.",
  );
  const target = new URL(testUrl);
  const runtime = new URL(process.env.DATABASE_URL ?? testUrl);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname));
  assert.equal(decodeURIComponent(target.pathname), "/cheddar_stage1_test");
  assert.equal(decodeURIComponent(target.username), "cheddar_stage1");
  assert.notEqual(
    `${target.hostname}:${target.port}${target.pathname}`,
    `${runtime.hostname}:${runtime.port}${runtime.pathname}`,
  );
  const storageRoot = await mkdtemp(
    join(await realpath(tmpdir()), "cheddar-2a-http-"),
  );
  const config = {
    databaseUrl: testUrl,
    storageRoot,
    port: 3102,
    corsOrigins: ["http://127.0.0.1:5175"],
  };
  const folder = resolve(
    process.env.API_SOURCE_ROOT ?? process.cwd(),
    "migrations",
  );
  const admin = new DatabaseService(config);
  const lock = await admin.pool.connect();
  const projects: string[] = [];
  let closeApp: () => Promise<void> = async () => {};
  let locked = false;
  try {
    const identity = await lock.query<{ owner: string; superuser: boolean }>(
      "SELECT pg_get_userbyid(datdba) owner,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser FROM pg_database WHERE datname=current_database()",
    );
    assert.equal(identity.rows[0].owner, "cheddar_stage1");
    assert.equal(identity.rows[0].superuser, false);
    locked = (
      await lock.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_lock(31015432) locked",
      )
    ).rows[0].locked;
    assert.ok(locked, "Another API test process is using this DB.");
    await migrate(admin.db, { migrationsFolder: folder });
    const module = await Test.createTestingModule({
      imports: [appModule(config, folder), UploadsModule],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    configureApp(app, config);
    closeApp = () => app.close();
    await app.get(LocalStorage).initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const request = (path: string, init?: RequestInit) =>
      fetch(base + path, init);
    const json = (value: unknown): RequestInit => ({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    async function project(name: string) {
      const res = await request("/api/v1/projects", json({ name }));
      assert.equal(res.status, 201);
      const value = (await res.json()) as ProjectDto;
      projects.push(value.id);
      return value;
    }
    const first = await project("프레임 테스트");
    const other = await project("다른 프로젝트");
    const prefix = `/api/v1/projects/${first.id}/uploads`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
      "base64",
    );
    async function file(projectId: string, image: boolean) {
      const form = new FormData();
      form.set(
        "file",
        new Blob(
          [image ? png : Buffer.from('{"schemaVersion":1,"화면":"주문"}')],
          { type: image ? "image/png" : "application/json" },
        ),
        image ? "주문.png" : "주문.json",
      );
      const res = await request(`/api/v1/projects/${projectId}/files`, {
        method: "POST",
        body: form,
      });
      assert.equal(res.status, 201);
      return (await res.json()) as FileDto;
    }
    const image = await file(first.id, true);
    const data = await file(first.id, false);
    const otherImage = await file(other.id, true);
    const frame = {
      figmaFileKey: "file:key",
      figmaNodeId: "12:34",
      name: "주문",
      width: 390.5,
      height: 844,
      imageFileId: image.id,
      dataFileId: data.id,
    };
    const input: CreateUploadDto = {
      clientRequestId: randomUUID(),
      name: "  주문 묶음  ",
      frames: [frame, { ...frame, figmaNodeId: "56:78", name: "완료" }],
    };
    const document = createDocument(app);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(document, "api");
    function matches(name: string, value: unknown) {
      const validate = ajv.compile({ $ref: `api#/components/schemas/${name}` });
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
    }
    let saved: UploadDto;
    await t.test(
      "creates complete immutable bundles and retries canonical requests without duplication",
      async () => {
        const response = await request(prefix, json(input));
        assert.equal(response.status, 201);
        saved = (await response.json()) as UploadDto;
        matches("UploadDto", saved);
        assert.equal(saved.name, "주문 묶음");
        assert.deepEqual(
          saved.frames.map((item) => item.figmaNodeId),
          ["12:34", "56:78"],
        );
        assert.equal(new Set(saved.frames.map((item) => item.id)).size, 2);
        assert.ok(!JSON.stringify(saved).includes("requestHash"));
        assert.ok(!JSON.stringify(saved).includes(storageRoot));
        const retried = await request(
          prefix,
          json({
            frames: input.frames.map((item) => ({
              ...item,
              imageFileId: item.imageFileId.toUpperCase(),
            })),
            name: "주문 묶음",
            clientRequestId: input.clientRequestId.toUpperCase(),
          }),
        );
        assert.equal(retried.status, 200);
        assert.deepEqual(await retried.json(), saved);
        const conflict = await request(
          prefix,
          json({ ...input, frames: [...input.frames].reverse() }),
        );
        assert.equal(conflict.status, 409);
        assert.equal(
          ((await conflict.json()) as { error: { code: string } }).error.code,
          "IDEMPOTENCY_CONFLICT",
        );
        assert.deepEqual(
          await (await request(`${prefix}/${saved.id}`)).json(),
          saved,
        );
        assert.equal(
          (
            await request(`${prefix}/${saved.id}`, {
              ...json({ name: "변경" }),
              method: "PATCH",
            })
          ).status,
          404,
        );
      },
    );
    await t.test(
      "concurrent identical requests commit only one bundle and one frame set",
      async () => {
        const concurrent = {
          ...input,
          clientRequestId: randomUUID(),
          name: "동시 요청",
        };
        const responses = await Promise.all([
          request(prefix, json(concurrent)),
          request(prefix, json(concurrent)),
        ]);
        assert.deepEqual(
          responses.map((item) => item.status).sort(),
          [200, 201],
        );
        const values = (await Promise.all(
          responses.map((item) => item.json()),
        )) as UploadDto[];
        assert.deepEqual(values[0], values[1]);
        const rows = await lock.query<{ count: string }>(
          "SELECT count(*) count FROM uploads WHERE project_id=$1 AND client_request_id=$2",
          [first.id, concurrent.clientRequestId],
        );
        assert.equal(rows.rows[0].count, "1");
        const conflicting = { ...input, clientRequestId: randomUUID() };
        const mixed = await Promise.all([
          request(prefix, json(conflicting)),
          request(prefix, json({ ...conflicting, name: "다른 내용" })),
        ]);
        assert.deepEqual(mixed.map((item) => item.status).sort(), [201, 409]);
      },
    );
    await t.test(
      "wrong-project, unready and mismatched files never leave incomplete bundles",
      async () => {
        const pendingId = randomUUID();
        await lock.query(
          "INSERT INTO files(id,project_id,storage_key,original_name,status) VALUES($1,$2,$3,'pending.json','pending')",
          [pendingId, first.id, `${first.id}/${pendingId}`],
        );
        for (const [invalidFrame, status] of [
          [{ ...frame, imageFileId: otherImage.id }, 404],
          [{ ...frame, dataFileId: randomUUID() }, 404],
          [{ ...frame, dataFileId: pendingId }, 404],
          [{ ...frame, imageFileId: data.id }, 400],
          [{ ...frame, dataFileId: image.id }, 400],
        ] as const) {
          const key = randomUUID();
          assert.equal(
            (
              await request(
                prefix,
                json({
                  ...input,
                  clientRequestId: key,
                  frames: [invalidFrame],
                }),
              )
            ).status,
            status,
          );
          const rows = await lock.query(
            "SELECT id FROM uploads WHERE project_id=$1 AND client_request_id=$2",
            [first.id, key],
          );
          assert.equal(rows.rowCount, 0);
        }
        for (const body of [
          { ...input, frames: [] },
          { ...input, frames: [frame, frame] },
          { ...input, extra: true },
          { ...input, frames: [{ ...frame, width: 0 }] },
        ])
          assert.equal((await request(prefix, json(body))).status, 400);
        assert.equal(
          (await request(`/api/v1/projects/${other.id}/uploads/${saved.id}`))
            .status,
          404,
        );
        assert.equal(
          (await request(`/api/v1/projects/${randomUUID()}/uploads`)).status,
          404,
        );
        assert.equal((await request(`${prefix}?cursor=broken`)).status, 400);
      },
    );
    await t.test(
      "cursor pages retain every bundle once, including identical timestamps",
      async () => {
        await lock.query(
          "UPDATE uploads SET created_at='2026-10-15T00:00:00Z' WHERE project_id=$1",
          [first.id],
        );
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const response = await request(
            `${prefix}?limit=1${cursor ? `&cursor=${cursor}` : ""}`,
          );
          assert.equal(response.status, 200);
          const page = (await response.json()) as UploadPageDto;
          matches("UploadPageDto", page);
          for (const row of page.items) {
            assert.ok(!seen.has(row.id));
            seen.add(row.id);
            assert.equal(row.frameCount, 2);
          }
          cursor = page.nextCursor;
        } while (cursor);
        assert.equal(seen.size, 3);
      },
    );
    await t.test(
      "new application pools can read persisted frames and source bytes",
      async () => {
        await app.close();
        closeApp = async () => {};
        const freshModule = await Test.createTestingModule({
          imports: [appModule(config, folder), UploadsModule],
        }).compile();
        const fresh = freshModule.createNestApplication({ logger: false });
        configureApp(fresh, config);
        closeApp = () => fresh.close();
        await fresh.get(LocalStorage).initialize();
        await fresh.listen(0, "127.0.0.1");
        const url = await fresh.getUrl();
        const result = await fetch(`${url}${prefix}/${saved.id}`);
        assert.equal(result.status, 200);
        const restored = (await result.json()) as UploadDto;
        assert.deepEqual(restored.frames, saved.frames);
        const source = await fetch(
          `${url}/api/v1/projects/${first.id}/files/${restored.frames[0].imageFileId}/content`,
        );
        assert.deepEqual(Buffer.from(await source.arrayBuffer()), png);
      },
    );
  } finally {
    await closeApp();
    if (locked && projects.length) {
      await lock.query(
        "DELETE FROM upload_frames WHERE project_id=ANY($1::uuid[])",
        [projects],
      );
      await lock.query("DELETE FROM uploads WHERE project_id=ANY($1::uuid[])", [
        projects,
      ]);
      await lock.query("DELETE FROM files WHERE project_id=ANY($1::uuid[])", [
        projects,
      ]);
      await lock.query("DELETE FROM projects WHERE id=ANY($1::uuid[])", [
        projects,
      ]);
    }
    if (locked) await lock.query("SELECT pg_advisory_unlock(31015432)");
    lock.release();
    await admin.onModuleDestroy();
    await rm(storageRoot, { recursive: true, force: true });
  }
});
