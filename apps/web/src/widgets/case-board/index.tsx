import { Badge, IconButton } from "@cheddar/ui";
import { Plus } from "lucide-react";
import { type DragEvent, useState } from "react";
import {
  type CaseGroup,
  type CaseOp,
  type CellValue,
  type Column,
  cellText,
  groupCases,
  readCell,
  type TestCase,
} from "@/entities/test-set";

/** 다른 열로 옮겼을 때의 새 값. 태그는 떠난 열의 태그를 빼고 들어간 열의 태그를 더한다. */
function movedValue(
  group: Column,
  current: CellValue | undefined,
  from: CaseGroup,
  to: CaseGroup,
): CellValue {
  if (group.type !== "tags") return to.value;
  // 태그 없음으로 옮기면 모든 태그를 비운다
  if (Array.isArray(to.value) && to.value.length === 0) return [];
  const tags = readCell(group, current) as string[];
  const removed = Array.isArray(from.value)
    ? tags.filter((t) => !(from.value as string[]).includes(t))
    : tags;
  const added = Array.isArray(to.value) ? to.value : [];
  return group.options.filter((o) => removed.includes(o) || added.includes(o));
}

export interface CaseBoardProps {
  columns: Column[];
  cases: TestCase[];
  /** 묶기 항목. 없으면 열 하나에 모두 놓는다. */
  groupColumnId: string | null;
  readOnly?: boolean;
  onOps: (ops: CaseOp[]) => void;
  onOpenCase: (caseId: string) => void;
  /** 그 열의 값으로 새 케이스를 만든다 */
  onAddCase?: (values: Record<string, CellValue>) => void;
}

/** 묶기 항목의 값마다 열을 두고 케이스를 카드로 놓는다. 카드를 다른 열로 끌면 그 값이 바뀐다. */
export function CaseBoard({
  columns,
  cases,
  groupColumnId,
  readOnly,
  onOps,
  onOpenCase,
  onAddCase,
}: CaseBoardProps) {
  const group = columns.find((c) => c.id === groupColumnId) ?? null;
  const lanes = groupCases(group, cases);
  const idColumn = columns.find((c) => c.systemKey === "test_id");
  const titleColumn = columns.find((c) => c.systemKey === "title");
  const metaColumn = columns.find((c) => !c.systemKey && c.type === "text");
  const tagColumns = columns.filter(
    (c) => c.type === "tags" && c.id !== group?.id,
  );
  const [dragging, setDragging] = useState<{
    caseId: string;
    from: string;
  } | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const drop = (event: DragEvent, to: CaseGroup) => {
    event.preventDefault();
    setOver(null);
    if (!dragging || !group || dragging.from === to.key) return;
    const from = lanes.find((l) => l.key === dragging.from);
    const moved = cases.find((c) => c.id === dragging.caseId);
    setDragging(null);
    if (!from || !moved) return;
    onOps([
      {
        type: "set_cell",
        caseId: moved.id,
        columnId: group.id,
        value: movedValue(group, moved.values[group.id], from, to),
      },
    ]);
  };

  return (
    <ul
      aria-label={group ? `${group.name}별 케이스` : "케이스"}
      className="m-0 flex list-none items-start gap-4 overflow-x-auto p-0 pb-2"
    >
      {lanes.map((lane) => (
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
          className={`flex w-80 shrink-0 flex-col gap-2 rounded-lg border p-3 transition-colors duration-fast ${
            over === lane.key && dragging?.from !== lane.key
              ? "border-accent bg-selected"
              : "border-transparent bg-subtle"
          }`}
        >
          <div className="flex min-h-7 items-center gap-2">
            <Badge dot={Boolean(group)}>{lane.label}</Badge>
            <span className="text-caption text-fg-muted tabular-nums">
              {lane.cases.length}
            </span>
            <span className="flex-1" />
            {onAddCase && !readOnly && (
              <IconButton
                icon={Plus}
                size="sm"
                label={`${lane.label} 케이스 추가`}
                onClick={() =>
                  onAddCase(group ? { [group.id]: lane.value } : {})
                }
              />
            )}
          </div>
          {lane.cases.map((c) => (
            <button
              key={c.id}
              aria-label={
                [
                  idColumn && cellText(idColumn, c.values[idColumn.id]),
                  titleColumn &&
                    cellText(titleColumn, c.values[titleColumn.id]),
                ]
                  .filter(Boolean)
                  .join(" ") || "제목 없는 케이스"
              }
              type="button"
              draggable={!readOnly && Boolean(group)}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                setDragging({ caseId: c.id, from: lane.key });
              }}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
              onClick={() => onOpenCase(c.id)}
              className={`flex flex-col gap-1.5 rounded-md border border-line bg-surface p-3 text-left outline-none transition-colors duration-fast hover:border-line-strong focus-visible:border-accent ${
                dragging?.caseId === c.id ? "text-fg-faint" : "text-fg"
              } ${!readOnly && group ? "cursor-grab" : ""}`}
            >
              {idColumn && (
                <span className="font-mono text-caption text-fg-muted">
                  {cellText(idColumn, c.values[idColumn.id])}
                </span>
              )}
              {titleColumn && (
                <span className="font-medium text-body-sm">
                  {cellText(titleColumn, c.values[titleColumn.id])}
                </span>
              )}
              {metaColumn && cellText(metaColumn, c.values[metaColumn.id]) && (
                <span className="line-clamp-2 text-caption text-fg-muted">
                  {cellText(metaColumn, c.values[metaColumn.id])}
                </span>
              )}
              {tagColumns.some(
                (t) => (readCell(t, c.values[t.id]) as string[]).length > 0,
              ) && (
                <span className="flex flex-wrap gap-1">
                  {tagColumns.flatMap((t) =>
                    (readCell(t, c.values[t.id]) as string[]).map((tag) => (
                      <Badge key={`${t.id}:${tag}`}>{tag}</Badge>
                    )),
                  )}
                </span>
              )}
            </button>
          ))}
        </li>
      ))}
    </ul>
  );
}
