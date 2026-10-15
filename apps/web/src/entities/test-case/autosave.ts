import { createStore } from "zustand/vanilla";
import { clearDraft, type StoredDraft, storeDraft } from "./draft-storage";
import { content, equal, type Snapshot, validate } from "./model";

export type SaveTransport = {
  get: () => Promise<Snapshot>;
  content: (
    body: ReturnType<typeof content> & { expectedRevision: number },
  ) => Promise<Snapshot>;
  view: (body: {
    columns: Snapshot["view"];
    expectedRevision: number;
  }) => Promise<Snapshot>;
};
export class SaveError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}
export type EditorState = {
  base: Snapshot;
  draft: Snapshot;
  version: number;
  status: "saved" | "dirty" | "saving" | "error" | "conflict" | "invalid";
  message?: string;
  latest?: Snapshot;
  backup?: Snapshot;
  storageError?: string;
};
function projectView(view: Snapshot["view"], columns: Snapshot["columns"]) {
  const retained = view.filter((v) => columns.some((c) => c.id === v.columnId));
  return [
    ...retained,
    ...columns
      .filter((c) => !retained.some((v) => v.columnId === c.id))
      .map((c) => ({ columnId: c.id, width: 180 })),
  ];
}
function mergeAcknowledgement(
  server: Snapshot,
  sent: Snapshot,
  current: Snapshot,
  base: Snapshot,
  kind: "content" | "view",
): Snapshot | undefined {
  const structureChanged = !equal(
    base.columns.map((c) => c.id).sort(),
    sent.columns.map((c) => c.id).sort(),
  );
  const remoteContent =
    kind === "view" && server.contentRevision !== base.contentRevision;
  const remoteView =
    kind === "content" &&
    server.viewRevision !== base.viewRevision + (structureChanged ? 1 : 0);
  const localContent = !equal(content(current), content(base));
  const localView = !equal(
    current.view,
    projectView(base.view, current.columns),
  );
  // An independently revised domain must never become a new overwrite base
  // for stale local rows, columns or display order.
  if ((remoteContent && localContent) || (remoteView && localView)) return;
  const cases = remoteContent
    ? server.cases
    : current.cases.map((item) => {
        const previous = sent.cases.find((c) => c.id === item.id),
          saved = server.cases.find((c) => c.id === item.id);
        if (!previous || !saved) return item;
        return Object.fromEntries(
          Object.entries(item).map(([key, value]) => [
            key,
            equal(value, previous[key as keyof typeof previous])
              ? saved[key as keyof typeof saved]
              : value,
          ]),
        ) as typeof item;
      });
  const columns = remoteContent
    ? server.columns
    : current.columns.map((column) => {
        const previous = sent.columns.find((c) => c.id === column.id),
          saved = server.columns.find((c) => c.id === column.id);
        return previous && saved && equal(column, previous) ? saved : column;
      });
  const view = projectView(
    kind === "content" && !localView ? server.view : current.view,
    columns,
  );
  return {
    ...server,
    cases,
    columns,
    view,
    references: {
      frames: [
        ...new Map(
          [...current.references.frames, ...server.references.frames].map(
            (f) => [f.id, f],
          ),
        ).values(),
      ],
      iaItems: [
        ...new Map(
          [...current.references.iaItems, ...server.references.iaItems].map(
            (i) => [i.id, i],
          ),
        ).values(),
      ],
    },
  };
}
export class SheetSession {
  readonly store;
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private composing = false;
  private key: string;
  private sessionId: string = crypto.randomUUID();
  private disposed = false;
  private storageAttempt = 0;
  private epoch = 0;
  private persistence?: Promise<void>;
  private stored?: { key: string; version: number };
  private pending?: {
    kind: "content" | "view";
    base: Snapshot;
    sent: Snapshot;
    version: number;
  };
  constructor(
    snapshot: Snapshot,
    private readonly transport: SaveTransport,
    private readonly origin: string,
  ) {
    this.store = createStore<EditorState>(() => ({
      base: snapshot,
      draft: structuredClone(snapshot),
      version: 0,
      status: "saved",
    }));
    this.key = this.makeKey(snapshot);
  }
  private makeKey(snapshot: Snapshot) {
    return `${this.origin}/${snapshot.projectId}/${snapshot.id}/${this.sessionId}`;
  }
  private dirty(base: Snapshot, draft: Snapshot) {
    return (
      !equal(content(base), content(draft)) || !equal(base.view, draft.view)
    );
  }
  private persist() {
    const state = this.store.getState();
    const record: StoredDraft = {
      key: this.key,
      origin: this.origin,
      projectId: state.draft.projectId,
      sheetId: state.draft.id,
      sessionId: this.sessionId,
      base: state.base,
      draft: state.draft,
      version: state.version,
      updatedAt: Date.now(),
    };
    const attempt = ++this.storageAttempt;
    this.persistence = storeDraft(record)
      .then(() => {
        if (attempt === this.storageAttempt && record.key === this.key) {
          this.stored = { key: record.key, version: record.version };
          this.store.setState({ storageError: undefined });
        }
      })
      .catch(() => {
        if (attempt === this.storageAttempt && record.key === this.key)
          this.store.setState({
            storageError:
              "브라우저에 초안을 보관하지 못했습니다. 이 화면을 닫으면 미저장 입력을 잃을 수 있습니다.",
          });
      });
  }
  edit(change: (draft: Snapshot) => Snapshot) {
    const state = this.store.getState();
    const draft = change(state.draft);
    this.store.setState({
      draft,
      version: state.version + 1,
      status:
        state.status === "conflict" || state.status === "error"
          ? state.status
          : "dirty",
      message:
        state.status === "conflict" || state.status === "error"
          ? state.message
          : undefined,
    });
    this.persist();
    this.schedule();
  }
  composition(active: boolean) {
    this.composing = active;
    clearTimeout(this.timer);
    if (!active) this.schedule();
  }
  private schedule() {
    clearTimeout(this.timer);
    const { status } = this.store.getState();
    if (
      !this.disposed &&
      !this.composing &&
      status !== "conflict" &&
      status !== "error"
    )
      this.timer = setTimeout(() => {
        void this.flush();
      }, 500);
  }
  private acknowledge(
    server: Snapshot,
    sent: Snapshot,
    version: number,
    base: Snapshot,
    kind: "content" | "view",
  ) {
    const current = this.store.getState();
    const draft = mergeAcknowledgement(server, sent, current.draft, base, kind);
    if (!draft) {
      this.store.setState({
        status: "conflict",
        latest: server,
        message:
          "다른 변경 사항이 저장되어 있습니다. 내 입력과 최신 내용을 확인해주세요.",
      });
      this.pending = undefined;
      this.persist();
      return;
    }
    const dirty = this.dirty(server, draft);
    this.store.setState({
      base: server,
      draft,
      status: dirty ? "dirty" : "saved",
      message: undefined,
      latest: undefined,
    });
    void clearDraft(this.key, version).catch(() => {});
    if (dirty) this.persist();
    this.pending = undefined;
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.composing || this.disposed) return;
    if (this.running) {
      await this.running;
      if (this.store.getState().status === "dirty") return this.flush();
      return;
    }
    this.running = this.run();
    try {
      await this.running;
    } finally {
      this.running = undefined;
      if (this.store.getState().status === "dirty") this.schedule();
    }
  }
  private async run() {
    const epoch = this.epoch;
    while (!this.disposed && !this.composing && epoch === this.epoch) {
      const state = this.store.getState();
      if (state.status === "conflict" || state.status === "error") return;
      const message = validate(state.draft);
      if (message) {
        this.store.setState({ status: "invalid", message });
        return;
      }
      const kind = !equal(content(state.base), content(state.draft))
        ? "content"
        : !equal(state.base.view, state.draft.view)
          ? "view"
          : undefined;
      if (!kind) {
        this.store.setState({ status: "saved", message: undefined });
        void clearDraft(this.key, state.version).catch(() => {});
        return;
      }
      const sent = structuredClone(state.draft),
        version = state.version;
      this.pending = { kind, sent, version, base: state.base };
      this.store.setState({ status: "saving", message: undefined });
      try {
        const saved =
          kind === "content"
            ? await this.transport.content({
                ...content(sent),
                expectedRevision: state.base.contentRevision,
              })
            : await this.transport.view({
                columns: sent.view,
                expectedRevision: state.base.viewRevision,
              });
        if (epoch !== this.epoch) return;
        this.acknowledge(saved, sent, version, state.base, kind);
      } catch (error) {
        if (epoch !== this.epoch) return;
        const isConflict = error instanceof SaveError && error.status === 409;
        const message =
          error instanceof SaveError
            ? error.message
            : "저장 결과를 확인하지 못했습니다. 입력은 유지됩니다.";
        this.store.setState({
          status: isConflict ? "conflict" : "error",
          message,
        });
        this.persist();
        if (
          !(error instanceof SaveError) ||
          error.status === undefined ||
          error.status >= 500 ||
          isConflict
        )
          await this.checkResult();
        return;
      }
    }
  }
  private async checkResult() {
    const epoch = this.epoch;
    try {
      const latest = await this.transport.get();
      if (epoch !== this.epoch) return;
      const { base } = this.store.getState();
      const pending = this.pending;
      if (pending) {
        const matches =
          pending.kind === "content"
            ? latest.contentRevision === base.contentRevision + 1 &&
              equal(content(latest), content(pending.sent))
            : latest.viewRevision === base.viewRevision + 1 &&
              equal(latest.view, pending.sent.view) &&
              latest.contentRevision === base.contentRevision;
        if (matches) {
          this.acknowledge(
            latest,
            pending.sent,
            pending.version,
            pending.base,
            pending.kind,
          );
          return;
        }
      }
      const changed =
        latest.contentRevision !== base.contentRevision ||
        latest.viewRevision !== base.viewRevision;
      this.store.setState(
        changed
          ? {
              status: "conflict",
              latest,
              message:
                "다른 변경 사항이 저장되어 있습니다. 내 입력과 최신 내용을 확인해주세요.",
            }
          : { latest },
      );
    } catch {
      /* Retain the draft and error if even the outcome lookup fails. */
    }
  }
  async retry() {
    await this.checkResult();
    const state = this.store.getState();
    if (state.status === "conflict") return;
    if (
      state.latest &&
      state.latest.contentRevision === state.base.contentRevision &&
      state.latest.viewRevision === state.base.viewRevision
    )
      this.store.setState({ status: "dirty", message: undefined });
    if (
      this.store.getState().status === "saved" ||
      this.store.getState().status === "dirty"
    )
      await this.flush();
  }
  async refreshSaved() {
    const before = this.store.getState();
    if (before.status !== "saved") return false;
    const epoch = this.epoch;
    const latest = await this.transport.get();
    const current = this.store.getState();
    if (
      epoch !== this.epoch ||
      current.version !== before.version ||
      current.status !== "saved"
    )
      return false;
    this.epoch++;
    this.store.setState({
      base: latest,
      draft: structuredClone(latest),
      latest: undefined,
      message: undefined,
    });
    return true;
  }
  async loadLatest() {
    const epoch = this.epoch;
    await this.running;
    const latest = await this.transport.get();
    if (epoch === this.epoch) this.store.setState({ latest });
  }
  startFromLatest() {
    const state = this.store.getState();
    if (!state.latest) return;
    this.epoch++;
    this.persist();
    this.sessionId = crypto.randomUUID();
    this.key = this.makeKey(state.latest);
    this.pending = undefined;
    this.store.setState({
      base: state.latest,
      draft: structuredClone(state.latest),
      status: "saved",
      version: 0,
      backup: state.draft,
      latest: undefined,
      message: undefined,
    });
  }
  restore(record: StoredDraft) {
    const inFlight = !!this.running;
    this.epoch++;
    this.pending = undefined;
    const previous = this.store.getState();
    const current = previous.base;
    const backup = this.dirty(previous.base, previous.draft)
      ? previous.draft
      : previous.backup;
    if (backup) this.persist();
    this.sessionId = record.sessionId;
    this.key = record.key;
    const conflict =
      inFlight ||
      record.base.contentRevision !== current.contentRevision ||
      record.base.viewRevision !== current.viewRevision;
    this.store.setState({
      base: record.base,
      draft: record.draft,
      backup,
      version: record.version,
      status: conflict ? "conflict" : "dirty",
      latest: conflict && !inFlight ? current : undefined,
      message: conflict
        ? "보관한 입력 이후 시트가 변경되었습니다. 최신 내용과 비교해주세요."
        : undefined,
    });
    if (!conflict) this.schedule();
  }
  async retain() {
    if (this.store.getState().status === "saved") return true;
    const version = this.store.getState().version;
    const key = this.key;
    this.persist();
    await this.persistence;
    return this.stored?.key === key && this.stored.version >= version;
  }
  async settle() {
    await this.flush();
    return this.store.getState().status === "saved";
  }
  activate() {
    this.disposed = false;
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
  }
}
