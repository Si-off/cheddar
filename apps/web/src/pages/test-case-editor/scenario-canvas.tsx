import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@cheddar/ui/legacy";
import {
  applyNodeChanges,
  Background,
  BaseEdge,
  type EdgeProps,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  type CaseDraft,
  displayValue,
  type Snapshot,
} from "@/entities/test-case";
import { CanvasGeneration } from "./canvas-generation";
import { CanvasInspector, stepKinds } from "./canvas-inspector";
import { autoLayout, canvasGroups, geometry } from "./canvas-layout";
import {
  type CanvasGuard,
  CanvasSession,
  type Flow,
  type Layout,
} from "./canvas-session";
import "@xyflow/react/dist/style.css";
import "./scenario-canvas.css";

type CardData = {
  snapshot: Snapshot;
  item: CaseDraft;
  onEdit: (id: string) => void;
  onSources: (id: string) => void;
  measure: (id: string, height: number) => void;
};
type GroupData = {
  title: string;
  description: string;
  count: number;
  flow: boolean;
  kind?: string;
  onEdit: () => void;
  measure: (id: string, height: number) => void;
};
type CanvasNode = Node<CardData, "case"> | Node<GroupData, "group">;
const CaseCard = memo(function CaseCard({
  id,
  data,
  selected,
}: NodeProps<Node<CardData, "case">>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      data.measure(id, el.offsetHeight),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, data.measure]);
  const { snapshot, item } = data;
  const label = `${item.caseCode || "ID 미지정"} ${item.title || "제목 없음"}`;
  const columnOrder = new Map(snapshot.view.map((v, i) => [v.columnId, i]));
  const columns = [...snapshot.columns].sort(
    (a, b) =>
      (columnOrder.get(a.id) ?? Infinity) - (columnOrder.get(b.id) ?? Infinity),
  );
  const references = [
    ...snapshot.references.frames
      .filter((f) => item.relatedFrameIds.includes(f.id))
      .map((f) => ({ id: f.id, name: f.name })),
    ...snapshot.references.iaItems
      .filter((s) => item.screenIds.includes(s.id))
      .map((s) => ({ id: s.id, name: `${s.screenId} ${s.name}` })),
  ];
  return (
    <article
      ref={ref}
      className={`canvas-case${selected ? " is-selected" : ""}`}
      aria-label={label}
    >
      <header className="canvas-drag">
        <span className="canvas-case-code">{item.caseCode || "ID 미지정"}</span>
        <h3>{item.title || "제목 없음"}</h3>
        <Button
          variant="ghost"
          className="nodrag"
          onClick={() => data.onEdit(item.id)}
          aria-label={`${item.caseCode || label} 편집`}
        >
          편집
        </Button>
      </header>
      <dl className="canvas-case-values nodrag nopan">
        {columns
          .filter((c) => c.kind === "custom")
          .map((column) => (
            <div
              key={column.id}
              className={
                column.valueType === "text" ? "canvas-field-long" : undefined
              }
            >
              <dt>{column.name}</dt>
              <dd>{displayValue(snapshot, item, column) || "—"}</dd>
            </div>
          ))}
      </dl>
      {!!(item.relatedFrameIds.length || item.screenIds.length) && (
        <footer className="nodrag nopan">
          <span>관련 자료</span>
          <div>
            {references.map(({ id, name }) => (
              <span key={id}>{name}</span>
            ))}
          </div>
          <Button variant="ghost" onClick={() => data.onSources(item.id)}>
            자료 열기
          </Button>
        </footer>
      )}
    </article>
  );
});
const GroupNode = memo(function GroupNode({
  data,
  id,
}: NodeProps<Node<GroupData, "group">>) {
  const header = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = header.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      data.measure(`header:${id}`, el.offsetHeight),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [data.measure, id]);
  return (
    <div className="canvas-group">
      {data.flow && <Handle type="target" position={Position.Left} />}
      <header ref={header} className="canvas-drag">
        <div>
          {data.kind && <span className="canvas-group-kind">{data.kind}</span>}
          <strong>{data.title}</strong>
          <span>{data.count}개</span>
        </div>
        {data.flow && (
          <Button className="nodrag" variant="ghost" onClick={data.onEdit}>
            단계 편집
          </Button>
        )}
        {data.description && <p className="nodrag nopan">{data.description}</p>}
      </header>
      {data.flow && <Handle type="source" position={Position.Right} />}
    </div>
  );
});
const nodeTypes = { case: CaseCard, group: GroupNode };
function RetryEdge(props: EdgeProps) {
  const { sourceX: sx, sourceY: sy, targetX: tx, targetY: ty } = props;
  const top = Math.min(sy, ty) - Number(props.data?.height ?? 160) / 2 - 100;
  const path = `M ${sx} ${sy} C ${sx + 100} ${sy}, ${sx + 100} ${top}, ${sx} ${top} L ${tx} ${top} C ${tx - 100} ${top}, ${tx - 100} ${ty}, ${tx} ${ty}`;
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      style={props.style}
      label={props.label}
      labelX={(sx + tx) / 2}
      labelY={top}
    />
  );
}
const edgeTypes = { retry: RetryEdge };
type Props = {
  active: boolean;
  snapshot: Snapshot;
  disabled: boolean;
  query: string;
  origin: string;
  onEdit: (id: string) => void;
  onSources: (id: string) => void;
  getSaved: () => Snapshot;
  settleCases: () => Promise<boolean>;
  onCases: (cases: CaseDraft[]) => void;
  onGuard: (guard: CanvasGuard | null) => void;
};
export function ScenarioCanvas(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  const [session] = useState(
    () =>
      new CanvasSession(
        () => latest.current.getSaved(),
        () => latest.current.settleCases(),
        (cases) => latest.current.onCases(cases),
        props.origin,
        () => latest.current.snapshot,
      ),
  );
  const s = useStore(session.store);
  const [mode, setMode] = useState<"groups" | "flow">("groups");
  const [instance, setInstance] = useState<ReactFlowInstance<CanvasNode>>();
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [stepId, setStepId] = useState<string>();
  const [edgeId, setEdgeId] = useState<string>();
  const [generating, setGenerating] = useState(false);
  const [current, setCurrent] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [aligning, setAligning] = useState(false);
  const [error, setError] = useState<string>();
  const [zoom, setZoom] = useState(1);
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    action: () => void;
  }>();
  const heights = useRef(new Map<string, number>());
  const [heightRevision, setHeightRevision] = useState(0);
  const measureTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const viewportKey = `cheddar:canvas-view:${props.origin}:${props.snapshot.projectId}:${props.snapshot.id}:${mode}`;
  const navigation = useMemo(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(viewportKey) ?? "{}");
      const v = saved.viewport;
      if (
        v &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.zoom) &&
        v.zoom > 0
      )
        return {
          viewport: v as Viewport,
          selected: Array.isArray(saved.selected)
            ? (saved.selected as string[])
            : [],
        };
    } catch {
      /* Missing or invalid navigation preferences use fit view. */
    }
    return { viewport: undefined, selected: [] as string[] };
  }, [viewportKey]);
  const measure = useCallback((id: string, height: number) => {
    if (heights.current.get(id) === height) return;
    heights.current.set(id, height);
    clearTimeout(measureTimer.current);
    measureTimer.current = setTimeout(
      () => setHeightRevision((v) => v + 1),
      80,
    );
  }, []);
  useEffect(() => {
    void session.load();
    props.onGuard(session);
    return () => {
      session.dispose();
      props.onGuard(null);
      clearTimeout(measureTimer.current);
    };
  }, [session, props.onGuard]);
  useEffect(() => {
    void props.snapshot.contentRevision;
    void session.refresh().catch((e) => setError(e.message));
  }, [session, props.snapshot.contentRevision]);
  const value =
    restoring && !current && s.base?.previous
      ? s.base.previous
      : s.review && !current
        ? s.review
        : s.value;
  const disabled =
    props.disabled || !!s.recovery || (current && !!s.review) || restoring;
  const snapshot = props.snapshot;
  const groups = useMemo(
    () => (value ? canvasGroups(snapshot, value.flow, value.layout, mode) : []),
    [snapshot, value, mode],
  );
  const boxes = useMemo(() => {
    void heightRevision;
    return value
      ? geometry(groups, snapshot, value.layout, heights.current)
      : [];
  }, [groups, snapshot, value, heightRevision]);
  useEffect(() => {
    const cases = new Map(snapshot.cases.map((c) => [c.id, c]));
    const groupMap = new Map(groups.map((g) => [g.id, g]));
    setNodes((old) => {
      const selected = new Set(old.filter((n) => n.selected).map((n) => n.id));
      return boxes.flatMap((box): CanvasNode[] => {
        const common = {
          id: box.id,
          position: { x: box.x, y: box.y },
          selected: selected.has(box.id),
          draggable: !disabled,
          dragHandle: ".canvas-drag",
        };
        if (box.parentId) {
          const item = cases.get(
            box.id.slice(box.id.lastIndexOf(":case:") + 6),
          );
          if (!item) return [];
          const matches =
            !props.query ||
            snapshot.columns.some((c) =>
              displayValue(snapshot, item, c)
                .toLowerCase()
                .includes(props.query.toLowerCase()),
            );
          return [
            {
              ...common,
              type: "case",
              parentId: box.parentId,
              extent: "parent",
              width: box.width,
              style: { width: box.width, opacity: matches ? 1 : 0.25 },
              data: {
                snapshot,
                item,
                onEdit: props.onEdit,
                onSources: props.onSources,
                measure,
              },
            },
          ];
        }
        const group = groupMap.get(box.id);
        if (!group) return [];
        const step = value?.flow.steps.find((s) => s.id === group.stepId);
        return [
          {
            ...common,
            type: "group",
            width: box.width,
            height: box.height,
            style: { width: box.width, height: box.height },
            data: {
              title: group.title,
              description: group.description,
              count: group.caseIds.filter((id) => cases.has(id)).length,
              measure,
              flow: mode === "flow",
              kind: step ? stepKinds[step.kind] : undefined,
              onEdit: () => {
                setStepId(group.stepId);
                setEdgeId(undefined);
                setGenerating(false);
              },
            },
          },
        ];
      });
    });
  }, [
    boxes,
    snapshot,
    groups,
    props.query,
    props.onEdit,
    props.onSources,
    measure,
    mode,
    disabled,
    value,
  ]);
  const edges = useMemo(
    () =>
      mode === "flow" && value
        ? value.flow.edges.map((e) => ({
            id: e.id,
            source: `f:${e.from}`,
            target: `f:${e.to}`,
            label: e.condition,
            markerEnd: { type: MarkerType.ArrowClosed },
            selected: edgeId === e.id,
            type: e.from === e.to ? "retry" : "smoothstep",
            data: { height: boxes.find((n) => n.id === `f:${e.from}`)?.height },
          }))
        : [],
    [mode, value, edgeId, boxes],
  );
  function edit(flow: Flow, layout = value?.layout) {
    if (value && layout && !disabled) session.edit({ flow, layout });
  }
  function layout(next: Layout) {
    if (value) edit(value.flow, next);
  }
  function positions(next: CanvasNode[]) {
    if (!value) return;
    const moved = new Map(next.map((n) => [n.id, { id: n.id, ...n.position }]));
    layout({
      ...value.layout,
      positions: [
        ...value.layout.positions.filter((p) => !moved.has(p.id)),
        ...moved.values(),
      ],
    });
  }
  function saveViewport(viewport: Viewport) {
    setZoom(viewport.zoom);
    try {
      localStorage.setItem(
        viewportKey,
        JSON.stringify({
          viewport,
          selected: nodes.filter((n) => n.selected).map((n) => n.id),
        }),
      );
    } catch {
      /* Local navigation preferences are optional. */
    }
  }
  useEffect(() => {
    if (!instance || !props.active) return;
    const timer = setTimeout(() => {
      if (navigation.viewport) {
        void instance.setViewport(navigation.viewport);
        setZoom(navigation.viewport.zoom);
        setNodes((old) =>
          old.map((node) => ({
            ...node,
            selected: navigation.selected.includes(node.id),
          })),
        );
      } else void instance.fitView({ padding: 0.08 });
    }, 100);
    return () => clearTimeout(timer);
  }, [instance, navigation, props.active]);
  async function arrange() {
    if (!value) return;
    setAligning(true);
    setError(undefined);
    try {
      layout(
        await autoLayout(
          groups,
          snapshot,
          value.flow,
          value.layout,
          heights.current,
          mode,
        ),
      );
    } catch {
      setError("자동 정렬하지 못했습니다. 다시 시도해주세요.");
    } finally {
      setAligning(false);
    }
  }
  function align(kind: "left" | "gap") {
    const selected = nodes.filter((n) => n.selected);
    if (selected.length < 2) return;
    const parents = new Set(selected.map((n) => n.parentId));
    if (parents.size !== 1) {
      setError("같은 묶음의 카드 또는 묶음끼리 선택해주세요.");
      return;
    }
    const sorted = [...selected].sort((a, b) => a.position.y - b.position.y);
    const x = Math.min(...sorted.map((n) => n.position.x));
    let y = sorted[0].position.y;
    const updated = new Map(
      sorted.map((n) => {
        const position =
          kind === "left" ? { ...n.position, x } : { ...n.position, y };
        y += (n.measured?.height ?? n.height ?? 300) + 32;
        return [n.id, { ...n, position }] as const;
      }),
    );
    positions(nodes.map((n) => updated.get(n.id) ?? n));
  }
  function addStep() {
    if (!value) return;
    const id = crypto.randomUUID();
    edit({
      ...value.flow,
      steps: [
        ...value.flow.steps,
        { id, title: "새 단계", kind: "action", description: "", caseIds: [] },
      ],
    });
    setStepId(id);
    setEdgeId(undefined);
    setGenerating(false);
  }
  function addEdge() {
    if (!value?.flow.steps.length) return;
    const id = crypto.randomUUID();
    edit({
      ...value.flow,
      edges: [
        ...value.flow.edges,
        {
          id,
          from: value.flow.steps[0].id,
          to: (value.flow.steps[1] ?? value.flow.steps[0]).id,
          condition: "",
        },
      ],
    });
    setEdgeId(id);
    setStepId(undefined);
  }
  const ask = (title: string, description: string, action: () => void) =>
    setConfirm({ title, description, action });
  const act = async (run: () => Promise<unknown>) => {
    try {
      setError(undefined);
      await run();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!props.active) return null;
  if (s.loading) return <p role="status">캔버스 불러오는 중</p>;
  if (!value)
    return (
      <div role="alert">
        {s.error}
        <Button onClick={() => void session.load()}>다시 불러오기</Button>
      </div>
    );
  const selectedCount = nodes.filter((n) => n.selected).length;
  const missing = s.base?.previous
    ? [
        ...new Set(s.base.previous.flow.steps.flatMap((step) => step.caseIds)),
      ].filter((id) => !snapshot.cases.some((c) => c.id === id))
    : [];
  return (
    <section className="scenario-canvas" aria-label="테스트 시나리오 캔버스">
      {s.recovery && (
        <div className="canvas-notice">
          <span>저장하지 않은 캔버스 초안이 있습니다.</span>
          <Button onClick={() => session.recover(true)}>초안 열기</Button>
          <Button
            variant="ghost"
            onClick={() =>
              ask(
                "초안 삭제",
                "저장하지 않은 흐름과 배치 변경을 삭제할까요?",
                () => session.recover(false),
              )
            }
          >
            초안 삭제
          </Button>
        </div>
      )}
      {(error || s.error) && (
        <div className="canvas-notice" role="alert">
          <span>{error || s.error}</span>
          <Button
            variant="outline"
            onClick={() => void act(() => session.save())}
          >
            다시 저장
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              ask(
                "최신 내용 불러오기",
                "저장하지 않은 흐름과 배치 변경을 버리고 최신 내용을 불러올까요?",
                () => void act(() => session.reload()),
              )
            }
          >
            최신 내용 불러오기
          </Button>
        </div>
      )}
      {s.review && (
        <div className="canvas-notice">
          <strong>생성된 흐름 검토</strong>
          <Button variant="outline" onClick={() => setCurrent((v) => !v)}>
            {current ? "초안 보기" : "현재 흐름 보기"}
          </Button>
          <Button
            variant="ghost"
            onClick={() =>
              ask(
                "검토 종료",
                "수정한 초안을 닫을까요? 생성 결과는 작업 목록에서 다시 열 수 있습니다.",
                () => {
                  session.cancelReview();
                  setCurrent(false);
                },
              )
            }
          >
            취소
          </Button>
          <Button
            onClick={() =>
              ask(
                s.base?.flow.steps.length ? "흐름 교체" : "흐름 추가",
                "현재 흐름과 흐름 보기 배치가 교체됩니다. 테스트 케이스는 유지됩니다. 이전 흐름 복원에서 되돌릴 수 있습니다.",
                () => void act(() => session.applyReview()),
              )
            }
          >
            {s.base?.flow.steps.length ? "현재 흐름 교체" : "흐름 추가"}
          </Button>
        </div>
      )}
      {restoring && (
        <div className="canvas-notice">
          <strong>이전 흐름 검토</strong>
          <span>복원하면 현재 흐름과 흐름 보기 배치가 교체됩니다.</span>
          <Button variant="outline" onClick={() => setCurrent((v) => !v)}>
            {current ? "복원할 흐름 보기" : "현재 흐름 보기"}
          </Button>
          <div>
            {missing.length > 0 && (
              <>
                <p>
                  삭제된 테스트 케이스 {missing.length}개는 연결하지 않고
                  복원합니다.
                </p>
                <ul>
                  {missing.map((id) => (
                    <li key={id}>{s.base?.previous?.caseLabels[id] ?? id}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <Button
            variant="ghost"
            onClick={() => {
              setRestoring(false);
              setCurrent(false);
            }}
          >
            취소
          </Button>
          <Button
            onClick={() =>
              void act(async () => {
                await session.restore();
                setRestoring(false);
              })
            }
          >
            복원
          </Button>
        </div>
      )}
      <div className="canvas-toolbar">
        <fieldset aria-label="캔버스 보기">
          <Button
            variant="ghost"
            aria-pressed={mode === "groups"}
            onClick={() => {
              setMode("groups");
              setStepId(undefined);
              setEdgeId(undefined);
            }}
          >
            기능별 보기
          </Button>
          <Button
            variant="ghost"
            aria-pressed={mode === "flow"}
            onClick={() => setMode("flow")}
          >
            흐름 보기
          </Button>
        </fieldset>
        {mode === "groups" ? (
          <label>
            묶음 기준
            <select
              aria-label="묶음 기준"
              disabled={disabled}
              value={
                snapshot.columns.some((c) => c.id === value.layout.groupBy)
                  ? (value.layout.groupBy ?? "")
                  : ""
              }
              onChange={(e) =>
                layout({ ...value.layout, groupBy: e.target.value || null })
              }
            >
              <option value="">묶음 없음</option>
              {snapshot.columns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <Button variant="outline" disabled={disabled} onClick={addStep}>
              단계 추가
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || !value.flow.steps.length}
              onClick={addEdge}
            >
              연결 추가
            </Button>
            {!s.review && !restoring && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() => {
                  setGenerating((v) => !v);
                  setStepId(undefined);
                  setEdgeId(undefined);
                }}
              >
                흐름 생성
              </Button>
            )}
            {s.base?.previous && !s.review && !restoring && (
              <Button
                variant="ghost"
                disabled={disabled}
                onClick={() =>
                  void act(async () => {
                    if (await session.settle()) {
                      setRestoring(true);
                      setCurrent(false);
                      setGenerating(false);
                      setStepId(undefined);
                      setEdgeId(undefined);
                    }
                  })
                }
              >
                이전 흐름 복원
              </Button>
            )}
          </>
        )}
        <Button
          variant="ghost"
          disabled={disabled || aligning}
          onClick={() => void arrange()}
        >
          {aligning ? "정렬 중" : "자동 정렬"}
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || selectedCount < 2}
          onClick={() => align("left")}
        >
          왼쪽 맞춤
        </Button>
        <Button
          variant="ghost"
          disabled={disabled || selectedCount < 2}
          onClick={() => align("gap")}
        >
          간격 맞춤
        </Button>
        <span className="canvas-save-status" role="status">
          {s.status.flow && `흐름 ${s.status.flow}`}{" "}
          {s.status.layout && `배치 ${s.status.layout}`}
        </span>
      </div>
      <div className="canvas-body">
        <div className="canvas-surface">
          <ReactFlow<CanvasNode>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={setInstance}
            onNodesChange={(changes) =>
              setNodes((old) => applyNodeChanges(changes, old))
            }
            onNodeDragStop={(_event, _node, moved) =>
              positions(nodes.map((n) => moved.find((m) => m.id === n.id) ?? n))
            }
            onConnect={(connection) => {
              if (!disabled && connection.source && connection.target)
                edit({
                  ...value.flow,
                  edges: [
                    ...value.flow.edges,
                    {
                      id: crypto.randomUUID(),
                      from: connection.source.slice(2),
                      to: connection.target.slice(2),
                      condition: "",
                    },
                  ],
                });
            }}
            onEdgeClick={(_e, edge) => {
              setEdgeId(edge.id);
              setStepId(undefined);
              setGenerating(false);
            }}
            onMoveEnd={(_event, viewport) => saveViewport(viewport)}
            onSelectionChange={({ nodes }) => {
              try {
                const saved = JSON.parse(
                  localStorage.getItem(viewportKey) ?? "{}",
                );
                localStorage.setItem(
                  viewportKey,
                  JSON.stringify({
                    ...saved,
                    selected: nodes.map((n) => n.id),
                  }),
                );
              } catch {
                /* Optional preference. */
              }
            }}
            nodesConnectable={!disabled && mode === "flow"}
            elementsSelectable
            nodesDraggable={!disabled}
            selectionOnDrag={selecting}
            panOnDrag={selecting ? [1, 2] : true}
            selectionKeyCode="Shift"
            multiSelectionKeyCode={["Meta", "Control"]}
            panActivationKeyCode="Space"
            deleteKeyCode={null}
            minZoom={0.005}
            maxZoom={2}
            zoomOnScroll
            zoomOnDoubleClick={false}
            fitView={!navigation.viewport}
            fitViewOptions={{ padding: 0.08 }}
            onlyRenderVisibleElements={false}
            ariaLabelConfig={{
              "node.a11yDescription.default":
                "Enter 또는 Space로 선택하고 Esc로 선택을 해제합니다.",
              "node.a11yDescription.keyboardDisabled":
                "Enter 또는 Space로 선택하고 Esc로 선택을 해제합니다.",
              "node.a11yDescription.ariaLiveMessage": ({ x, y }) =>
                `위치 변경: ${Math.round(x)}, ${Math.round(y)}`,
              "edge.a11yDescription.default":
                "Enter 또는 Space로 연결을 선택합니다.",
              "minimap.ariaLabel": "캔버스 미니맵",
              "handle.ariaLabel": "단계 연결점",
            }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--color-border)" gap={24} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === "group"
                  ? "var(--color-primary-subtle)"
                  : "var(--color-primary)"
              }
              maskColor="var(--color-overlay)"
            />
          </ReactFlow>
          {!groups.length && (
            <div className="canvas-empty">
              <strong>
                {mode === "flow"
                  ? "흐름이 없습니다"
                  : "테스트 케이스가 없습니다"}
              </strong>
              {mode === "flow" && (
                <Button onClick={addStep} disabled={disabled}>
                  단계 추가
                </Button>
              )}
            </div>
          )}
          <div className="canvas-navigation">
            <Button
              variant="ghost"
              aria-label="이동 도구"
              aria-pressed={!selecting}
              onClick={() => setSelecting(false)}
            >
              이동
            </Button>
            <Button
              variant="ghost"
              aria-label="선택 도구"
              aria-pressed={selecting}
              onClick={() => setSelecting(true)}
            >
              선택
            </Button>
            <Button
              variant="ghost"
              aria-label="축소"
              onClick={() => void instance?.zoomOut()}
            >
              −
            </Button>
            <span>{Math.round(zoom * 100)}%</span>
            <Button
              variant="ghost"
              aria-label="확대"
              onClick={() => void instance?.zoomIn()}
            >
              +
            </Button>
            <Button
              variant="ghost"
              onClick={() => void instance?.fitView({ padding: 0.08 })}
            >
              전체 보기
            </Button>
            <Button
              variant="ghost"
              disabled={!selectedCount}
              onClick={() =>
                void instance?.fitView({
                  nodes: nodes.filter((n) => n.selected),
                  padding: 0.12,
                  maxZoom: 1,
                })
              }
            >
              선택 보기
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || !s.undo}
              onClick={() => session.undo()}
              aria-label="실행 취소"
            >
              ↶
            </Button>
            <Button
              variant="ghost"
              disabled={disabled || !s.redo}
              onClick={() => session.undo(true)}
              aria-label="다시 실행"
            >
              ↷
            </Button>
          </div>
        </div>
        {generating ? (
          <CanvasGeneration
            session={session}
            disabled={disabled || !snapshot.cases.length}
            onClose={() => setGenerating(false)}
            onReview={() => {
              setGenerating(false);
              setCurrent(false);
              setMode("flow");
            }}
          />
        ) : (
          mode === "flow" && (
            <CanvasInspector
              flow={value.flow}
              snapshot={snapshot}
              stepId={stepId}
              edgeId={edgeId}
              disabled={disabled}
              onChange={(flow) => edit(flow)}
              onClose={() => {
                setStepId(undefined);
                setEdgeId(undefined);
              }}
              onConfirm={ask}
            />
          )
        )}
      </div>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(undefined);
        }}
      >
        <DialogContent>
          <DialogTitle>{confirm?.title}</DialogTitle>
          <DialogDescription>{confirm?.description}</DialogDescription>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(undefined)}>
              취소
            </Button>
            <Button
              onClick={() => {
                const action = confirm?.action;
                setConfirm(undefined);
                action?.();
              }}
            >
              {confirm?.title.includes("삭제")
                ? "삭제"
                : confirm?.title.includes("교체")
                  ? "교체"
                  : confirm?.title === "흐름 추가"
                    ? "추가"
                    : confirm?.title === "검토 종료"
                      ? "종료"
                      : "불러오기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
