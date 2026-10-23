import {
  Button,
  cn,
  DataGrid,
  type DataGridColumn,
  Dialog,
  DrawnCheck,
  IconButton,
} from "@cheddar/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import {
  type ColumnDraft,
  ColumnForm,
  type TemplateDraft,
} from "@/entities/project";

export interface ColumnModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 열기 전의 양식. 적용하기 전까지는 바꾸지 않는다. */
  value: TemplateDraft;
  onApply: (next: TemplateDraft) => void;
}

/** 자리만 보여주는 미리보기 행 */
const PREVIEW_ROWS = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

/**
 * 표 머리글 모양으로 열을 고른다. 머리글을 누르면 켜고 끄고, 끌어서 순서를 바꾸고, 끝의 +로 사용자 열을 더한다.
 */
export function ColumnModal({
  open,
  onOpenChange,
  value,
  onApply,
}: ColumnModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg" className="max-w-[1280px]">
        {open && (
          <ModalBody
            value={value}
            onCancel={() => onOpenChange(false)}
            onApply={(next) => {
              onApply(next);
              onOpenChange(false);
            }}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ModalBody({
  value,
  onCancel,
  onApply,
}: {
  value: TemplateDraft;
  onCancel: () => void;
  onApply: (next: TemplateDraft) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [adding, setAdding] = useState(false);
  const columns = draft.columns;
  const enabledCount = columns.filter((c) => c.enabled).length;
  const setColumns = (next: ColumnDraft[]) =>
    setDraft({ ...draft, columns: next });
  const toggle = (id: string) =>
    setColumns(
      columns.map((c) =>
        c.id === id && c.systemKey === null ? { ...c, enabled: !c.enabled } : c,
      ),
    );

  const gridColumns: DataGridColumn<{ id: string }>[] = columns.map((c) => ({
    id: c.id,
    width: c.systemKey === "title" ? 240 : 140,
    fixed: c.systemKey === "test_id",
    header: (
      <button
        type="button"
        aria-pressed={c.enabled}
        disabled={c.systemKey !== null}
        onClick={() => toggle(c.id)}
        className={cn(
          "flex w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left text-overline outline-none",
          c.enabled ? "text-fg" : "text-fg-faint",
        )}
      >
        <DrawnCheck
          drawn={c.enabled}
          size="sm"
          className={c.enabled ? "text-success" : "text-fg-faint"}
        />
        <span className="truncate">{c.name}</span>
      </button>
    ),
    cell: () => (
      <span
        className={cn("block h-4", !c.enabled && "opacity-0")}
        aria-hidden
      />
    ),
  }));

  return (
    <>
      <Dialog.Header
        title={
          <span className="flex items-baseline gap-2">
            <span>열</span>
            <span className="text-body-sm text-fg-muted tabular-nums">
              {columns.length}개 중 {enabledCount}개
            </span>
          </span>
        }
      />
      <Dialog.Body className="gap-3">
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={() => setAdding(true)}
          >
            열 추가
          </Button>
        </div>
        <DataGrid
          aria-label="열 미리보기"
          selection="none"
          columns={gridColumns}
          rows={PREVIEW_ROWS}
          getRowId={(r) => r.id}
          onColumnReorder={(ids) =>
            setColumns(
              ids
                .map((id) => columns.find((c) => c.id === id))
                .filter((c): c is ColumnDraft => c !== undefined),
            )
          }
          headerEnd={
            <IconButton
              icon={Plus}
              label="열 추가"
              size="sm"
              onClick={() => setAdding(true)}
            />
          }
          className="w-full"
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button variant="primary" onClick={() => onApply(draft)}>
          적용
        </Button>
      </Dialog.Footer>
      <Dialog.Root open={adding} onOpenChange={setAdding}>
        <Dialog.Content size="sm">
          {adding && (
            <ColumnForm
              column={null}
              others={columns}
              onSave={(column) => {
                setColumns([...columns, column]);
                setAdding(false);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
    </>
  );
}
