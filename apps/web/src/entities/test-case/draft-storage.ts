import type { Snapshot } from "./model";

export type StoredDraft = {
  key: string;
  origin: string;
  projectId: string;
  testScenarioId: string;
  sessionId: string;
  base: Snapshot;
  draft: Snapshot;
  version: number;
  updatedAt: number;
};
let database: Promise<IDBDatabase> | undefined;
function open() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("cheddar-test-scenario-drafts", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("drafts", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      database = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      database = undefined;
      reject(new Error("브라우저 초안 저장소를 열지 못했습니다."));
    };
  });
  return database;
}
export async function storeDraft(record: StoredDraft) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    tx.objectStore("drafts").put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function clearDraft(key: string, upTo = Number.POSITIVE_INFINITY) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const request = store.get(key);
    request.onsuccess = () => {
      const value = request.result as StoredDraft | undefined;
      if (value && value.version <= upTo) store.delete(key);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
export async function listDrafts(
  origin: string,
  projectId: string,
  testScenarioId: string,
) {
  const db = await open();
  return new Promise<StoredDraft[]>((resolve, reject) => {
    const tx = db.transaction("drafts", "readonly");
    const request = tx.objectStore("drafts").getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as StoredDraft[])
          .filter(
            (r) =>
              r.origin === origin &&
              r.projectId === projectId &&
              r.testScenarioId === testScenarioId,
          )
          .sort((a, b) => b.updatedAt - a.updatedAt),
      );
    request.onerror = () => reject(request.error);
  });
}
