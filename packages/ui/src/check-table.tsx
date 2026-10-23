import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Checkbox } from "./checkbox";
import { Icon } from "./icon";
import { cn } from "./utils";

const CHECK_WIDTH = 40;
const FLEX_MIN = 140;

export interface CheckTableColumn<Row> {
  id: string;
  header: ReactNode;
  /** px. 없으면 남은 너비를 나눈다 */
  width?: number;
  mono?: boolean;
  cell: (row: Row) => ReactNode;
}

export interface CheckTableGroup<Row> {
  id: string;
  label: string;
  rows: Row[];
}

export interface CheckTableProps<Row> {
  "aria-label": string;
  columns: CheckTableColumn<Row>[];
  groups: CheckTableGroup<Row>[];
  getRowId: (row: Row) => string;
  /** 체크박스 접근성 이름 */
  getRowLabel: (row: Row) => string;
  /** 고를 수 없는 행(이미 있는 항목 등) */
  isRowDisabled?: (row: Row) => boolean;
  selected: ReadonlySet<string>;
  onSelectedChange: (ids: Set<string>) => void;
  className?: string;
}

/**
 * 묶음별로 접고 펼치며 행을 고르는 표. 머리글과 묶음 줄의 체크박스는 그 안의 고를 수 있는 행을 한꺼번에 바꾼다.
 */
export function CheckTable<Row>({
  columns,
  groups,
  getRowId,
  getRowLabel,
  isRowDisabled = () => false,
  selected,
  onSelectedChange,
  className,
  ...rest
}: CheckTableProps<Row>) {
  const [closed, setClosed] = useState<ReadonlySet<string>>(new Set());
  const pickable = (rows: Row[]) =>
    rows.filter((row) => !isRowDisabled(row)).map(getRowId);
  const state = (ids: string[]) => {
    const on = ids.filter((id) => selected.has(id)).length;
    return {
      checked: ids.length > 0 && on === ids.length,
      indeterminate: on > 0 && on < ids.length,
    };
  };
  const setMany = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    onSelectedChange(next);
  };
  const all = groups.flatMap((group) => pickable(group.rows));
  const allState = state(all);

  return (
    <div
      className={cn(
        "overflow-x-auto rounded-lg border border-line bg-surface",
        className,
      )}
    >
      <table
        aria-label={rest["aria-label"]}
        className="w-full table-fixed border-separate border-spacing-0 text-body-sm"
        // 너비를 정하지 않은 열도 읽을 만큼은 두고, 좁으면 표 안에서 가로로 민다
        style={{
          minWidth: columns.reduce(
            (sum, column) => sum + (column.width ?? FLEX_MIN),
            CHECK_WIDTH,
          ),
        }}
      >
        <colgroup>
          <col style={{ width: CHECK_WIDTH }} />
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col" className="h-9 border-line border-b bg-subtle">
              <span className="grid place-items-center">
                <Checkbox
                  aria-label="전체 선택"
                  checked={allState.checked}
                  indeterminate={allState.indeterminate}
                  disabled={all.length === 0}
                  onCheckedChange={() => setMany(all, !allState.checked)}
                />
              </span>
            </th>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className="h-9 border-line border-b bg-subtle pr-3 text-left font-medium text-caption text-fg-muted"
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group) => {
          const ids = pickable(group.rows);
          const groupState = state(ids);
          const open = !closed.has(group.id);
          return (
            <tbody key={group.id}>
              <tr>
                <td className="h-9 border-line border-b bg-canvas">
                  <span className="grid place-items-center">
                    <Checkbox
                      aria-label={`${group.label} 전체 선택`}
                      checked={groupState.checked}
                      indeterminate={groupState.indeterminate}
                      disabled={ids.length === 0}
                      onCheckedChange={() => setMany(ids, !groupState.checked)}
                    />
                  </span>
                </td>
                <td
                  colSpan={columns.length}
                  className="h-9 border-line border-b bg-canvas pr-3"
                >
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => {
                      const next = new Set(closed);
                      if (open) next.add(group.id);
                      else next.delete(group.id);
                      setClosed(next);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-sm border-0 bg-transparent p-0 font-semibold text-body-sm text-fg"
                  >
                    <Icon
                      icon={ChevronDown}
                      size="sm"
                      className={cn(
                        "text-fg-muted transition-transform duration-base",
                        !open && "-rotate-90",
                      )}
                    />
                    {group.label}
                    <span className="font-normal text-fg-muted">
                      {group.rows.length}개
                    </span>
                  </button>
                </td>
              </tr>
              {open &&
                group.rows.map((row) => {
                  const id = getRowId(row);
                  const disabled = isRowDisabled(row);
                  const on = !disabled && selected.has(id);
                  return (
                    <tr key={id}>
                      <td className="h-9 border-line border-b">
                        <span className="grid place-items-center">
                          <Checkbox
                            aria-label={getRowLabel(row)}
                            checked={on}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              setMany([id], checked)
                            }
                          />
                        </span>
                      </td>
                      {columns.map((column) => (
                        <td
                          key={column.id}
                          className={cn(
                            "h-9 truncate border-line border-b pr-3 transition-colors duration-fast",
                            column.mono && "font-mono text-mono",
                            disabled
                              ? "text-fg-faint"
                              : on
                                ? "text-fg"
                                : "text-fg-muted",
                          )}
                        >
                          {column.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
            </tbody>
          );
        })}
      </table>
    </div>
  );
}
