import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
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
}: {
  columns: Column[];
  view: Snapshot["view"];
  disabled?: boolean;
  hidden?: Set<string>;
  onVisibility?: (id: string) => void;
  onChange: (columns: Column[], view: Snapshot["view"]) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string>();
  return (
    <div className="workspace-columns">
      {view.map((entry, index) => {
        const column = columns.find((c) => c.id === entry.columnId);
        if (!column) return null;
        return (
          <div className="workspace-column" key={column.id}>
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
                <span>{column.name}</span>
                <WorkspaceIcon name="chevron" />
              </PopoverTrigger>
              <PopoverContent aria-label="열 설정">
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
