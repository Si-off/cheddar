import { Badge, cn, IconButton, type Tone } from "@cheddar/ui";
import { Minus, Plus } from "lucide-react";
import {
  type DragEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  type FeatureGroupRef,
  groupByFeature,
  groupCases,
  readCell,
  type TestCase,
  type ViewPreference,
} from "@/entities/test-set";
import { CanvasCell } from "./canvas-cell";

export interface CaseCanvasProps {
  columns: Column[];
  /** 보여줄 케이스(검색 결과) */
  cases: TestCase[];
  /** 테스트 세트 전체 케이스. 새 케이스를 둘 자리를 찾는다. */
  allCases: TestCase[];
  featureGroups: FeatureGroupRef[];
  group: ViewPreference["canvasGroup"];
  groupColumnId: string | null;
  density: ViewPreference["canvasDensity"];
  readOnly?: boolean;
  onOps: (ops: CaseOp[]) => void;
  /** 간략 카드를 누르면 케이스를 연다 */
  onOpenCase: (caseId: string) => void;
}

interface Lane {
  key: string;
  label: string;
  cases: TestCase[];
  /** 이 열로 옮기거나 여기에 더할 때 바꿀 값 */
  target:
    | { kind: "feature"; featureGroupId: string | null }
    | { kind: "column"; column: Column; value: CellValue; from: CellValue }
    | { kind: "none" };
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

// QA 결과 값의 색. Pass는 초록, Fail은 빨강, 나머지 기록은 노랑, N/A와 -는 회색, 비어 있으면 미진행.
const resultTone = (value: string): Tone | null =>
  value === "Pass"
    ? "success"
    : value === "Fail"
      ? "danger"
      : value === "N/A" || value === "-"
        ? "neutral"
        : value
          ? "warning"
          : null;
const tintClass: Record<Tone, string> = {
  success: "bg-success-soft",
  danger: "bg-danger-soft",
  warning: "bg-warning-soft",
  neutral: "bg-canvas",
  accent: "bg-canvas",
  figma: "bg-canvas",
  info: "bg-canvas",
};
const textClass: Record<Tone, string> = {
  success: "text-success",
  danger: "text-danger",
  warning: "text-warning",
  neutral: "text-fg-muted",
  accent: "text-fg-muted",
  figma: "text-fg-muted",
  info: "text-fg-muted",
};
const dotClass: Record<Tone, string> = {
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
  neutral: "bg-fg-muted",
  accent: "bg-fg-muted",
  figma: "bg-fg-muted",
  info: "bg-fg-muted",
};
const NOT_STARTED = "미진행";

/** 다른 열로 옮겼을 때의 새 값. 태그는 떠난 열의 태그를 빼고 들어간 열의 태그를 더한다. */
function movedValue(
  column: Column,
  current: CellValue | undefined,
  from: CellValue,
  to: CellValue,
): CellValue {
  if (column.type !== "tags") return to;
  if (Array.isArray(to) && to.length === 0) return [];
  const tags = readCell(column, current) as string[];
  const kept = Array.isArray(from)
    ? tags.filter((t) => !from.includes(t))
    : tags;
  const next = new Set([...kept, ...(Array.isArray(to) ? to : [])]);
  return [
    ...column.options.filter((o) => next.has(o)),
    ...[...next].filter((t) => !column.options.includes(t)),
  ];
}

/**
 * 캔버스 보기. 그룹마다 세로 열을 두고 케이스를 카드로 놓는다.
 * ⌘(Ctrl)+휠로 확대·축소하고, 휠이나 빈 곳 끌기로 움직인다. 확대율은 크기만 바꾸고 내용은 바꾸지 않는다.
 * 카드를 다른 열로 끌면 그 그룹으로 옮긴다. QA 결과 열이 있으면 결과 색과 요약을 보여준다.
 */
export function CaseCanvas({
  columns,
  cases,
  allCases,
  featureGroups,
  group,
  groupColumnId,
  density,
  readOnly,
  onOps,
  onOpenCase,
}: CaseCanvasProps) {
  const idColumn = columns.find((c) => c.systemKey === "test_id");
  const titleColumn = columns.find((c) => c.systemKey === "title");
  const resultColumn = columns.find((c) => c.presetKey === "qa_result") ?? null;
  const groupColumn =
    group === "column" ? columns.find((c) => c.id === groupColumnId) : null;
  const detail = density === "detail";

  const lanes: Lane[] =
    group === "feature"
      ? groupByFeature(featureGroups, cases).map((l) => ({
          key: l.key,
          label: l.label,
          cases: l.cases,
          target: { kind: "feature", featureGroupId: l.featureGroupId },
        }))
      : groupColumn
        ? groupCases(groupColumn, cases).map((l) => ({
            key: l.key,
            label: l.label,
            cases: l.cases,
            target: {
              kind: "column",
              column: groupColumn,
              value: l.value,
              from: l.value,
            },
          }))
        : [
            {
              key: "all",
              label: "모든 케이스",
              cases,
              target: { kind: "none" },
            },
          ];

  const resultOf = (c: TestCase) =>
    resultColumn ? cellText(resultColumn, c.values[resultColumn.id]) : "";
  // 결과 요약에서 고른 값. 그 결과의 카드만 또렷하게 보인다.
  const [focusResult, setFocusResult] = useState<string | null>(null);
  const summary = resultColumn
    ? [
        ...new Set([
          ...resultColumn.options,
          ...cases.map(resultOf).filter(Boolean),
        ]),
      ]
        .map((value) => ({
          value,
          count: cases.filter((c) => resultOf(c) === value).length,
        }))
        .filter((s) => s.count > 0)
        .concat([
          {
            value: "",
            count: cases.filter((c) => resultOf(c) === "").length,
          },
        ])
        .filter((s) => s.count > 0)
    : [];
  const dimmed = (c: TestCase) =>
    focusResult !== null && resultOf(c) !== focusResult;

  // 확대·축소와 이동
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const view = useRef({ zoom, pan });
  view.current = { zoom, pan };
  const zoomAt = (next: number, point?: { x: number; y: number }) => {
    const { zoom: z, pan: p } = view.current;
    const target = clampZoom(next);
    const rect = viewport.current?.getBoundingClientRect();
    const px = point?.x ?? (rect ? rect.width / 2 : 0);
    const py = point?.y ?? (rect ? rect.height / 2 : 0);
    // 가리킨 지점이 제자리에 남도록 이동도 함께 바꾼다
    setPan({
      x: px - ((px - p.x) / z) * target,
      y: py - ((py - p.y) / z) * target,
    });
    setZoom(target);
  };
  // 휠은 페이지 스크롤을 막아야 하므로 passive가 아닌 리스너로 받는다
  // biome-ignore lint/correctness/useExhaustiveDependencies: 현재 값은 view 참조로 읽는다
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = el.getBoundingClientRect();
        zoomAt(view.current.zoom * Math.exp(-event.deltaY * 0.01), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        });
      } else setPan((p) => ({ x: p.x - event.deltaX, y: p.y - event.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const dragPan = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const onBackground =
      (event.target as HTMLElement).dataset.canvasBackground !== undefined;
    if (!(onBackground && event.button === 0) && event.button !== 1) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragPan.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragPan.current;
    if (start)
      setPan({ x: event.clientX - start.x, y: event.clientY - start.y });
  };
  const endPan = () => {
    dragPan.current = null;
  };

  // 카드를 다른 열로 옮긴다
  const [dragging, setDragging] = useState<{
    caseId: string;
    from: string;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const movable = !readOnly && lanes.some((l) => l.target.kind !== "none");
  const drop = (event: DragEvent, to: Lane) => {
    event.preventDefault();
    setOver(null);
    const moving = dragging;
    setDragging(null);
    if (!moving || moving.from === to.key) return;
    const from = lanes.find((l) => l.key === moving.from);
    const moved = cases.find((c) => c.id === moving.caseId);
    if (!from || !moved) return;
    if (to.target.kind === "feature")
      onOps([
        {
          type: "set_feature_group",
          caseId: moved.id,
          featureGroupId: to.target.featureGroupId,
        },
      ]);
    else if (to.target.kind === "column" && from.target.kind === "column")
      onOps([
        {
          type: "set_cell",
          caseId: moved.id,
          columnId: to.target.column.id,
          value: movedValue(
            to.target.column,
            moved.values[to.target.column.id],
            from.target.from,
            to.target.value,
          ),
        },
      ]);
  };
  const addTo = (lane: Lane) => {
    const afterCaseId = (lane.cases.at(-1) ?? allCases.at(-1))?.id ?? null;
    const caseId = crypto.randomUUID();
    onOps([
      {
        type: "add_case",
        caseId,
        afterCaseId,
        values:
          lane.target.kind === "column"
            ? { [lane.target.column.id]: lane.target.value }
            : {},
        ...(lane.target.kind === "feature"
          ? { featureGroupId: lane.target.featureGroupId }
          : {}),
      },
    ]);
    if (!detail) onOpenCase(caseId);
  };

  const fields = columns.filter((c) => c.systemKey !== "test_id");
  const caseName = (c: TestCase) =>
    [
      idColumn && cellText(idColumn, c.values[idColumn.id]),
      titleColumn && cellText(titleColumn, c.values[titleColumn.id]),
    ]
      .filter(Boolean)
      .join(" ") || "제목 없는 케이스";

  return (
    <section
      aria-label="캔버스"
      className="relative flex min-h-96 flex-1 overflow-hidden rounded-lg border border-line bg-surface"
    >
      <div
        ref={viewport}
        data-canvas-background=""
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
      >
        <ul
          data-canvas-background=""
          aria-label={
            group === "feature"
              ? "기능 그룹별 케이스"
              : groupColumn
                ? `${groupColumn.name}별 케이스`
                : "케이스"
          }
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
          className="absolute top-0 left-0 m-0 flex origin-top-left list-none items-start gap-4 p-6"
        >
          {lanes.map((lane) => {
            const done = lane.cases.filter((c) => resultOf(c) !== "").length;
            return (
              <li
                key={lane.key}
                aria-label={lane.label}
                onDragOver={(event) => {
                  if (!dragging) return;
                  event.preventDefault();
                  setOver(lane.key);
                }}
                onDragLeave={() => setOver((k) => (k === lane.key ? null : k))}
                onDrop={(event) => drop(event, lane)}
                className={cn(
                  "flex shrink-0 cursor-default flex-col gap-2 rounded-lg p-2 transition-colors duration-fast",
                  detail ? "w-96" : "w-64",
                  over === lane.key && dragging?.from !== lane.key
                    ? "bg-selected"
                    : "bg-surface",
                )}
              >
                <div className="flex min-h-7 items-center gap-2 px-1">
                  <span className="min-w-0 truncate text-label font-semibold text-fg">
                    {lane.label}
                  </span>
                  <span className="text-caption text-fg-muted tabular-nums">
                    {resultColumn
                      ? `결과 입력 ${done}/${lane.cases.length}`
                      : lane.cases.length}
                  </span>
                  <span className="flex-1" />
                  {!readOnly && (
                    <IconButton
                      icon={Plus}
                      size="sm"
                      label={`${lane.label} 케이스 추가`}
                      onClick={() => addTo(lane)}
                    />
                  )}
                </div>
                {resultColumn && lane.cases.length > 0 && (
                  <div
                    aria-hidden
                    className="mx-1 flex h-1.5 overflow-hidden rounded-full bg-subtle"
                  >
                    {summary
                      .filter((s) => s.value)
                      .map((s) => {
                        const count = lane.cases.filter(
                          (c) => resultOf(c) === s.value,
                        ).length;
                        const tone = resultTone(s.value);
                        return count > 0 && tone ? (
                          <span
                            key={s.value}
                            className={dotClass[tone]}
                            style={{
                              width: `${(count / lane.cases.length) * 100}%`,
                            }}
                          />
                        ) : null;
                      })}
                  </div>
                )}
                {lane.cases.map((c) => {
                  const result = resultOf(c);
                  const tone = resultColumn ? resultTone(result) : null;
                  const dragProps = movable && {
                    draggable: true,
                    onDragStart: (event: DragEvent) => {
                      event.dataTransfer.effectAllowed = "move";
                      setDragging({ caseId: c.id, from: lane.key });
                    },
                    onDragEnd: () => {
                      setDragging(null);
                      setOver(null);
                    },
                  };
                  if (!detail)
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-label={
                          tone && result
                            ? `${caseName(c)}, ${result}`
                            : caseName(c)
                        }
                        onClick={() => onOpenCase(c.id)}
                        {...(dragProps || {})}
                        className={cn(
                          "flex h-8 items-center gap-2 rounded-md border-0 px-2.5 text-left transition-opacity duration-fast",
                          tone ? tintClass[tone] : "bg-canvas",
                          dimmed(c) && "opacity-30",
                          dragging?.caseId === c.id && "opacity-50",
                          movable && "cursor-grab",
                        )}
                      >
                        {idColumn && (
                          <span className="shrink-0 font-mono text-caption text-fg-muted">
                            {cellText(idColumn, c.values[idColumn.id])}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-body-sm text-fg">
                          {titleColumn &&
                            cellText(titleColumn, c.values[titleColumn.id])}
                        </span>
                        {tone && result && (
                          <span
                            className={cn(
                              "shrink-0 text-caption font-semibold",
                              textClass[tone],
                            )}
                          >
                            {result}
                          </span>
                        )}
                      </button>
                    );
                  return (
                    <article
                      key={c.id}
                      aria-label={caseName(c)}
                      className={cn(
                        "flex flex-col gap-2 rounded-md bg-canvas p-3 transition-opacity duration-fast",
                        dimmed(c) && "opacity-30",
                        dragging?.caseId === c.id && "opacity-50",
                      )}
                    >
                      <div
                        {...(dragProps || {})}
                        className={cn(
                          "flex items-center gap-2",
                          movable && "cursor-grab",
                        )}
                      >
                        {idColumn && (
                          <span className="font-mono text-caption text-fg-muted">
                            {cellText(idColumn, c.values[idColumn.id])}
                          </span>
                        )}
                        <span className="flex-1" />
                        {tone && result && <Badge tone={tone}>{result}</Badge>}
                      </div>
                      <table className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-sm border border-line text-body-sm">
                        <tbody>
                          {fields.map((column, index) => (
                            <tr key={column.id}>
                              <th
                                scope="row"
                                className={cn(
                                  "w-24 border-line border-r bg-subtle px-2 py-1 text-left align-top text-caption font-medium text-fg-muted",
                                  index > 0 && "border-t",
                                )}
                              >
                                {column.name}
                              </th>
                              <td
                                className={cn(
                                  "border-line bg-surface px-2 py-1 align-top",
                                  index > 0 && "border-t",
                                )}
                              >
                                <CanvasCell
                                  column={column}
                                  value={c.values[column.id]}
                                  readOnly={readOnly}
                                  onChange={(value) =>
                                    onOps([
                                      {
                                        type: "set_cell",
                                        caseId: c.id,
                                        columnId: column.id,
                                        value,
                                      },
                                    ])
                                  }
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </article>
                  );
                })}
              </li>
            );
          })}
        </ul>
      </div>

      {summary.length > 0 && (
        <fieldset
          aria-label="결과"
          className="m-0 min-w-0 absolute bottom-3 left-3 flex gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-raised"
        >
          {summary.map((s) => {
            const tone = resultTone(s.value);
            const label = s.value || NOT_STARTED;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={focusResult === s.value}
                onClick={() =>
                  setFocusResult((v) => (v === s.value ? null : s.value))
                }
                className="inline-flex h-7 items-center gap-1.5 rounded-sm border-0 bg-transparent px-2 text-caption text-fg-muted tabular-nums hover:bg-subtle hover:text-fg aria-pressed:bg-selected aria-pressed:font-medium aria-pressed:text-fg"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    tone ? dotClass[tone] : "border border-line-strong",
                  )}
                />
                {label} {s.count}
              </button>
            );
          })}
        </fieldset>
      )}
      <fieldset
        aria-label="확대와 축소"
        className="m-0 min-w-0 absolute right-3 bottom-3 flex items-center gap-0.5 rounded-md border border-line bg-surface p-0.5 shadow-raised"
      >
        <IconButton
          icon={Minus}
          size="sm"
          label="축소"
          disabled={zoom <= MIN_ZOOM}
          onClick={() => zoomAt(zoom / 1.25)}
        />
        <button
          type="button"
          aria-label={`확대 비율 ${Math.round(zoom * 100)}%, 100%로 되돌리기`}
          onClick={() => zoomAt(1)}
          className="h-8 min-w-14 rounded-sm border-0 bg-transparent px-1 text-caption text-fg tabular-nums hover:bg-subtle"
        >
          {Math.round(zoom * 100)}%
        </button>
        <IconButton
          icon={Plus}
          size="sm"
          label="확대"
          disabled={zoom >= MAX_ZOOM}
          onClick={() => zoomAt(zoom * 1.25)}
        />
      </fieldset>
    </section>
  );
}
