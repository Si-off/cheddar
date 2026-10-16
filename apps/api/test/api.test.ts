import "reflect-metadata";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { appModule } from "../src/app.module";
import { configureApp } from "../src/common/application";
import { createDocument } from "../src/common/openapi";
import { readEnv } from "../src/config/env";
import type { FileDto, FilePageDto } from "../src/contracts/files.dto";
import type {
  IaItemDto,
  IaPageDto,
  ProjectTemplateDto,
} from "../src/contracts/ia.dto";
import type { ProjectDto, ProjectPageDto } from "../src/contracts/projects.dto";
import type {
  TestScenarioPageDto,
  TestScenarioSnapshotDto,
} from "../src/contracts/test-scenarios.dto";
import { DatabaseService } from "../src/database/database.service";
import { MAX_FILE_BYTES } from "../src/files/file-validation";
import { FilesRepository } from "../src/files/files.repository";
import { LocalStorage } from "../src/storage/local-storage";
import { openTestDatabase } from "./database";
import { loadSdk } from "./sdk";

test("real PostgreSQL and HTTP foundation", async (t) => {
  const lease = await openTestDatabase();
  const { config, database: admin, lock, projects: created, folder } = lease;
  const testUrl = config.databaseUrl;
  const storageRoot = config.storageRoot;
  let closeApp: () => Promise<void> = async () => {};
  try {
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
          Object.keys(document.paths).some((p) => p.includes("test-scenarios")),
        );
        assert.ok(
          Object.keys(document.paths).some((p) => p.includes("uploads")),
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
      "null origin is rejected by default and explicitly enabled only for local development",
      async () => {
        const send = (origin: string): RequestInit => ({
          ...json({ name: "" }),
          headers: { "Content-Type": "application/json", Origin: origin },
        });
        assert.equal(
          (await request("/api/v1/projects", send("null"))).status,
          403,
        );
        const devConfig = readEnv({
          DATABASE_URL: testUrl,
          FILE_STORAGE_ROOT: storageRoot,
          NODE_ENV: "development",
          ALLOW_FIGMA_NULL_ORIGIN: "true",
        });
        const devModule = await Test.createTestingModule({
          imports: [appModule(devConfig, folder)],
        }).compile();
        const devApp = devModule.createNestApplication({ logger: false });
        try {
          configureApp(devApp, devConfig);
          await devApp.listen(0, "127.0.0.1");
          const devUrl = await devApp.getUrl();
          const preflight = await fetch(`${devUrl}/api/v1/projects`, {
            method: "OPTIONS",
            headers: {
              Origin: "null",
              "Access-Control-Request-Method": "POST",
              "Access-Control-Request-Headers": "content-type",
            },
          });
          assert.equal(preflight.status, 204);
          assert.equal(
            preflight.headers.get("access-control-allow-origin"),
            "null",
          );
          assert.equal(
            preflight.headers.get("access-control-allow-credentials"),
            null,
          );
          const allowed = await fetch(
            `${devUrl}/api/v1/projects`,
            send("null"),
          );
          assert.equal(allowed.status, 400); // Reached DTO validation; no project was created.
          assert.equal(
            allowed.headers.get("access-control-allow-origin"),
            "null",
          );
          assert.equal(
            (
              await fetch(
                `${devUrl}/api/v1/projects`,
                send("https://untrusted.example"),
              )
            ).status,
            403,
          );
        } finally {
          await devApp.close();
        }
      },
    );
    await t.test(
      "upload constraints prevent cross-project references and duplicate retry/source identities",
      async () => {
        await lock.query("BEGIN");
        try {
          const uploadId = randomUUID(),
            otherUpload = randomUUID(),
            requestId = randomUUID();
          const imageId = randomUUID(),
            dataId = randomUUID(),
            foreignId = randomUUID();
          for (const [id, projectId, mime] of [
            [imageId, project.id, "image/png"],
            [dataId, project.id, "application/json"],
            [foreignId, other.id, "image/png"],
          ]) {
            await lock.query(
              "INSERT INTO files (id, project_id, storage_key, original_name, status, media_type, byte_size, sha256) VALUES ($1::uuid,$2,$1::uuid::text,'fixture','ready',$3,1,$4)",
              [id, projectId, mime, "a".repeat(64)],
            );
          }
          const uploadSql =
            "INSERT INTO uploads (id,project_id,name,client_request_id,request_hash) VALUES ($1,$2,'묶음',$3,$4)";
          await lock.query(uploadSql, [
            uploadId,
            project.id,
            requestId,
            "a".repeat(64),
          ]);
          await lock.query(uploadSql, [
            otherUpload,
            other.id,
            requestId,
            "a".repeat(64),
          ]);
          const frameSql =
            "INSERT INTO upload_frames (id,project_id,upload_id,position,figma_file_key,figma_node_id,name,width,height,image_file_id,data_file_id) VALUES ($1,$2,$3,$4,'AbC',$5,'화면',$6,844,$7,$8)";
          const frameValues = [
            randomUUID(),
            project.id,
            uploadId,
            0,
            "12:34",
            390,
            imageId,
            dataId,
          ];
          await lock.query(frameSql, frameValues);
          const fails = async (
            sql: string,
            values: unknown[],
            code: string,
          ) => {
            await lock.query("SAVEPOINT expected_failure");
            try {
              await assert.rejects(
                lock.query(sql, values),
                (err: unknown) => (err as { code?: string }).code === code,
              );
            } finally {
              await lock.query("ROLLBACK TO SAVEPOINT expected_failure");
            }
          };
          await fails(
            uploadSql,
            [randomUUID(), project.id, requestId, "a".repeat(64)],
            "23505",
          );
          const frame = (changes: Record<number, unknown>) =>
            Object.assign(
              [...frameValues],
              { 0: randomUUID(), 3: 1, 4: "12:35" },
              changes,
            );
          await fails(frameSql, frame({ 2: otherUpload }), "23503");
          await fails(frameSql, frame({ 6: foreignId }), "23503");
          await fails(frameSql, frame({ 7: foreignId }), "23503");
          await fails(frameSql, frame({ 3: 0 }), "23505");
          await fails(frameSql, frame({ 4: "12:34" }), "23505");
          for (const width of [0, -1, Infinity, NaN])
            await fails(frameSql, frame({ 5: width }), "23514");
          await fails("DELETE FROM files WHERE id=$1", [imageId], "23503");
          await fails("DELETE FROM uploads WHERE id=$1", [uploadId], "23503");
        } finally {
          await lock.query("ROLLBACK");
        }
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
          const template = await sdk.getProjectTemplate({
            baseUrl: base,
            path: { projectId: value.id },
            throwOnError: true,
          });
          const initialTemplate = template.data as ProjectTemplateDto;
          matches("ProjectTemplateDto", initialTemplate);
          const updatedTemplate = await sdk.updateProjectTemplate({
            baseUrl: base,
            path: { projectId: value.id },
            body: {
              expectedRevision: 1,
              columns: initialTemplate.columns.map((column, index) =>
                index === 0 ? { ...column, name: "검증 번호" } : column,
              ),
              view: initialTemplate.view,
            },
            throwOnError: true,
          });
          assert.equal(
            (updatedTemplate.data as ProjectTemplateDto).revision,
            2,
          );
          const ia = await sdk.createIaItem({
            baseUrl: base,
            path: { projectId: value.id },
            body: { screenId: "SDK-01", name: "SDK 화면", position: 0 },
            throwOnError: true,
          });
          const iaItem = ia.data as IaItemDto;
          matches("IaItemDto", iaItem);
          const changed = await sdk.updateIaItem({
            baseUrl: base,
            path: { projectId: value.id, itemId: iaItem.id },
            body: { expectedRevision: 1, name: "수정 화면" },
            throwOnError: true,
          });
          assert.equal((changed.data as IaItemDto).revision, 2);
          const iaList = await sdk.listIaItems({
            baseUrl: base,
            path: { projectId: value.id },
            throwOnError: true,
          });
          assert.equal((iaList.data as IaPageDto).items[0].name, "수정 화면");
          const deleted = await sdk.deleteIaItem({
            baseUrl: base,
            path: { projectId: value.id, itemId: iaItem.id },
            query: { expectedRevision: 2 },
            throwOnError: true,
          });
          assert.equal(deleted.response.status, 204);
          const newTestScenario = await sdk.createTestScenario({
            baseUrl: base,
            path: { projectId: value.id },
            body: { name: "SDK 시트", kind: "unit" },
            throwOnError: true,
          });
          assert.equal(newTestScenario.response.status, 201);
          const testScenario = newTestScenario.data as TestScenarioSnapshotDto;
          matches("TestScenarioSnapshotDto", testScenario);
          assert.equal(testScenario.sourceTemplateRevision, 2);
          const savedTestScenario = await sdk.updateTestScenarioContent({
            baseUrl: base,
            path: { projectId: value.id, testScenarioId: testScenario.id },
            body: {
              expectedRevision: 1,
              columns: testScenario.columns,
              cases: [
                {
                  id: randomUUID(),
                  caseCode: "",
                  title: "=문자열",

                  relatedFrameIds: [],
                  screenIds: [],
                  customValues: {},
                },
              ],
            },
            throwOnError: true,
          });
          const saved = savedTestScenario.data as TestScenarioSnapshotDto;
          assert.equal(saved.contentRevision, 2);
          assert.equal(saved.cases[0].caseCode, "TC-001");
          const viewed = await sdk.updateTestScenarioView({
            baseUrl: base,
            path: { projectId: value.id, testScenarioId: testScenario.id },
            body: { expectedRevision: 1, columns: [...saved.view].reverse() },
            throwOnError: true,
          });
          const finalTestScenario = viewed.data as TestScenarioSnapshotDto;
          assert.equal(finalTestScenario.viewRevision, 2);
          const readTestScenario = await sdk.getTestScenario({
            baseUrl: base,
            path: { projectId: value.id, testScenarioId: testScenario.id },
            throwOnError: true,
          });
          assert.deepEqual(readTestScenario.data, finalTestScenario);
          const testScenarioList = await sdk.listTestScenarios({
            baseUrl: base,
            path: { projectId: value.id },
            throwOnError: true,
          });
          assert.equal(
            (testScenarioList.data as TestScenarioPageDto).items[0].id,
            testScenario.id,
          );
          const xlsx = await sdk.exportTestScenarioXlsx({
            baseUrl: base,
            path: { projectId: value.id, testScenarioId: testScenario.id },
            query: { contentRevision: 2, viewRevision: 2 },
            parseAs: "blob",
            throwOnError: true,
          });
          assert.equal(xlsx.response.status, 200);
          assert.ok(xlsx.data instanceof Blob);
          assert.equal(
            Buffer.from(await xlsx.data.arrayBuffer())
              .subarray(0, 2)
              .toString(),
            "PK",
          );
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
    try {
      await closeApp();
    } finally {
      await lease.close();
    }
  }
});
