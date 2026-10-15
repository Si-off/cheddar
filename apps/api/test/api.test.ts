import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
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
import type { FileDto, FilePageDto } from "../src/contracts/files.dto";
import type { ProjectDto, ProjectPageDto } from "../src/contracts/projects.dto";
import { DatabaseService } from "../src/database/database.service";
import { checkMigrations } from "../src/database/migrations";
import { MAX_FILE_BYTES } from "../src/files/file-validation";
import { FilesRepository } from "../src/files/files.repository";
import { LocalStorage } from "../src/storage/local-storage";
import { loadSdk } from "./sdk";

test("real PostgreSQL and HTTP foundation", async (t) => {
  const testUrl = process.env.TEST_DATABASE_URL;
  assert.ok(
    testUrl,
    "TEST_DATABASE_URL is required; integration tests are never silently skipped.",
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
    join(await realpath(tmpdir()), "cheddar-stage-1-http-"),
  );
  const config = {
    databaseUrl: testUrl,
    storageRoot,
    port: 3101,
    corsOrigins: ["http://127.0.0.1:5173"],
  };
  const folder = resolve(
    process.env.API_SOURCE_ROOT ?? process.cwd(),
    "migrations",
  );
  const admin = new DatabaseService(config);
  const lock = await admin.pool.connect();
  const created: string[] = [];
  let closeApp: () => Promise<void> = async () => {};
  try {
    const identity = await lock.query<{
      db: string;
      owner: string;
      superuser: boolean;
    }>(
      "SELECT current_database() db, pg_get_userbyid(datdba) owner, (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser FROM pg_database WHERE datname=current_database()",
    );
    assert.equal(identity.rows[0].owner, "cheddar_stage1");
    assert.equal(identity.rows[0].superuser, false);
    const acquired = await lock.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_lock(31015432) locked",
    );
    assert.equal(
      acquired.rows[0].locked,
      true,
      "Another foundation test process is using this DB.",
    );
    await migrate(admin.db, { migrationsFolder: folder });
    await migrate(admin.db, { migrationsFolder: folder });
    await checkMigrations(admin, folder);
    const module = await Test.createTestingModule({
      imports: [appModule(config, folder)],
    }).compile();
    const app = module.createNestApplication({ logger: false });
    configureApp(app, config);
    closeApp = () => app.close();
    const storage = app.get(LocalStorage);
    await storage.initialize();
    await app.listen(0, "127.0.0.1");
    const base = await app.getUrl();
    const request = (path: string, init?: RequestInit) =>
      fetch(base + path, init);
    const json = (body: unknown, method = "POST"): RequestInit => ({
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const makeProject = async (name: string) => {
      const res = await request("/api/v1/projects", json({ name }));
      assert.equal(res.status, 201);
      const value = (await res.json()) as ProjectDto;
      created.push(value.id);
      return value;
    };
    const project = await makeProject("  주문 QA  ");
    const other = await makeProject("다른 프로젝트");
    const prefix = `/api/v1/projects/${project.id}/files`;
    const document = createDocument(app);
    const ajv = new Ajv({ strict: false });
    addFormats(ajv);
    ajv.addSchema(document, "api");
    const matches = (name: string, value: unknown) => {
      const validate = ajv.compile({ $ref: `api#/components/schemas/${name}` });
      assert.equal(validate(value), true, JSON.stringify(validate.errors));
    };

    await t.test(
      "health, offline-compatible schema and strict project contract",
      async () => {
        assert.equal(project.name, "주문 QA");
        assert.equal(project.revision, 1);
        assert.equal(
          (
            await request("/api/v1/projects", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{invalid",
            })
          ).status,
          400,
        );
        matches("ProjectDto", project);
        assert.equal((await request("/health/live")).status, 200);
        assert.equal((await request("/health/ready")).status, 200);
        const exported = await (await request("/openapi.json")).json();
        assert.deepEqual(exported, document);
        assert.ok(
          !Object.keys(document.paths).some(
            (p) => p.includes("sheets") || p.includes("uploads"),
          ),
        );
        for (const input of [
          { name: "  " },
          { name: "ok", extra: "secret" },
          { name: null },
        ]) {
          const res = await request("/api/v1/projects", json(input));
          assert.equal(res.status, 400);
          matches("ErrorResponseDto", await res.json());
        }
        assert.equal((await request("/api/v1/projects/bad-id")).status, 400);
        assert.equal(
          (await request(`/api/v1/projects/${randomUUID()}`)).status,
          404,
        );
        const foreign = await request("/api/v1/projects", {
          ...json({ name: "blocked" }),
          headers: {
            "Content-Type": "application/json",
            Origin: "https://untrusted.example",
          },
        });
        assert.equal(foreign.status, 403);
        const patch = await request(
          `/api/v1/projects/${project.id}`,
          json({ expectedRevision: 1 }, "PATCH"),
        );
        assert.equal(patch.status, 400);
      },
    );
    await t.test(
      "revision conflicts preserve the winning value, and null clears description",
      async () => {
        const results = await Promise.all(
          ["첫 변경", "둘째 변경"].map((name) =>
            request(
              `/api/v1/projects/${project.id}`,
              json({ expectedRevision: 1, name, description: "memo" }, "PATCH"),
            ),
          ),
        );
        assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
        const winner = (await results
          .find((r) => r.status === 200)
          ?.json()) as ProjectDto;
        const conflict = (await results
          .find((r) => r.status === 409)
          ?.json()) as { error: { details: { currentRevision: number } } };
        assert.equal(conflict.error.details.currentRevision, 2);
        const stored = (await (
          await request(`/api/v1/projects/${project.id}`)
        ).json()) as ProjectDto;
        assert.equal(stored.name, winner.name);
        const cleared = (await (
          await request(
            `/api/v1/projects/${project.id}`,
            json({ expectedRevision: 2, description: null }, "PATCH"),
          )
        ).json()) as ProjectDto;
        assert.equal(cleared.description, null);
        assert.equal(cleared.revision, 3);
      },
    );
    await t.test(
      "cursor pagination is stable without duplicates and rejects invalid cursors",
      async () => {
        const seen = new Set<string>();
        let cursor: string | null = null;
        do {
          const response = await request(
            `/api/v1/projects?limit=1${cursor ? `&cursor=${cursor}` : ""}`,
          );
          assert.equal(response.status, 200);
          const page = (await response.json()) as ProjectPageDto;
          matches("ProjectPageDto", page);
          for (const row of page.items) {
            assert.ok(!seen.has(row.id));
            seen.add(row.id);
          }
          cursor = page.nextCursor;
        } while (cursor);
        assert.ok(seen.has(project.id) && seen.has(other.id));
        for (const query of [
          "limit=101",
          "limit=1.5",
          "cursor=broken",
          "limit=1&unknown=yes",
        ])
          assert.equal(
            (await request(`/api/v1/projects?${query}`)).status,
            400,
          );
      },
    );
    const upload = async (
      bytes: Uint8Array,
      type = "application/json",
      name = "source.json",
      path = prefix,
    ) => {
      const form = new FormData();
      form.set("file", new Blob([new Uint8Array(bytes)], { type }), name);
      return request(path, { method: "POST", body: form });
    };
    const bytes = Buffer.from('{"name":"주문 화면"}');
    let fileId = "";
    await t.test(
      "file bytes and public metadata survive, cross-project references do not",
      async () => {
        const response = await upload(
          bytes,
          "application/json",
          "주문 프레임.json",
        );
        assert.equal(response.status, 201);
        const file = (await response.json()) as FileDto;
        fileId = file.id;
        assert.equal(file.originalName, "주문 프레임.json");
        matches("FileDto", file);
        assert.equal(
          file.sha256,
          createHash("sha256").update(bytes).digest("hex"),
        );
        assert.ok(!("storageKey" in file));
        assert.ok(!JSON.stringify(file).includes(storageRoot));
        const content = await request(`${prefix}/${file.id}/content`);
        assert.equal(content.status, 200);
        assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
        assert.match(
          content.headers.get("content-disposition") ?? "",
          /^attachment/,
        );
        assert.equal(
          (await request(`/api/v1/projects/${other.id}/files/${file.id}`))
            .status,
          404,
        );
        assert.equal(
          (
            await request(
              `/api/v1/projects/${other.id}/files/${file.id}/content`,
            )
          ).status,
          404,
        );
        matches("FilePageDto", await (await request(prefix)).json());
      },
    );
    await t.test(
      "invalid formats, JSON, sizes and extra multipart fields are rejected",
      async () => {
        assert.equal(
          (await upload(Buffer.from("not png"), "image/png")).status,
          415,
        );
        assert.equal((await upload(Buffer.from("bad json"))).status, 400);
        assert.equal(
          (await upload(Buffer.alloc(MAX_FILE_BYTES + 1), "image/png")).status,
          413,
        );
        const form = new FormData();
        form.set(
          "file",
          new Blob([bytes], { type: "application/json" }),
          "data.json",
        );
        form.set("extra", "bad");
        assert.equal(
          (await request(prefix, { method: "POST", body: form })).status,
          400,
        );
        const page = (await (await request(prefix)).json()) as FilePageDto;
        assert.equal(page.items.length, 1);
      },
    );
    await t.test(
      "disk and final DB write failures never expose partial files",
      async () => {
        const disk = t.mock.method(storage, "stage", async () => {
          throw new Error("secret filesystem path");
        });
        const failedDisk = await upload(bytes);
        assert.equal(failedDisk.status, 503);
        assert.ok(!(await failedDisk.text()).includes("secret"));
        disk.mock.restore();
        const repository = app.get(FilesRepository);
        const db = t.mock.method(repository, "ready", async () => {
          throw new Error("secret SQL");
        });
        assert.equal((await upload(bytes)).status, 503);
        db.mock.restore();
        const page = (await (await request(prefix)).json()) as FilePageDto;
        assert.equal(page.items.length, 1);
        const failures = await admin.pool.query<{ id: string }>(
          "SELECT id FROM files WHERE project_id=$1 AND status='failed'",
          [project.id],
        );
        assert.ok(failures.rows.length >= 2);
        for (const file of failures.rows)
          assert.equal((await request(`${prefix}/${file.id}`)).status, 404);
        assert.deepEqual(
          Buffer.from(
            await (await request(`${prefix}/${fileId}/content`)).arrayBuffer(),
          ),
          bytes,
        );
      },
    );
    await t.test(
      "symlink and traversal attempts cannot escape storage",
      async () => {
        await assert.rejects(storage.open("../outside"));
        const id = randomUUID();
        const outside = join(storageRoot, "outside.txt");
        await writeFile(outside, "private");
        await symlink(outside, join(storageRoot, project.id, id));
        await assert.rejects(storage.open(`${project.id}/${id}`));
        const linkedProject = randomUUID();
        await symlink(storageRoot, join(storageRoot, linkedProject));
        await assert.rejects(storage.open(`${linkedProject}/${id}`));
      },
    );
    await t.test(
      "readiness returns sanitized 503 when storage or DB is unavailable",
      async () => {
        const failure = t.mock.method(storage, "check", async () => {
          throw new Error("private path");
        });
        const res = await request("/health/ready");
        assert.equal(res.status, 503);
        assert.ok(!(await res.text()).includes("private"));
        failure.mock.restore();
        const db = app.get(DatabaseService);
        const lost = t.mock.method(db.pool, "query", () => {
          throw new Error("private password");
        });
        assert.equal((await request("/health/ready")).status, 503);
        lost.mock.restore();
        assert.equal((await request("/health/ready")).status, 200);
      },
    );
    await t.test(
      "both generated SDKs perform real project and multipart requests",
      async () => {
        const sourceRoot = process.env.API_SOURCE_ROOT ?? process.cwd();
        for (const [name, source] of [
          ["web", resolve(sourceRoot, "../web/src/shared/api/generated")],
          [
            "plugin",
            resolve(sourceRoot, "../figma-plugin/src/ui/shared/api/generated"),
          ],
        ]) {
          const sdk = await loadSdk(source, join(storageRoot, `sdk-${name}`));
          const result = await sdk.createProject({
            baseUrl: base,
            body: { name: `SDK ${name}` },
            throwOnError: true,
          });
          assert.equal(result.response.status, 201);
          const value = result.data as ProjectDto;
          created.push(value.id);
          matches("ProjectDto", value);
          const listed = await sdk.listProjects({
            baseUrl: base,
            query: { limit: 1 },
            throwOnError: true,
          });
          assert.equal((listed.data as ProjectPageDto).items.length, 1);
          const uploaded = await sdk.uploadFile({
            baseUrl: base,
            path: { projectId: value.id },
            body: {
              file: new File([bytes], "연결.json", {
                type: "application/json",
              }),
            },
            throwOnError: true,
          });
          assert.equal(uploaded.response.status, 201);
          const file = uploaded.data as FileDto;
          matches("FileDto", file);
          assert.equal(file.originalName, "연결.json");
          const downloaded = await sdk.downloadFile({
            baseUrl: base,
            path: { projectId: value.id, fileId: file.id },
            parseAs: "arrayBuffer",
            throwOnError: true,
          });
          assert.deepEqual(Buffer.from(downloaded.data as ArrayBuffer), bytes);
        }
      },
    );
    await t.test(
      "fresh application and DB pool can retrieve persisted project and file",
      async () => {
        await app.close();
        closeApp = async () => {};
        const fresh = await Test.createTestingModule({
          imports: [appModule(config, folder)],
        }).compile();
        const restarted = fresh.createNestApplication({ logger: false });
        configureApp(restarted, config);
        closeApp = () => restarted.close();
        await restarted.get(LocalStorage).initialize();
        await restarted.listen(0, "127.0.0.1");
        const url = await restarted.getUrl();
        const projectAfter = (await (
          await fetch(`${url}/api/v1/projects/${project.id}`)
        ).json()) as ProjectDto;
        assert.equal(projectAfter.revision, 3);
        const content = await fetch(`${url}${prefix}/${fileId}/content`);
        assert.equal(content.status, 200);
        assert.deepEqual(Buffer.from(await content.arrayBuffer()), bytes);
      },
    );
  } finally {
    await closeApp();
    // Delete only rows created by this run; never truncate or reset a database.
    if (created.length) {
      await lock.query("DELETE FROM files WHERE project_id = ANY($1::uuid[])", [
        created,
      ]);
      await lock.query("DELETE FROM projects WHERE id = ANY($1::uuid[])", [
        created,
      ]);
    }
    await lock.query("SELECT pg_advisory_unlock(31015432)");
    lock.release();
    await admin.onModuleDestroy();
    await rm(storageRoot, { recursive: true, force: true });
  }
});
