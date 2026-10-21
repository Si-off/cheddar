import {
  Button,
  ConfirmDialog,
  cn,
  Dialog,
  IconButton,
  Menu,
  SortableList,
  Switch,
} from "@cheddar/ui";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type ColumnDraft,
  ColumnForm,
  type ColumnGroup,
  columnGroup,
  columnGroupLabel,
  type TemplateDraft,
} from "@/entities/project";

export interface ColumnPickerProps {
  value: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  readOnly?: boolean;
  /** 사용자 열을 지울 때 함께 지워지는 값이 있으면 그 설명. 없으면 바로 지운다. */
  describeRemoval?: (column: ColumnDraft) => string | undefined;
  className?: string;
}

/**
 * 양식의 열 목록. 사전 정의 열은 켜고 끄기만, 사용자 열은 추가·편집·삭제·순서 변경을 한다.
 * 프로젝트 양식 탭과 새 테스트 세트의 열 고르기가 같이 쓴다.
 */
export function ColumnPicker({
  value,
  onChange,
  readOnly,
  describeRemoval,
  className,
}: ColumnPickerProps) {
  const [editing, setEditing] = useState<ColumnDraft | "new" | null>(null);
  const [removing, setRemoving] = useState<ColumnDraft | null>(null);
  const columns = value.columns;
  const setColumns = (next: ColumnDraft[]) =>
    onChange({ ...value, columns: next });
  const byGroup = (group: ColumnGroup) =>
    columns.filter((c) => columnGroup(c) === group);
  const custom = byGroup("custom");

  const toggle = (id: string, enabled: boolean) =>
    setColumns(columns.map((c) => (c.id === id ? { ...c, enabled } : c)));
  const upsert = (column: ColumnDraft) => {
    const exists = columns.some((c) => c.id === column.id);
    setColumns(
      exists
        ? columns.map((c) => (c.id === column.id ? column : c))
        : [...columns, column],
    );
    setEditing(null);
  };
  const remove = (column: ColumnDraft) =>
    setColumns(columns.filter((c) => c.id !== column.id));
  const askRemove = (column: ColumnDraft) => {
    if (describeRemoval?.(column)) setRemoving(column);
    else remove(column);
  };

  const row = (column: ColumnDraft, handle?: ReactNode) => (
    <div
      className={cn(
        "flex items-center gap-4 px-4 py-3",
        !column.enabled && "text-fg-faint",
      )}
    >
      {handle}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body text-inherit">{column.name}</span>
        {column.description && (
          <span className="text-body-sm text-fg-muted">
            {column.description}
          </span>
        )}
      </div>
      {!readOnly && column.presetKey === null && (
        <Menu.Root>
          <Menu.Trigger
            render={
              <IconButton
                icon={MoreHorizontal}
                label={`${column.name} 작업`}
                size="sm"
              />
            }
          />
          <Menu.Popup align="end">
            <Menu.Item onClick={() => setEditing(column)}>편집</Menu.Item>
            <Menu.Separator />
            <Menu.Item
              icon={Trash2}
              tone="danger"
              onClick={() => askRemove(column)}
            >
              삭제
            </Menu.Item>
          </Menu.Popup>
        </Menu.Root>
      )}
      <Switch
        aria-label={column.name}
        checked={column.enabled}
        disabled={readOnly || column.systemKey !== null}
        onCheckedChange={(enabled) => toggle(column.id, enabled)}
      />
    </div>
  );

  const section = (group: ColumnGroup, body: ReactNode, action?: ReactNode) => (
    <section
      aria-label={columnGroupLabel[group]}
      className="overflow-hidden rounded-lg border border-line bg-surface"
    >
      <header className="flex min-h-10 items-center gap-2 border-line border-b bg-subtle py-1 pr-2 pl-4">
        <h3 className="m-0 flex-1 text-label text-fg">
          {columnGroupLabel[group]}
        </h3>
        {action}
      </header>
      {body}
    </section>
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {(["ai", "qa"] as const).map((group) =>
        section(
          group,
          <ul className="m-0 list-none divide-y divide-line p-0">
            {byGroup(group).map((c) => (
              <li key={c.id}>{row(c)}</li>
            ))}
          </ul>,
        ),
      )}
      {section(
        "custom",
        <>
          <SortableList
            aria-label="사용자 열"
            items={custom}
            disabled={readOnly}
            getId={(c) => c.id}
            getHandleLabel={(c) => `${c.name} 순서 이동`}
            onReorder={(next) =>
              setColumns([...byGroup("ai"), ...byGroup("qa"), ...next])
            }
            divided
            renderItem={(c, handle) => row(c, handle)}
          />
          {!readOnly && (
            <button
              type="button"
              aria-label="사용자 열 추가"
              onClick={() => setEditing("new")}
              className={cn(
                "grid min-h-10 w-full place-items-center border-0 bg-transparent text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg",
                custom.length > 0 && "border-line border-t",
              )}
            >
              <Plus size={16} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </>,
        !readOnly && (
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={() => setEditing("new")}
          >
            열 추가
          </Button>
        ),
      )}
      <Dialog.Root
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <Dialog.Content size="sm">
          {editing && (
            <ColumnForm
              key={editing === "new" ? "new" : editing.id}
              column={editing === "new" ? null : editing}
              others={columns.filter(
                (c) => editing === "new" || c.id !== editing.id,
              )}
              onSave={upsert}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`${removing?.name ?? ""} 삭제`}
        description={removing ? describeRemoval?.(removing) : undefined}
        confirmLabel="삭제"
        tone="danger"
        onConfirm={() => {
          if (removing) remove(removing);
          setRemoving(null);
        }}
      />
    </div>
  );
}
