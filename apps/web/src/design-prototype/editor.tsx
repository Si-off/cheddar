import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "./art";
import { EmptyState, Field, IconButton } from "./components";
import { parseDelimited } from "./io";
import {
  type Candidate,
  type Column,
  cellValue,
  frames,
  type IAItem,
  type Result,
  type Sheet,
  type TestCase,
} from "./model";
export function CaseFields({
  item,
  ia,
  onChange,
  columns,
}: {
  item: TestCase;
  columns?: Column[];
  ia: IAItem[];
  onChange: (patch: Partial<TestCase>) => void;
}) {
  const label = (id: string, fallback: string) =>
    columns?.find((c) => c.id === id)?.name ?? fallback;
  return (
    <div className="field-stack">
      <Field label={label("title", "테스트 항목")}>
        <input
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field label={label("group", "기능 구분")}>
        <input
          value={item.group}
          onChange={(e) => onChange({ group: e.target.value })}
        />
      </Field>
      <Field label={label("precondition", "사전 조건")}>
        <textarea
          rows={2}
          value={item.precondition}
          onChange={(e) => onChange({ precondition: e.target.value })}
        />
      </Field>
      <Field label={label("data", "테스트 데이터")}>
        <textarea
          rows={2}
          value={item.data}
          onChange={(e) => onChange({ data: e.target.value })}
        />
      </Field>
      <Field label={label("steps", "수행 절차")}>
        <textarea
          rows={5}
          value={item.steps}
          onChange={(e) => onChange({ steps: e.target.value })}
        />
      </Field>
      <Field label={label("expected", "예상 결과")}>
        <textarea
          rows={4}
          value={item.expected}
          onChange={(e) => onChange({ expected: e.target.value })}
        />
      </Field>
      <Field label={label("priority", "우선순위")}>
        <select
          value={item.priority}
          onChange={(e) =>
            onChange({ priority: e.target.value as TestCase["priority"] })
          }
        >
          {["높음", "보통", "낮음", "미지정"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </Field>
      <fieldset>
        <legend>관련 화면</legend>
        {frames.map((f) => (
          <label className="choice-row" key={f.id}>
            <input
              type="checkbox"
              checked={item.frameIds.includes(f.id)}
              onChange={() =>
                onChange({
                  frameIds: item.frameIds.includes(f.id)
                    ? item.frameIds.filter((id) => id !== f.id)
                    : [...item.frameIds, f.id],
                })
              }
            />
            {f.name}
          </label>
        ))}
      </fieldset>
      {ia.length > 0 && (
        <fieldset>
          <legend>{label("iaIds", "화면 ID")}</legend>
          {ia.map((x) => (
            <label className="choice-row" key={x.id}>
              <input
                type="checkbox"
                checked={item.iaIds.includes(x.id)}
                onChange={() =>
                  onChange({
                    iaIds: item.iaIds.includes(x.id)
                      ? item.iaIds.filter((id) => id !== x.id)
                      : [...item.iaIds, x.id],
                  })
                }
              />
              {x.code} · {x.name}
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
function Cell({
  value,
  label,
  onChange,
  onKeyDown,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) {
      el.rows = Math.max(1, value.split("\n").length);
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}
export function SheetContent({
  sheet,
  ia,
  query,
  priority,
  readOnly = false,
  onPatch,
  onCase,
  onDetail,
  onSource,
  onNote,
  onDelete,
  onAdd,
}: {
  sheet: Sheet;
  ia: IAItem[];
  query: string;
  priority: string;
  readOnly?: boolean;
  onPatch: (p: Partial<Sheet>) => void;
  onCase: (id: string, p: Partial<TestCase>) => void;
  onDetail: (id: string) => void;
  onSource: (ids: string[]) => void;
  onNote: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onAdd: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const table = useRef<HTMLDivElement>(null);
  const items = sheet.cases.filter(
    (c) =>
      (priority === "all" || c.priority === priority) &&
      sheet.columns.some(
        (col) =>
          col.visible &&
          cellValue(c, col, ia).toLowerCase().includes(query.toLowerCase()),
      ),
  );
  const [expanded, setExpanded] = useState<string[]>([]);
  const columnName = (id: string, fallback: string) =>
    sheet.columns.find((c) => c.id === id)?.name ?? fallback;
  const cols = sheet.columns.filter((c) => c.visible);
  const locked = readOnly || sheet.generation === "running";
  const setCell = (item: TestCase, col: Column, value: string) => {
    if (col.custom)
      onCase(item.id, { extra: { ...item.extra, [col.id]: value } });
    else onCase(item.id, { [col.id]: value });
  };
  const resize = (id: string, width: number) =>
    onPatch({
      columns: sheet.columns.map((c) =>
        c.id === id ? { ...c, width: Math.max(72, Math.min(640, width)) } : c,
      ),
    });
  if (!items.length)
    return (
      <EmptyState
        title={
          query || priority !== "all"
            ? "검색 결과가 없습니다"
            : "테스트가 없습니다"
        }
      >
        {!locked && !query && priority === "all" && (
          <button type="button" className="primary" onClick={onAdd}>
            테스트 추가
          </button>
        )}
      </EmptyState>
    );
  if (sheet.layout === "qa") {
    return (
      <div className="qa-list">
        <div className="qa-list-heading">
          <span>{columnName("title", "테스트 항목")}</span>
          <span>테스트 결과</span>
        </div>
        {items.map((item) => {
          const isOpen = expanded.includes(item.id);
          return (
            <article
              className={`qa-list-item ${isOpen ? "is-open" : ""}`}
              key={item.id}
            >
              <div className="qa-list-row">
                <button
                  type="button"
                  className="qa-row-title"
                  aria-expanded={isOpen}
                  onClick={() => {
                    setExpanded((ids) =>
                      isOpen
                        ? ids.filter((id) => id !== item.id)
                        : [...ids, item.id],
                    );
                    onPatch({ activeId: item.id });
                  }}
                >
                  <Icon name={isOpen ? "down" : "chevron"} />
                  <span className="case-number">
                    TC-{String(item.number).padStart(3, "0")}
                  </span>
                  <span className="qa-row-name">
                    {item.title || "제목 없는 테스트"}
                  </span>
                </button>
                {!readOnly && (
                  <select
                    aria-label={`테스트 결과 ${item.number}`}
                    disabled={locked}
                    className={`qa-result-select result-${item.result}`}
                    value={item.result}
                    onChange={(e) =>
                      onCase(item.id, { result: e.target.value as Result })
                    }
                  >
                    {["미진행", "통과", "실패", "보류"].map((result) => (
                      <option key={result}>{result}</option>
                    ))}
                  </select>
                )}
                <IconButton
                  name={readOnly ? "file" : "expand"}
                  label={`상세 보기 TC-${item.number}`}
                  onClick={() => onDetail(item.id)}
                />
              </div>
              {isOpen && (
                <div className="qa-expanded">
                  {item.precondition && (
                    <div className="qa-precondition">
                      <span>{columnName("precondition", "사전 조건")}</span>
                      <p>{item.precondition}</p>
                    </div>
                  )}
                  {item.data && (
                    <div className="qa-precondition">
                      <span>{columnName("data", "테스트 데이터")}</span>
                      <p className="multiline">{item.data}</p>
                    </div>
                  )}
                  <div className="qa-expanded-columns">
                    <section>
                      <h3>{columnName("steps", "수행 절차")}</h3>
                      <p className="multiline">
                        {item.steps || "수행 절차가 없습니다."}
                      </p>
                    </section>
                    <section>
                      <h3>{columnName("expected", "예상 결과")}</h3>
                      <p className="multiline">
                        {item.expected || "예상 결과가 없습니다."}
                      </p>
                    </section>
                  </div>
                  <div className="qa-expanded-actions">
                    {!readOnly && item.frameIds.length > 0 && (
                      <button
                        type="button"
                        className="text-action"
                        onClick={() => onSource(item.frameIds)}
                      >
                        <Icon name="image" />
                        관련 화면 {item.frameIds.length}
                      </button>
                    )}
                    {!readOnly && (
                      <IconButton
                        name="file"
                        label={`메모 TC-${item.number}`}
                        onClick={() => onNote(item.id)}
                      />
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    );
  }
  return (
    <div
      className="spreadsheet"
      onCopy={(e) => {
        if (!selected.length || window.getSelection()?.toString()) return;
        const quote = (v: string) =>
          /[\t\n"]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
        e.clipboardData.setData(
          "text/plain",
          items
            .filter((c) => selected.includes(c.id))
            .map((c) =>
              cols.map((col) => quote(cellValue(c, col, ia))).join("\t"),
            )
            .join("\n"),
        );
        e.preventDefault();
      }}
    >
      {selected.length > 0 && (
        <div className="table-selection" aria-live="polite">
          {selected.length > 0 && (
            <>
              <span>{selected.length}개 선택</span>
              <IconButton
                name="trash"
                label="선택한 테스트 삭제"
                disabled={locked}
                onClick={() => {
                  onDelete(selected);
                  setSelected([]);
                }}
              />
              <IconButton
                name="close"
                label="선택 해제"
                onClick={() => setSelected([])}
              />
            </>
          )}
        </div>
      )}
      <div className="table-scroll" ref={table}>
        <table>
          <thead>
            <tr>
              {!readOnly && (
                <th className="selection-cell">
                  <input
                    type="checkbox"
                    aria-label="테스트 전체 선택"
                    checked={
                      items.length > 0 &&
                      items.every((c) => selected.includes(c.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? items.map((c) => c.id) : [],
                      )
                    }
                  />
                </th>
              )}
              {cols.map((col) => (
                <th
                  key={col.id}
                  style={{ width: col.width, minWidth: col.width }}
                >
                  <span className="column-label">
                    <span aria-hidden="true">
                      {col.id === "number"
                        ? "#"
                        : col.id === "title"
                          ? "Aa"
                          : col.id === "steps"
                            ? "≡"
                            : col.id === "expected"
                              ? "◎"
                              : col.id === "iaIds"
                                ? "↗"
                                : "·"}
                    </span>
                    {col.name}
                  </span>
                  {!locked && (
                    <button
                      type="button"
                      className="column-resize"
                      aria-label={`${col.name} 열 너비 조절`}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                          e.preventDefault();
                          resize(
                            col.id,
                            col.width + (e.key === "ArrowRight" ? 16 : -16),
                          );
                        }
                      }}
                      onPointerDown={(e) => {
                        const start = e.clientX,
                          width = col.width;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        const el = e.currentTarget;
                        const move = (ev: PointerEvent) =>
                          resize(col.id, width + ev.clientX - start);
                        const end = () => {
                          el.removeEventListener("pointermove", move);
                          el.removeEventListener("pointerup", end);
                          el.removeEventListener("pointercancel", end);
                        };
                        el.addEventListener("pointermove", move);
                        el.addEventListener("pointerup", end);
                        el.addEventListener("pointercancel", end);
                      }}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((item, row) => (
              <tr
                key={item.id}
                style={{ height: item.rowHeight }}
                className={selected.includes(item.id) ? "selected-row" : ""}
              >
                {!readOnly && (
                  <td className="selection-cell">
                    <input
                      type="checkbox"
                      aria-label={`TC-${item.number} 선택`}
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                    {!locked && (
                      <button
                        type="button"
                        className="row-resize"
                        aria-label={`TC-${item.number} 행 높이 조절`}
                        style={{ width: "100%" }}
                        onDoubleClick={() =>
                          onCase(item.id, { rowHeight: undefined })
                        }
                        onKeyDown={(e) => {
                          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const height =
                              e.currentTarget
                                .closest("tr")
                                ?.getBoundingClientRect().height ?? 48;
                            onCase(item.id, {
                              rowHeight: Math.max(
                                40,
                                height + (e.key === "ArrowDown" ? 16 : -16),
                              ),
                            });
                          }
                        }}
                        onPointerDown={(e) => {
                          const start = e.clientY,
                            height =
                              e.currentTarget
                                .closest("tr")
                                ?.getBoundingClientRect().height ?? 48;
                          const el = e.currentTarget;
                          el.setPointerCapture(e.pointerId);
                          const move = (ev: PointerEvent) =>
                            onCase(item.id, {
                              rowHeight: Math.max(
                                40,
                                Math.min(640, height + ev.clientY - start),
                              ),
                            });
                          const end = () => {
                            el.removeEventListener("pointermove", move);
                            el.removeEventListener("pointerup", end);
                            el.removeEventListener("pointercancel", end);
                          };
                          el.addEventListener("pointermove", move);
                          el.addEventListener("pointerup", end);
                          el.addEventListener("pointercancel", end);
                        }}
                      />
                    )}
                  </td>
                )}
                {cols.map((col, index) => (
                  <td
                    key={col.id}
                    className={`cell-${col.id}`}
                    onPaste={(e) => {
                      const text = e.clipboardData.getData("text");
                      if (locked || !text.includes("\t")) return;
                      e.preventDefault();
                      const pasted = parseDelimited(text, "\t");
                      const updated = sheet.cases.map((c) => ({
                        ...c,
                        extra: { ...c.extra },
                      }));
                      pasted.forEach((cells, ri) => {
                        const target = items[row + ri];
                        if (!target) return;
                        const next = updated.find((c) => c.id === target.id);
                        if (!next) return;
                        cells.forEach((value, ci) => {
                          const field = cols[index + ci];
                          if (
                            !field ||
                            ["number", "frameIds", "iaIds", "result"].includes(
                              field.id,
                            )
                          )
                            return;
                          if (
                            field.id === "priority" &&
                            !["높음", "보통", "낮음", "미지정"].includes(value)
                          )
                            return;
                          if (field.custom) next.extra[field.id] = value;
                          else Object.assign(next, { [field.id]: value });
                          next.result = "미진행";
                        });
                      });
                      onPatch({ cases: updated });
                    }}
                  >
                    {locked ||
                    ["number", "frameIds", "iaIds"].includes(col.id) ? (
                      <div className="cell-text">
                        {cellValue(item, col, ia)}
                      </div>
                    ) : col.id === "priority" || col.id === "result" ? (
                      <select
                        aria-label={`${col.name} ${item.number}`}
                        className={`cell-choice choice-${String(item[col.id as "priority" | "result"])}`}
                        value={String(item[col.id as "priority" | "result"])}
                        onChange={(e) => setCell(item, col, e.target.value)}
                      >
                        {(col.id === "priority"
                          ? ["미지정", "높음", "보통", "낮음"]
                          : ["미진행", "통과", "실패", "보류"]
                        ).map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                    ) : (
                      <Cell
                        label={`${col.name} ${item.number}`}
                        value={cellValue(item, col, ia)}
                        onChange={(value) => setCell(item, col, value)}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.shiftKey &&
                            !e.nativeEvent.isComposing
                          ) {
                            e.preventDefault();
                            const next =
                              e.currentTarget.closest("tr")?.nextElementSibling;
                            next
                              ?.querySelectorAll<HTMLTextAreaElement>(
                                "textarea",
                              )
                              [
                                Array.from(
                                  e.currentTarget
                                    .closest("tr")
                                    ?.querySelectorAll("textarea") ?? [],
                                ).indexOf(e.currentTarget)
                              ]?.focus();
                          }
                        }}
                      />
                    )}
                    {col.id === "title" && (
                      <span className="cell-open">
                        <IconButton
                          name="expand"
                          label={`상세 보기 TC-${item.number}`}
                          onClick={() => {
                            onPatch({ activeId: item.id });
                            onDetail(item.id);
                          }}
                        />
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <button
          type="button"
          className="table-add"
          onClick={onAdd}
          aria-label="테스트 추가"
        >
          <Icon name="plus" />새 테스트
        </button>
      )}
      <div className="table-count">{items.length}개</div>
    </div>
  );
}
export function CandidateReview({
  sheet,
  onChange,
  onEdit,
  onSource,
  onAdded,
  onOpenAdded,
}: {
  sheet: Sheet;
  onChange: (p: Partial<Sheet>) => void;
  onEdit: (id: string) => void;
  onSource: (ids: string[]) => void;
  onAdded: (id: string) => void;
  onOpenAdded: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Candidate["status"]>("pending");
  const list = sheet.candidates.filter((c) => c.status === filter);
  return (
    <div className="candidate-view">
      <div className="candidate-filter">
        <select
          aria-label="후보 상태"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value as Candidate["status"]);
          }}
        >
          <option value="pending">검토 대기</option>
          <option value="added">추가됨</option>
          <option value="excluded">제외됨</option>
        </select>
        <span className="muted">{list.length}개</span>
      </div>
      {!list.length ? (
        <EmptyState
          title={
            filter === "pending"
              ? "검토할 후보가 없습니다"
              : "해당하는 후보가 없습니다"
          }
        />
      ) : (
        list.map((item) => (
          <details className="candidate-card" key={item.id}>
            <summary>
              <Icon name="chevron" />
              <span>{item.title}</span>
              <span className="status-chip">{item.group}</span>
            </summary>
            <div className="candidate-body">
              <div className="candidate-reason">
                <Icon name="alert" />
                <p>{item.reason}</p>
              </div>
              <section>
                <h2>수행 절차</h2>
                <p className="preserve">{item.steps}</p>
              </section>
              <section>
                <h2>예상 결과</h2>
                <p>{item.expected}</p>
              </section>
              {item.frameIds.length > 0 && (
                <button
                  type="button"
                  className="text-action"
                  onClick={() => onSource(item.frameIds)}
                >
                  <Icon name="image" />
                  관련 화면
                  <Icon name="chevron" />
                </button>
              )}
              <footer className="candidate-actions">
                {item.status === "pending" ? (
                  <>
                    <IconButton
                      name="edit"
                      label="후보 편집"
                      onClick={() => onEdit(item.id)}
                    />
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        onChange({
                          candidates: sheet.candidates.map((c) =>
                            c.id === item.id ? { ...c, status: "excluded" } : c,
                          ),
                        })
                      }
                    >
                      제외
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (sheet.cases.some((c) => c.id === item.id)) return;
                        onChange({
                          cases: [
                            ...sheet.cases,
                            {
                              ...item,
                              number:
                                Math.max(
                                  0,
                                  ...sheet.cases.map((c) => c.number),
                                ) + 1,
                            },
                          ],
                          candidates: sheet.candidates.map((c) =>
                            c.id === item.id ? { ...c, status: "added" } : c,
                          ),
                        });
                        onAdded(item.id);
                      }}
                    >
                      시트에 추가
                      <Icon name="plus" />
                    </button>
                  </>
                ) : item.status === "excluded" ? (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onChange({
                        candidates: sheet.candidates.map((c) =>
                          c.id === item.id ? { ...c, status: "pending" } : c,
                        ),
                      })
                    }
                  >
                    다시 검토
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => onOpenAdded(item.id)}
                  >
                    추가된 테스트 보기
                    <Icon name="arrow" />
                  </button>
                )}
              </footer>
            </div>
          </details>
        ))
      )}
    </div>
  );
}
