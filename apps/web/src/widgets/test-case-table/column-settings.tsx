import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Textarea,
  WorkspaceIcon,
} from "@cheddar/ui";
import { useState } from "react";
import type { Column, Snapshot } from "@/entities/test-case";
import { WorkspaceSelect } from "@/shared/ui/workspace";
export function ColumnSettings({
  columns,
  view,
  disabled,
  hidden,
  onVisibility,
  onChange,
  onRemove,
  onClearValues,
  cases = [],
  appearance = "compact",
}: {
  appearance?: "compact" | "template";
  columns: Column[];
  cases?: Snapshot["cases"];
  view: Snapshot["view"];
  disabled?: boolean;
  hidden?: Set<string>;
  onVisibility?: (id: string) => void;
  onChange: (columns: Column[], view: Snapshot["view"]) => void;
  onRemove: (id: string) => void;
  onClearValues?: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string>();
  return (
    <div
      className={
        appearance === "template"
          ? "workspace-columns template-columns"
          : "workspace-columns"
      }
    >
      {view.map((entry, index) => {
        const column = columns.find((c) => c.id === entry.columnId);
        if (!column) return null;
        const values = cases.map((item) => item.customValues[column.id]);
        const hasValues = cases.some((item) =>
          Object.hasOwn(item.customValues, column.id),
        );
        const updateColumn = (update: Partial<Column>) =>
          onChange(
            columns.map((c) => (c.id === column.id ? { ...c, ...update } : c)),
            view,
          );
        return (
          <div
            className="workspace-column"
            key={column.id}
            data-editing={editing === column.id || undefined}
          >
            {onVisibility && (
              <Checkbox
                aria-label={`${column.name} 표시`}
                checked={!hidden?.has(column.id)}
                onCheckedChange={() => onVisibility(column.id)}
                disabled={
                  !hidden?.has(column.id) &&
                  columns.filter((column) => !hidden?.has(column.id)).length <=
                    1
                }
              />
            )}
            <Popover
              open={editing === column.id}
              onOpenChange={(open) => setEditing(open ? column.id : undefined)}
            >
              <PopoverTrigger
                render={
                  <Button
                    variant="ghost"
                    className="workspace-column-trigger"
                    aria-label={`${column.name} 설정`}
                  />
                }
              >
                {appearance === "template" && (
                  <span className="template-column-symbol" aria-hidden="true">
                    {column.field === "caseCode" ? (
                      "#"
                    ) : column.valueType === "checkbox" ? (
                      <WorkspaceIcon name="check" />
                    ) : column.valueType === "select" ? (
                      <WorkspaceIcon name="down" />
                    ) : column.valueType === "tags" ? (
                      <WorkspaceIcon name="columns" />
                    ) : (
                      "T"
                    )}
                  </span>
                )}
                <span className="template-column-name">{column.name}</span>
                {appearance === "template" && (
                  <span className="template-column-type">
                    {column.kind === "system"
                      ? "필수 열"
                      : {
                          text: "텍스트",
                          select: "선택",
                          checkbox: "체크박스",
                          tags: "태그",
                        }[column.valueType ?? "text"]}
                  </span>
                )}
                <WorkspaceIcon
                  name={appearance === "template" ? "more" : "chevron"}
                />
              </PopoverTrigger>
              <PopoverContent
                aria-label="열 설정"
                side={appearance === "template" ? "right" : undefined}
                align={appearance === "template" ? "center" : undefined}
                collisionAvoidance={
                  appearance === "template"
                    ? { side: "shift", align: "shift" }
                    : undefined
                }
                className={
                  appearance === "template"
                    ? "template-column-popover"
                    : undefined
                }
              >
                <div className="workspace-form-stack">
                  <Label htmlFor={`column-name-${column.id}`}>열 이름</Label>
                  <Input
                    id={`column-name-${column.id}`}
                    value={column.name}
                    maxLength={100}
                    disabled={disabled}
                    onValueChange={(name) =>
                      onChange(
                        columns.map((c) =>
                          c.id === column.id ? { ...c, name } : c,
                        ),
                        view,
                      )
                    }
                  />
                  {column.kind === "custom" && (
                    <>
                      <Label htmlFor={`column-type-${column.id}`}>형식</Label>
                      <WorkspaceSelect
                        id={`column-type-${column.id}`}
                        value={column.valueType ?? "text"}
                        disabled={disabled || hasValues}
                        options={[
                          { value: "text", label: "텍스트" },
                          { value: "select", label: "선택" },
                          { value: "checkbox", label: "체크박스" },
                          { value: "tags", label: "태그" },
                        ]}
                        onValueChange={(valueType) =>
                          updateColumn({
                            valueType: valueType as Column["valueType"],
                            options:
                              valueType === "select" || valueType === "tags"
                                ? (column.options ?? [])
                                : undefined,
                          })
                        }
                      />
                      {hasValues && (
                        <div>
                          <p className="text-caption text-muted">
                            값을 비우면 형식을 바꿀 수 있습니다.
                          </p>
                          {onClearValues && (
                            <Button
                              variant="ghost"
                              disabled={disabled}
                              onClick={() => {
                                setEditing(undefined);
                                onClearValues(column.id);
                              }}
                            >
                              값 비우기
                            </Button>
                          )}
                        </div>
                      )}
                      {(column.valueType === "select" ||
                        column.valueType === "tags") && (
                        <fieldset className="workspace-form-stack template-column-options">
                          <legend>선택 항목</legend>
                          {(column.options ?? []).map((option) => {
                            const used = values.some(
                              (value) =>
                                value === option.id ||
                                (Array.isArray(value) &&
                                  value.includes(option.id)),
                            );
                            return (
                              <div
                                key={option.id}
                                className="flex items-center gap-2"
                              >
                                <Input
                                  aria-label={`${option.name || "새 항목"} 이름`}
                                  value={option.name}
                                  disabled={disabled}
                                  maxLength={100}
                                  onValueChange={(name) =>
                                    updateColumn({
                                      options: column.options?.map((o) =>
                                        o.id === option.id ? { ...o, name } : o,
                                      ),
                                    })
                                  }
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`${option.name || "새 항목"} 삭제`}
                                  disabled={disabled || used}
                                  onClick={() =>
                                    updateColumn({
                                      options: column.options?.filter(
                                        (o) => o.id !== option.id,
                                      ),
                                    })
                                  }
                                >
                                  <WorkspaceIcon name="trash" />
                                </Button>
                                {used && (
                                  <span className="text-caption text-muted">
                                    사용 중
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          <Button
                            variant="ghost"
                            disabled={disabled}
                            onClick={() => {
                              let number = 1;
                              while (
                                column.options?.some(
                                  (option) => option.name === `항목 ${number}`,
                                )
                              )
                                number++;
                              updateColumn({
                                options: [
                                  ...(column.options ?? []),
                                  {
                                    id: crypto.randomUUID(),
                                    name: `항목 ${number}`,
                                  },
                                ],
                              });
                            }}
                          >
                            항목 추가
                          </Button>
                        </fieldset>
                      )}
                    </>
                  )}
                  {column.field !== "caseCode" && (
                    <>
                      <Label htmlFor={`column-description-${column.id}`}>
                        작성 기준
                      </Label>
                      <Textarea
                        id={`column-description-${column.id}`}
                        value={column.description ?? ""}
                        disabled={disabled}
                        maxLength={2000}
                        onChange={(event) =>
                          updateColumn({ description: event.target.value })
                        }
                      />
                    </>
                  )}
                  <Label htmlFor={`column-order-${column.id}`}>순서</Label>
                  <WorkspaceSelect
                    id={`column-order-${column.id}`}
                    value={String(index)}
                    disabled={disabled}
                    onValueChange={(value) => {
                      const next = view.filter((v) => v.columnId !== column.id);
                      next.splice(Number(value), 0, entry);
                      onChange(columns, next);
                    }}
                    options={view.map((_, i) => ({
                      value: String(i),
                      label: `${i + 1}번째`,
                    }))}
                  />
                  {column.kind === "custom" && (
                    <Button
                      variant="ghost"
                      className="template-column-delete"
                      disabled={disabled}
                      onClick={() => {
                        setEditing(undefined);
                        onRemove(column.id);
                      }}
                    >
                      <WorkspaceIcon name="trash" />열 삭제
                    </Button>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
      <Button
        variant="ghost"
        className={
          appearance === "template" ? "template-column-add" : undefined
        }
        disabled={disabled}
        onClick={() => {
          const id = crypto.randomUUID();
          onChange(
            [
              ...columns,
              { id, kind: "custom", valueType: "text", name: "새 열" },
            ],
            [...view, { columnId: id, width: 180 }],
          );
        }}
      >
        <WorkspaceIcon name="plus" />열 추가
      </Button>
    </div>
  );
}
