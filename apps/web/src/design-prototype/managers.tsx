import { useRef, useState } from "react";
import { Icon } from "./art";
import { Dialog, EmptyState, Field, IconButton } from "./components";
import { readRows } from "./io";
import {
  type Column,
  clone,
  defaultColumns,
  type FlowEdge,
  type FlowNode,
  frames,
  type IAItem,
  mockFlow,
  type Project,
  type Sheet,
  type SheetTemplate,
  uid,
} from "./model";
export function ColumnsEditor({
  columns,
  onChange,
  onDelete,
}: {
  columns: Column[];
  onChange: (cols: Column[]) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>();
  const current = columns.find((col) => col.id === editing);
  const edit = (col: Column, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setAnchor({ left: rect.left, bottom: rect.bottom });
    setEditing(col.id);
    setDeleting(false);
  };
  const update = (patch: Partial<Column>) =>
    onChange(
      columns.map((col) => (col.id === editing ? { ...col, ...patch } : col)),
    );
  return (
    <>
      <div className="column-list">
        {columns.map((col) => (
          <div className="column-item" key={col.id}>
            <label className="column-visibility">
              <input
                type="checkbox"
                aria-label={`${col.name} 표시`}
                checked={col.visible}
                disabled={
                  col.visible && columns.filter((c) => c.visible).length === 1
                }
                onChange={(e) =>
                  onChange(
                    columns.map((c) =>
                      c.id === col.id ? { ...c, visible: e.target.checked } : c,
                    ),
                  )
                }
              />
            </label>
            <button
              type="button"
              className="column-settings"
              aria-label={`${col.name} 설정`}
              onClick={(e) => edit(col, e.currentTarget)}
            >
              <span>{col.name}</span>
              <Icon name="chevron" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="text-action column-add"
        onClick={(e) => {
          const col = {
            id: uid(),
            name: "새 열",
            width: 220,
            visible: true,
            custom: true,
          };
          onChange([...columns, col]);
          edit(col, e.currentTarget);
        }}
      >
        <Icon name="plus" />열 추가
      </button>
      {current && (
        <Dialog
          title="열 설정"
          popover
          anchor={anchor}
          onClose={() => setEditing(null)}
        >
          {deleting ? (
            <div className="field-stack">
              <p>이 열을 삭제하면 입력된 값도 삭제됩니다.</p>
              <div className="button-row">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setDeleting(false)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    onDelete(current.id);
                    setEditing(null);
                  }}
                >
                  열 삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="field-stack">
              <Field label="열 이름">
                <input
                  value={current.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="순서">
                <select
                  value={columns.indexOf(current)}
                  onChange={(e) => {
                    const next = columns.filter((col) => col.id !== current.id);
                    next.splice(Number(e.target.value), 0, current);
                    onChange(next);
                  }}
                >
                  {columns.map((col, i) => (
                    <option key={col.id} value={i}>
                      {i + 1}번째
                    </option>
                  ))}
                </select>
              </Field>
              {current.custom && (
                <button
                  type="button"
                  className="text-action danger-text"
                  onClick={() => setDeleting(true)}
                >
                  <Icon name="trash" />열 삭제
                </button>
              )}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}

export function IAManager({
  project,
  onChange,
}: {
  project: Project;
  onChange: (patch: Partial<Project>) => void;
}) {
  const [editing, setEditing] = useState<IAItem | null>(null);
  const [importRows, setImportRows] = useState<IAItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const duplicate = (rows: IAItem[]) =>
    rows.some(
      (x, i) =>
        !x.code.trim() ||
        !x.name.trim() ||
        rows.some((y, j) => i !== j && x.code.trim() === y.code.trim()) ||
        project.ia.some((y) => y.code === x.code.trim() && y.id !== x.id),
    );
  const references = editing
    ? project.sheets
        .flatMap((s) =>
          [...s.cases, ...s.candidates]
            .filter((c) => c.iaIds.includes(editing.id))
            .map((c) => `${s.name} · ${c.title}`),
        )
        .concat(
          project.sheets.flatMap((s) =>
            s.nodes
              .filter((n) => n.iaId === editing.id)
              .map((n) => `${s.name} · ${n.label}`),
          ),
        )
    : [];
  return (
    <div className="manager-page">
      <div className="manager-tools">
        <input
          ref={file}
          type="file"
          accept=".csv,.xlsx"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setBusy(true);
            setError("");
            try {
              const rows = await readRows(f);
              const items = rows
                .slice(1)
                .filter((r) => r.some(Boolean))
                .map((r) => ({
                  id: uid(),
                  code: r[0]?.trim() ?? "",
                  name: r[1]?.trim() ?? "",
                  parent: "",
                  frameId: "",
                }));
              if (!items.length)
                throw new Error("화면 ID와 이름이 있는 행을 찾지 못했습니다.");
              setImportOpen(false);
              setImportRows(items);
            } catch (err) {
              setError(
                err instanceof Error
                  ? err.message
                  : "파일을 읽지 못했습니다. 다른 파일을 선택해 주세요.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
        <IconButton
          name="download"
          label="IA 파일 가져오기"
          onClick={() => setImportOpen(true)}
          disabled={busy}
        />
        <IconButton
          name="plus"
          label="화면 추가"
          onClick={() =>
            setEditing({
              id: uid(),
              code: "",
              name: "",
              parent: "",
              frameId: "",
            })
          }
        />
      </div>
      {busy && (
        <p role="status" className="inline-status">
          <span className="spinner" />
          파일 분석 중
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {project.ia.length === 0 ? (
        <EmptyState title="등록된 화면이 없습니다" />
      ) : (
        <div className="ia-list">
          {project.ia.map((item) => (
            <button
              type="button"
              className="ia-row"
              key={item.id}
              onClick={() => setEditing({ ...item })}
            >
              <span className="code">{item.code}</span>
              <span>
                {item.parent && (
                  <small>
                    {project.ia.find((i) => i.id === item.parent)?.name} /{" "}
                  </small>
                )}
                {item.name}
              </span>
              <Icon name="chevron" />
            </button>
          ))}
        </div>
      )}
      {editing && (
        <Dialog
          title="화면 편집"
          side
          onClose={() => {
            setEditing(null);
            setError("");
          }}
        >
          <div className="field-stack">
            <Field label="화면 ID">
              <input
                value={editing.code}
                onChange={(e) =>
                  setEditing({ ...editing, code: e.target.value })
                }
              />
            </Field>
            <Field label="화면 이름">
              <input
                value={editing.name}
                onChange={(e) =>
                  setEditing({ ...editing, name: e.target.value })
                }
              />
            </Field>
            <Field label="상위 화면">
              <select
                value={editing.parent}
                onChange={(e) =>
                  setEditing({ ...editing, parent: e.target.value })
                }
              >
                <option value="">없음</option>
                {project.ia
                  .filter(
                    (x) =>
                      x.id !== editing.id &&
                      !isDescendant(x.id, editing.id, project.ia),
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Figma 화면">
              <select
                value={editing.frameId}
                onChange={(e) =>
                  setEditing({ ...editing, frameId: e.target.value })
                }
              >
                <option value="">연결 안 함</option>
                {frames
                  .filter((f) => project.frameIds.includes(f.id))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
            </Field>
            {references.length > 0 && (
              <div className="notice">
                <p>이 화면을 사용하는 항목이 {references.length}개 있습니다.</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    onChange({
                      sheets: project.sheets.map((s) => ({
                        ...s,
                        cases: s.cases.map((c) => ({
                          ...c,
                          iaIds: c.iaIds.filter((id) => id !== editing.id),
                        })),
                        candidates: s.candidates.map((c) => ({
                          ...c,
                          iaIds: c.iaIds.filter((id) => id !== editing.id),
                        })),
                        nodes: s.nodes.map((n) =>
                          n.iaId === editing.id ? { ...n, iaId: "" } : n,
                        ),
                      })),
                    })
                  }
                >
                  연결 해제
                </button>
              </div>
            )}
            {duplicate([editing]) && (
              <p className="field-hint">
                화면 ID와 이름을 입력해 주세요. 화면 ID는 중복할 수 없습니다.
              </p>
            )}
            <div className="button-row">
              {project.ia.some((x) => x.id === editing.id) && (
                <IconButton
                  name="trash"
                  label="화면 삭제"
                  disabled={references.length > 0}
                  onClick={() => {
                    onChange({
                      ia: project.ia
                        .filter((x) => x.id !== editing.id)
                        .map((x) =>
                          x.parent === editing.id
                            ? { ...x, parent: editing.parent }
                            : x,
                        ),
                    });
                    setEditing(null);
                  }}
                />
              )}
              <button
                type="button"
                className="primary"
                disabled={duplicate([editing])}
                onClick={() => {
                  const next = {
                    ...editing,
                    code: editing.code.trim(),
                    name: editing.name.trim(),
                  };
                  onChange({
                    ia: project.ia.some((x) => x.id === editing.id)
                      ? project.ia.map((x) => (x.id === editing.id ? next : x))
                      : [...project.ia, next],
                  });
                  setEditing(null);
                }}
              >
                적용
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {importOpen && (
        <Dialog title="IA 파일 가져오기" onClose={() => setImportOpen(false)}>
          <div className="field-stack">
            <p>
              첫 번째 열에 화면 ID, 두 번째 열에 화면 이름을 입력해 주세요. 첫
              행은 제목으로 제외합니다.
            </p>
            <p className="field-hint">
              XLSX 또는 CSV · 최대 10 MB. XLSX는 첫 번째 시트만 가져옵니다.
            </p>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => file.current?.click()}
            >
              {busy ? "파일 읽는 중" : "파일 선택"}
            </button>
          </div>
        </Dialog>
      )}
      {importRows && (
        <Dialog
          title="가져올 화면 확인"
          wide
          onClose={() => setImportRows(null)}
        >
          <p className="muted">첫 행을 제외한 화면 ID와 이름입니다.</p>
          <div className="import-table">
            {importRows.map((item, i) => (
              <div className="column-row" key={item.id}>
                <input
                  aria-label={`화면 ID ${i + 1}`}
                  value={item.code}
                  onChange={(e) =>
                    setImportRows(
                      importRows.map((x) =>
                        x.id === item.id ? { ...x, code: e.target.value } : x,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`화면 이름 ${i + 1}`}
                  value={item.name}
                  onChange={(e) =>
                    setImportRows(
                      importRows.map((x) =>
                        x.id === item.id ? { ...x, name: e.target.value } : x,
                      ),
                    )
                  }
                />
                <IconButton
                  name="close"
                  label={`${i + 1}행 제외`}
                  onClick={() =>
                    setImportRows(importRows.filter((x) => x.id !== item.id))
                  }
                />
              </div>
            ))}
          </div>
          {duplicate(importRows) && (
            <p className="error">빈 값이나 중복된 화면 ID를 수정해 주세요.</p>
          )}
          <button
            type="button"
            className="primary"
            disabled={!importRows.length || duplicate(importRows)}
            onClick={() => {
              onChange({
                ia: [
                  ...project.ia,
                  ...importRows.map((x) => ({
                    ...x,
                    code: x.code.trim(),
                    name: x.name.trim(),
                  })),
                ],
              });
              setImportRows(null);
            }}
          >
            {importRows.length}개 화면 추가
          </button>
        </Dialog>
      )}
    </div>
  );
}
function isDescendant(id: string, parent: string, items: IAItem[]): boolean {
  let current = items.find((i) => i.id === id);
  const seen = new Set<string>();
  while (current?.parent && !seen.has(current.id)) {
    if (current.parent === parent) return true;
    seen.add(current.id);
    current = items.find((i) => i.id === current?.parent);
  }
  return false;
}
export function FlowEditor({
  sheet,
  ia,
  onChange,
}: {
  sheet: Sheet;
  ia: IAItem[];
  onChange: (p: Partial<Sheet>) => void;
}) {
  const [panel, setPanel] = useState<"node" | "edge" | "import" | null>(null);
  const [node, setNode] = useState<FlowNode | null>(null);
  const [edge, setEdge] = useState<FlowEdge | null>(null);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<ReturnType<typeof mockFlow> | null>(null);
  const [history, setHistory] = useState<
    { nodes: FlowNode[]; edges: FlowEdge[] }[]
  >([]);
  const [future, setFuture] = useState<typeof history>([]);
  const file = useRef<HTMLInputElement>(null);
  const commit = (patch: Pick<Sheet, "nodes" | "edges">) => {
    setHistory((h) => [
      ...h.slice(-29),
      clone({ nodes: sheet.nodes, edges: sheet.edges }),
    ]);
    setFuture([]);
    onChange(patch);
  };
  const analyze = () => {
    setBusy(true);
    setDraft(null);
    setPanel("import");
  };
  return (
    <div className="flow-workspace">
      <div className="flow-toolbar">
        <IconButton
          name="plus"
          label="노드 추가"
          onClick={() => {
            setNode({
              id: uid(),
              label: "",
              kind: "화면",
              x: 120 + (sheet.nodes.length % 3) * 220,
              y: 120 + Math.floor(sheet.nodes.length / 3) * 160,
              iaId: "",
            });
            setPanel("node");
          }}
        />
        <IconButton
          name="link"
          label="연결 추가"
          disabled={sheet.nodes.length < 2}
          onClick={() => {
            setEdge({
              id: uid(),
              from: sheet.nodes[0].id,
              to: sheet.nodes[1].id,
              label: "",
            });
            setPanel("edge");
          }}
        />
        <IconButton
          name="image"
          label="자료에서 흐름 가져오기"
          onClick={() => {
            setPanel("import");
            setDraft(null);
            setBusy(false);
          }}
        />
        <span className="toolbar-divider" />
        <IconButton
          name="undo"
          label="실행 취소"
          disabled={!history.length}
          onClick={() => {
            setFuture((f) => [
              ...f,
              clone({ nodes: sheet.nodes, edges: sheet.edges }),
            ]);
            onChange(history.at(-1) ?? {});
            setHistory((h) => h.slice(0, -1));
          }}
        />
        <IconButton
          name="arrow"
          label="다시 실행"
          disabled={!future.length}
          onClick={() => {
            setHistory((h) => [
              ...h,
              clone({ nodes: sheet.nodes, edges: sheet.edges }),
            ]);
            onChange(future.at(-1) ?? {});
            setFuture((f) => f.slice(0, -1));
          }}
        />
        <span className="toolbar-divider" />
        <IconButton
          name="minus"
          label="축소"
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => z - 0.1)}
        />
        <span>{Math.round(zoom * 100)}%</span>
        <IconButton
          name="plus"
          label="확대"
          disabled={zoom >= 1.5}
          onClick={() => setZoom((z) => z + 0.1)}
        />
        <IconButton
          name="expand"
          label="전체 보기"
          onClick={() => setZoom(0.7)}
        />
      </div>
      <div className="flow-scroll">
        <div style={{ width: 1200 * zoom, height: 850 * zoom }}>
          <div className="flow-canvas" style={{ transform: `scale(${zoom})` }}>
            <svg
              className="flow-lines"
              width="1200"
              height="850"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0,0 L8,4 L0,8Z" />
                </marker>
              </defs>
              {sheet.edges.map((e) => {
                const from = sheet.nodes.find((n) => n.id === e.from),
                  to = sheet.nodes.find((n) => n.id === e.to);
                return from && to ? (
                  <path
                    key={e.id}
                    d={`M${from.x + 80} ${from.y + 40} L${to.x + 80} ${to.y + 40}`}
                    markerEnd="url(#arrowhead)"
                  />
                ) : null;
              })}
            </svg>
            {sheet.edges.map((e) => {
              const a = sheet.nodes.find((n) => n.id === e.from),
                b = sheet.nodes.find((n) => n.id === e.to);
              return a && b ? (
                <button
                  type="button"
                  className="edge-label"
                  key={e.id}
                  style={{
                    left: (a.x + b.x) / 2 + 80,
                    top: (a.y + b.y) / 2 + 40,
                  }}
                  aria-label={`${a.label}에서 ${b.label} 연결 편집`}
                  onClick={() => {
                    setEdge({ ...e });
                    setPanel("edge");
                  }}
                >
                  {e.label || <Icon name="link" />}
                </button>
              ) : null;
            })}
            {sheet.nodes.map((n) => (
              <button
                type="button"
                className={`flow-node node-${n.kind}`}
                key={n.id}
                style={{ left: n.x, top: n.y }}
                onDoubleClick={() => {
                  setNode({ ...n });
                  setPanel("node");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setNode({ ...n });
                    setPanel("node");
                  }
                  if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                    ].includes(e.key)
                  ) {
                    e.preventDefault();
                    commit({
                      nodes: sheet.nodes.map((x) =>
                        x.id === n.id
                          ? {
                              ...x,
                              x: Math.max(
                                0,
                                Math.min(
                                  1030,
                                  x.x +
                                    (e.key === "ArrowRight"
                                      ? 20
                                      : e.key === "ArrowLeft"
                                        ? -20
                                        : 0),
                                ),
                              ),
                              y: Math.max(
                                0,
                                Math.min(
                                  740,
                                  x.y +
                                    (e.key === "ArrowDown"
                                      ? 20
                                      : e.key === "ArrowUp"
                                        ? -20
                                        : 0),
                                ),
                              ),
                            }
                          : x,
                      ),
                      edges: sheet.edges,
                    });
                  }
                }}
                onPointerDown={(e) => {
                  const x = e.clientX,
                    y = e.clientY,
                    el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  let dx = 0,
                    dy = 0;
                  const move = (ev: PointerEvent) => {
                    dx = (ev.clientX - x) / zoom;
                    dy = (ev.clientY - y) / zoom;
                    el.style.transform = `translate(${dx}px,${dy}px)`;
                  };
                  const end = () => {
                    el.style.transform = "";
                    el.removeEventListener("pointermove", move);
                    el.removeEventListener("pointerup", end);
                    el.removeEventListener("pointercancel", end);
                    if (Math.abs(dx) + Math.abs(dy) > 3)
                      commit({
                        nodes: sheet.nodes.map((v) =>
                          v.id === n.id
                            ? {
                                ...v,
                                x: Math.max(0, Math.min(1030, n.x + dx)),
                                y: Math.max(0, Math.min(740, n.y + dy)),
                              }
                            : v,
                        ),
                        edges: sheet.edges,
                      });
                    else {
                      setNode({ ...n });
                      setPanel("node");
                    }
                  };
                  el.addEventListener("pointermove", move);
                  el.addEventListener("pointerup", end);
                  el.addEventListener("pointercancel", end);
                }}
              >
                <small>{n.kind}</small>
                <strong>{n.label}</strong>
                {n.iaId && (
                  <small>{ia.find((i) => i.id === n.iaId)?.code}</small>
                )}
              </button>
            ))}
          </div>
        </div>
        {!sheet.nodes.length && (
          <div className="flow-empty">
            <EmptyState title="사용자 흐름을 추가해 주세요">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setPanel("import");
                  setBusy(false);
                }}
              >
                자료에서 가져오기
              </button>
            </EmptyState>
          </div>
        )}
      </div>
      {panel && (
        <Dialog
          title={
            panel === "node"
              ? "노드 편집"
              : panel === "edge"
                ? "연결 편집"
                : "흐름 가져오기"
          }
          side
          onClose={() => {
            setPanel(null);
            setBusy(false);
          }}
        >
          {panel === "node" && node && (
            <div className="field-stack">
              <Field label="유형">
                <select
                  value={node.kind}
                  onChange={(e) =>
                    setNode({
                      ...node,
                      kind: e.target.value as FlowNode["kind"],
                    })
                  }
                >
                  {["시작", "화면", "행동", "조건", "종료"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="내용">
                <input
                  value={node.label}
                  onChange={(e) => setNode({ ...node, label: e.target.value })}
                />
              </Field>
              <Field label="화면 ID">
                <select
                  value={node.iaId}
                  onChange={(e) => setNode({ ...node, iaId: e.target.value })}
                >
                  <option value="">연결 안 함</option>
                  {ia.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.code} · {x.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="button-row">
                {sheet.nodes.some((n) => n.id === node.id) && (
                  <IconButton
                    name="trash"
                    label="노드 삭제"
                    onClick={() => {
                      commit({
                        nodes: sheet.nodes.filter((n) => n.id !== node.id),
                        edges: sheet.edges.filter(
                          (e) => e.from !== node.id && e.to !== node.id,
                        ),
                      });
                      setPanel(null);
                    }}
                  />
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={!node.label.trim()}
                  onClick={() => {
                    commit({
                      nodes: sheet.nodes.some((n) => n.id === node.id)
                        ? sheet.nodes.map((n) => (n.id === node.id ? node : n))
                        : [...sheet.nodes, node],
                      edges: sheet.edges,
                    });
                    setPanel(null);
                  }}
                >
                  적용
                </button>
              </div>
            </div>
          )}
          {panel === "edge" && edge && (
            <div className="field-stack">
              {(["from", "to"] as const).map((key, i) => (
                <Field key={key} label={i ? "도착" : "출발"}>
                  <select
                    value={edge[key]}
                    onChange={(e) =>
                      setEdge({ ...edge, [key]: e.target.value })
                    }
                  >
                    {sheet.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
              <Field label="조건">
                <input
                  value={edge.label}
                  onChange={(e) => setEdge({ ...edge, label: e.target.value })}
                />
              </Field>
              <div className="button-row">
                {sheet.edges.some((e) => e.id === edge.id) && (
                  <IconButton
                    name="trash"
                    label="연결 삭제"
                    onClick={() => {
                      commit({
                        nodes: sheet.nodes,
                        edges: sheet.edges.filter((e) => e.id !== edge.id),
                      });
                      setPanel(null);
                    }}
                  />
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={edge.from === edge.to}
                  onClick={() => {
                    commit({
                      nodes: sheet.nodes,
                      edges: sheet.edges.some((e) => e.id === edge.id)
                        ? sheet.edges.map((e) => (e.id === edge.id ? edge : e))
                        : [...sheet.edges, edge],
                    });
                    setPanel(null);
                  }}
                >
                  적용
                </button>
              </div>
            </div>
          )}
          {panel === "import" && (
            <FlowImport
              busy={busy}
              draft={draft}
              onReady={() => {
                setBusy(false);
                setDraft(mockFlow(ia));
              }}
            >
              <input
                ref={file}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) analyze();
                  e.target.value = "";
                }}
              />
              {!draft && !busy && (
                <div className="field-stack">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => file.current?.click()}
                  >
                    <Icon name="image" />
                    이미지 선택
                  </button>
                  <button type="button" className="secondary" onClick={analyze}>
                    <Icon name="flow" />
                    Figma 화면 분석
                  </button>
                </div>
              )}
              {draft && (
                <>
                  <p className="field-hint">적용하면 현재 흐름이 교체됩니다.</p>
                  <div className="field-stack">
                    {draft.nodes.map((n) => (
                      <Field key={n.id} label={n.kind}>
                        <input
                          value={n.label}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              nodes: draft.nodes.map((x) =>
                                x.id === n.id
                                  ? { ...x, label: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </Field>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="primary full-width"
                    disabled={draft.nodes.some((n) => !n.label.trim())}
                    onClick={() => {
                      commit(draft);
                      setPanel(null);
                    }}
                  >
                    흐름 적용
                  </button>
                </>
              )}
            </FlowImport>
          )}
        </Dialog>
      )}
    </div>
  );
}

import { type ReactNode, useEffect } from "react";

function FlowImport({
  busy,
  onReady,
  children,
}: {
  busy: boolean;
  draft: unknown;
  onReady: () => void;
  children: ReactNode;
}) {
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => ready.current(), 1600);
    return () => clearTimeout(timer);
  }, [busy]);
  return (
    <>
      {busy ? (
        <div className="analysis-state" role="status">
          <span className="spinner" />
          <p>흐름 분석 중</p>
        </div>
      ) : (
        children
      )}
    </>
  );
}

export function TemplateLibrary({
  templates,
  onChange,
}: {
  templates: SheetTemplate[];
  onChange: (templates: SheetTemplate[]) => void;
}) {
  const [draft, setDraft] = useState<SheetTemplate | null>(null);
  const [confirm, setConfirm] = useState(false);
  const exists = draft && templates.some((t) => t.id === draft.id);
  const invalid =
    !draft?.name.trim() ||
    draft.columns.some((c) => !c.name.trim()) ||
    new Set(draft.columns.map((c) => c.name.trim())).size !==
      draft.columns.length;
  const save = () => {
    if (!draft || invalid) return;
    const updated = {
      ...draft,
      name: draft.name.trim(),
      version: exists ? draft.version + 1 : 1,
      columns: draft.columns.map((c) => ({ ...c, name: c.name.trim() })),
    };
    onChange(
      exists
        ? templates.map((t) => (t.id === updated.id ? updated : t))
        : [...templates, updated],
    );
    setConfirm(false);
    setDraft(null);
  };
  if (draft)
    return (
      <div className="template-page">
        <div className="page-title">
          <IconButton
            name="back"
            label="양식 목록"
            onClick={() => setDraft(null)}
          />
          <h1>{exists ? "양식 편집" : "양식 만들기"}</h1>
          <button
            type="button"
            className="primary template-save"
            disabled={invalid}
            onClick={() => (exists ? setConfirm(true) : save())}
          >
            {exists ? "변경 적용" : "양식 만들기"}
          </button>
        </div>
        <div className="template-fields">
          <Field label="양식 이름">
            <input
              value={draft.name}
              maxLength={100}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </Field>
          <Field label="용도">
            <input
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
            />
          </Field>
        </div>
        <ColumnsEditor
          columns={draft.columns}
          onChange={(columns) => setDraft({ ...draft, columns })}
          onDelete={(id) =>
            setDraft({
              ...draft,
              columns: draft.columns.filter((c) => c.id !== id),
            })
          }
        />
        {invalid && (
          <p className="field-hint">
            양식 이름과 항목 이름을 입력해 주세요. 항목 이름은 중복할 수
            없습니다.
          </p>
        )}
        {confirm && (
          <Dialog title="공용 양식 변경" onClose={() => setConfirm(false)}>
            <div className="field-stack">
              <p>
                변경한 양식은 새 시트부터 적용됩니다. 기존 시트는 바뀌지
                않습니다.
              </p>
              <button type="button" className="primary" onClick={save}>
                변경 적용
              </button>
            </div>
          </Dialog>
        )}
      </div>
    );
  return (
    <div className="collection-page">
      <div className="page-title">
        <h1>공용 양식</h1>
        <IconButton
          name="plus"
          label="양식 만들기"
          onClick={() =>
            setDraft({
              id: uid(),
              name: "",
              description: "",
              version: 1,
              columns: defaultColumns(),
            })
          }
        />
      </div>
      <div className="template-list">
        {templates.map((t) => (
          <button
            type="button"
            className="template-row"
            key={t.id}
            onClick={() => setDraft(clone(t))}
          >
            <span className="sheet-symbol">
              <Icon name="table" />
            </span>
            <div>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="template-field-names">
                {t.columns
                  .filter((c) => c.visible)
                  .map((c) => c.name)
                  .join(" · ")}
              </div>
            </div>
            <span className="template-version">v{t.version}</span>
            <Icon name="chevron" />
          </button>
        ))}
      </div>
    </div>
  );
}
