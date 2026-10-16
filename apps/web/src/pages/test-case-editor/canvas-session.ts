import { createStore } from "zustand/vanilla";
import { type CaseDraft, equal, type Snapshot } from "@/entities/test-case";
import type {
  CanvasLayoutDto,
  CanvasSnapshotDto,
  FlowDocumentDto,
  FlowGenerationDto,
} from "@/shared/api/generated";
import {
  getScenarioCanvas,
  listScenarioFlowGenerations,
  replaceScenarioFlow,
  restoreScenarioFlow,
  saveScenarioCanvasLayout,
  saveScenarioFlow,
  startScenarioFlowGeneration,
} from "@/shared/api/generated/sdk.gen";

export type Flow = FlowDocumentDto;
export type Layout = CanvasLayoutDto;
export type CanvasGuard = {
  settle: () => Promise<boolean>;
  retain: () => Promise<boolean>;
  dirty: () => boolean;
  recordCases: (before: CaseDraft[], after: CaseDraft[]) => void;
  additionalReferences: (ids: Set<string>, saved: Flow) => number;
};
export async function canvasReferenceCount(
  projectId: string,
  testScenarioId: string,
  ids: Set<string>,
  guard: CanvasGuard | null,
) {
  const canvas = await result(
    getScenarioCanvas({ path: { projectId, testScenarioId } }),
  );
  return {
    saved: canvas.flow.steps.filter((step) =>
      step.caseIds.some((id) => ids.has(id)),
    ).length,
    additional: guard?.additionalReferences(ids, canvas.flow) ?? 0,
  };
}
type Value = Pick<CanvasSnapshotDto, "flow" | "layout">;
type History =
  | { kind: "canvas"; before: Value; after: Value }
  | { kind: "cases"; before: CaseDraft[]; after: CaseDraft[] };
type Draft = { base: CanvasSnapshotDto; value: Value; review: Review | null };
export type Review = {
  flow: Flow;
  layout: Layout;
  job: FlowGenerationDto;
  base: CanvasSnapshotDto;
  contentRevision: number;
};
type State = {
  base?: CanvasSnapshotDto;
  value?: Value;
  status: { flow: string; layout: string };
  error?: string;
  loading: boolean;
  recovery?: Draft;
  review: Review | null;
  undo: number;
  redo: number;
};
async function result<T>(
  request: Promise<{ data?: T; error?: unknown; response?: Response }>,
): Promise<T> {
  const response = await request;
  if (response.error || response.data === undefined) {
    const body = response.error as { error?: { message?: string } } | undefined;
    throw Object.assign(
      new Error(
        body?.error?.message ?? "저장하지 못했습니다. 다시 시도해주세요.",
      ),
      { status: response.response?.status },
    );
  }
  return response.data;
}
export class CanvasSession implements CanvasGuard {
  readonly store = createStore<State>(() => ({
    status: { flow: "", layout: "" },
    loading: true,
    review: null,
    undo: 0,
    redo: 0,
  }));
  private past: History[] = [];
  private future: History[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: Promise<boolean>;
  private disposed = false;
  private readonly key: string;
  private readonly path: { projectId: string; testScenarioId: string };
  constructor(
    private readonly content: () => Snapshot,
    private readonly settleCases: () => Promise<boolean>,
    private readonly editCases: (cases: CaseDraft[]) => void,
    origin: string,
    private readonly liveContent: () => Snapshot = content,
  ) {
    const s = content();
    this.path = { projectId: s.projectId, testScenarioId: s.id };
    this.key = `cheddar:canvas:${origin}:${s.projectId}:${s.id}`;
  }
  async load() {
    this.disposed = false;
    try {
      const base = await result(getScenarioCanvas({ path: this.path }));
      let recovery: Draft | undefined;
      try {
        const raw = localStorage.getItem(this.key);
        if (raw) {
          const draft = JSON.parse(raw) as Draft;
          if (
            draft.base &&
            draft.value &&
            (!equal(draft.value, { flow: base.flow, layout: base.layout }) ||
              draft.review)
          )
            recovery = draft;
        }
      } catch {
        /* Persistence failure is reported when retaining changes. */
      }
      if (!this.disposed)
        this.store.setState({
          base,
          value: { flow: base.flow, layout: base.layout },
          loading: false,
          recovery,
          error: undefined,
        });
    } catch (e) {
      if (!this.disposed)
        this.store.setState({ loading: false, error: (e as Error).message });
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    void this.retain();
  }
  dirty = () => {
    const s = this.store.getState();
    return (
      !!s.review ||
      !!s.recovery ||
      (!!s.base &&
        !!s.value &&
        (!equal(s.base.flow, s.value.flow) ||
          !equal(s.base.layout, s.value.layout)))
    );
  };
  additionalReferences = (ids: Set<string>, saved: Flow) => {
    const stored = new Map(
      saved.steps.map((step) => [step.id, new Set(step.caseIds)]),
    );
    return (
      this.store
        .getState()
        .value?.flow.steps.filter((step) =>
          step.caseIds.some(
            (id) => ids.has(id) && !stored.get(step.id)?.has(id),
          ),
        ).length ?? 0
    );
  };
  retain = async () => {
    const s = this.store.getState();
    if (!s.base || !s.value || s.recovery) return !this.dirty() || !!s.recovery;
    try {
      if (this.dirty())
        localStorage.setItem(
          this.key,
          JSON.stringify({
            base: s.base,
            value: s.value,
            review: s.review,
          } satisfies Draft),
        );
      else localStorage.removeItem(this.key);
      return true;
    } catch {
      this.store.setState({
        error:
          "이 브라우저에 초안을 보관하지 못했습니다. 페이지를 닫기 전에 다시 저장해주세요.",
      });
      return false;
    }
  };
  recover(use: boolean) {
    const s = this.store.getState();
    if (!s.recovery) return;
    const draft = s.recovery;
    this.store.setState({
      recovery: undefined,
      ...(use
        ? { base: draft.base, value: draft.value, review: draft.review }
        : {}),
      error: undefined,
    });
    if (use) this.schedule();
    else void this.retain();
  }
  private history(h: History) {
    this.past.push(h);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
    this.counts();
  }
  private counts() {
    this.store.setState({ undo: this.past.length, redo: this.future.length });
  }
  recordCases = (before: CaseDraft[], after: CaseDraft[]) => {
    if (!equal(before, after))
      this.history({
        kind: "cases",
        before: structuredClone(before),
        after: structuredClone(after),
      });
  };
  edit(value: Value) {
    const s = this.store.getState();
    if (!s.value || s.recovery) return;
    if (s.review) {
      if (equal({ flow: s.review.flow, layout: s.review.layout }, value))
        return;
      this.history({
        kind: "canvas",
        before: { flow: s.review.flow, layout: s.review.layout },
        after: value,
      });
      this.store.setState({ review: { ...s.review, ...value } });
      void this.retain();
      return;
    }
    if (equal(s.value, value)) return;
    this.history({ kind: "canvas", before: s.value, after: value });
    this.store.setState({ value, error: undefined });
    this.schedule();
  }
  undo(redo = false) {
    const source = redo ? this.future : this.past;
    const h = source.at(-1);
    if (!h) return;
    const target = redo ? h.after : h.before;
    const expected = redo ? h.before : h.after;
    if (h.kind === "cases") {
      const current = this.liveContent().cases;
      // Refuse a stale history entry instead of overwriting another edit.
      if (!equal(current, expected)) {
        this.store.setState({
          error: "테스트 케이스가 변경되어 이 작업을 되돌릴 수 없습니다.",
        });
        return;
      }
      this.editCases(structuredClone(target as CaseDraft[]));
    } else {
      const state = this.store.getState();
      const active = state.review
        ? { flow: state.review.flow, layout: state.review.layout }
        : state.value;
      if (!equal(active, expected)) {
        this.store.setState({
          error: "흐름이나 배치가 변경되어 이 작업을 되돌릴 수 없습니다.",
        });
        return;
      }
      const value = target as Value;
      const ids = new Set(this.content().cases.map((c) => c.id));
      if (value.flow.steps.some((s) => s.caseIds.some((id) => !ids.has(id)))) {
        this.store.setState({
          error:
            "삭제된 테스트 케이스가 연결되어 이 작업을 되돌릴 수 없습니다.",
        });
        return;
      }
      const review = this.store.getState().review;
      if (review) {
        this.store.setState({
          review: { ...review, ...structuredClone(value) },
        });
        void this.retain();
      } else {
        this.store.setState({ value: structuredClone(value) });
        this.schedule();
      }
    }
    source.pop();
    (redo ? this.past : this.future).push(h);
    this.counts();
  }
  private schedule() {
    clearTimeout(this.timer);
    void this.retain();
    this.timer = setTimeout(() => {
      void this.save();
    }, 700);
  }
  settle = async () => {
    clearTimeout(this.timer);
    const ok = await this.save();
    return (
      ok && !this.store.getState().review && !this.store.getState().recovery
    );
  };
  async save(): Promise<boolean> {
    if (this.pending) {
      await this.pending;
      return this.save();
    }
    const s = this.store.getState();
    if (!s.base || !s.value || s.recovery) return !this.dirty();
    if (
      equal(s.base.flow, s.value.flow) &&
      equal(s.base.layout, s.value.layout)
    )
      return true;
    this.pending = this.flush();
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  private async flush() {
    this.store.setState({ error: undefined });
    let success = true;
    for (const field of ["flow", "layout"] as const) {
      let s = this.store.getState();
      if (!s.base || !s.value || equal(s.base[field], s.value[field])) continue;
      this.store.setState({ status: { ...s.status, [field]: "저장 중" } });
      try {
        if (!(await this.settleCases()))
          throw new Error("테스트 케이스를 저장한 뒤 다시 저장해주세요.");
        await this.refresh(true);
        s = this.store.getState();
        if (!s.base || !s.value) continue;
        if (equal(s.base[field], s.value[field])) {
          this.store.setState({
            status: { ...s.status, [field]: "저장 완료" },
          });
          continue;
        }
        const sent = s.value[field];
        const saved =
          field === "flow"
            ? await result(
                saveScenarioFlow({
                  path: this.path,
                  body: {
                    flow: sent as Flow,
                    expectedRevision: s.base.flowRevision,
                    contentRevision: this.content().contentRevision,
                  },
                }),
              )
            : await result(
                saveScenarioCanvasLayout({
                  path: this.path,
                  body: {
                    layout: sent as Layout,
                    expectedRevision: s.base.layoutRevision,
                  },
                }),
              );
        const latest = this.store.getState();
        if (!latest.base || !latest.value) continue;
        this.store.setState({
          base: {
            ...latest.base,
            [field]: saved[field],
            [`${field}Revision`]: saved[`${field}Revision`],
          },
          value: equal(latest.value[field], sent)
            ? { ...latest.value, [field]: saved[field] }
            : latest.value,
          status: { ...latest.status, [field]: "저장 완료" },
        });
      } catch (e) {
        success = false;
        const error = e as Error & { status?: number };
        this.store.setState({
          error: error.message,
          status: {
            ...this.store.getState().status,
            [field]: error.status === 409 ? "변경 충돌" : "저장 실패",
          },
        });
      }
    }
    await this.retain();
    return success;
  }
  async reload() {
    if (this.pending) await this.pending;
    clearTimeout(this.timer);
    const base = await result(getScenarioCanvas({ path: this.path }));
    this.past = [];
    this.future = [];
    this.store.setState({
      base,
      value: { flow: base.flow, layout: base.layout },
      error: undefined,
      status: { flow: "", layout: "" },
      undo: 0,
      redo: 0,
      recovery: undefined,
      review: null,
    });
    await this.retain();
  }
  async refresh(duringSave = false) {
    if (!this.store.getState().base || (this.pending && !duringSave)) return;
    const remote = await result(getScenarioCanvas({ path: this.path }));
    const s = this.store.getState();
    if (!s.base || !s.value || s.recovery) return;
    const cases = new Set(this.content().cases.map((c) => c.id));
    const columns = new Set(this.content().columns.map((c) => c.id));
    const pruneFlow = (flow: Flow): Flow => ({
      ...flow,
      steps: flow.steps.map((step) => ({
        ...step,
        caseIds: step.caseIds.filter((id) => cases.has(id)),
      })),
    });
    const pruneLayout = (layout: Layout): Layout => ({
      ...layout,
      groupBy:
        layout.groupBy && !columns.has(layout.groupBy) ? null : layout.groupBy,
    });
    const value = { ...s.value };
    const base = { ...s.base, previous: remote.previous };
    for (const field of ["flow", "layout"] as const) {
      const clean =
        equal(s.value[field], s.base[field]) ||
        equal(s.value[field], remote[field]);
      const expected =
        field === "flow" ? pruneFlow(s.base.flow) : pruneLayout(s.base.layout);
      if (!clean && !equal(remote[field], expected)) continue;
      if (field === "flow") {
        base.flow = remote.flow;
        base.flowRevision = remote.flowRevision;
        value.flow = clean ? remote.flow : pruneFlow(value.flow);
      } else {
        base.layout = remote.layout;
        base.layoutRevision = remote.layoutRevision;
        value.layout = clean ? remote.layout : pruneLayout(value.layout);
      }
    }
    this.store.setState({ base, value });
  }
  jobs() {
    return result(listScenarioFlowGenerations({ path: this.path }));
  }
  async generate(
    provider: "anthropic" | "openai",
    description: string,
    clientRequestId: string,
  ) {
    if (!(await this.settle()) || !(await this.settleCases()))
      throw new Error("변경 내용을 저장한 뒤 다시 시도해주세요.");
    return result(
      startScenarioFlowGeneration({
        path: this.path,
        body: {
          provider,
          description,
          clientRequestId,
          contentRevision: this.content().contentRevision,
        },
      }),
    );
  }
  async review(job: FlowGenerationDto) {
    if (!job.result || !(await this.settle())) return;
    const s = this.store.getState();
    if (!s.base) return;
    if (
      s.base.flowRevision !== job.flowRevision ||
      s.base.layoutRevision !== job.layoutRevision ||
      this.content().contentRevision !== job.contentRevision
    )
      throw new Error(
        "생성 이후 내용이 변경되었습니다. 최신 내용으로 다시 생성해주세요.",
      );
    this.past = [];
    this.future = [];
    this.counts();
    this.store.setState({
      review: {
        flow: structuredClone(job.result),
        layout: {
          ...s.base.layout,
          positions: s.base.layout.positions.filter(
            (p) => !p.id.startsWith("f:"),
          ),
        },
        job,
        base: s.base,
        contentRevision: job.contentRevision,
      },
    });
    await this.retain();
  }
  cancelReview() {
    this.past = [];
    this.future = [];
    this.counts();
    this.store.setState({ review: null });
    void this.retain();
  }
  async applyReview() {
    const r = this.store.getState().review;
    if (!r || !(await this.settleCases())) return;
    const base = await result(
      replaceScenarioFlow({
        path: this.path,
        body: {
          flow: r.flow,
          layout: r.layout,
          flowRevision: r.base.flowRevision,
          layoutRevision: r.base.layoutRevision,
          contentRevision: r.contentRevision,
          jobId: r.job.id,
        },
      }),
    );
    this.store.setState({
      base,
      value: { flow: base.flow, layout: base.layout },
      review: null,
    });
    this.past = [];
    this.future = [];
    this.counts();
    await this.retain();
  }
  async restore() {
    const s = this.store.getState();
    if (!s.base?.previous || !(await this.settle())) return;
    const base = await result(
      restoreScenarioFlow({
        path: this.path,
        body: {
          backupId: s.base.previous.id,
          flowRevision: s.base.flowRevision,
          layoutRevision: s.base.layoutRevision,
          contentRevision: this.content().contentRevision,
        },
      }),
    );
    this.store.setState({
      base,
      value: { flow: base.flow, layout: base.layout },
    });
    this.past = [];
    this.future = [];
    this.counts();
    await this.retain();
  }
}
