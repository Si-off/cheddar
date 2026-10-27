import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalStorage } from "../src/storage/local-storage";

test("프로젝트 없이 임시 업로드 UUID 경로에 저장하고 경로 이탈을 거부", async () => {
  const root = await mkdtemp(join(tmpdir(), "app-storage-"));
  const storage = new LocalStorage({
    databaseUrl: "",
    storageRoot: root,
    port: 3101,
    host: "127.0.0.1",
    corsOrigins: [],
  });
  try {
    await storage.initialize();
    const uploadId = randomUUID(),
      fileId = randomUUID();
    await storage.stage(fileId, Buffer.from("화면 자료"));
    await storage.publish(uploadId, fileId);
    const handle = await storage.open(`${uploadId}/${fileId}`);
    try {
      assert.equal(await handle.readFile("utf8"), "화면 자료");
    } finally {
      await handle.close();
    }
    await assert.rejects(storage.open("../outside"));
    await assert.rejects(storage.publish("../outside", fileId));
    await assert.rejects(storage.open(`${uploadId}/${fileId}/extra`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
