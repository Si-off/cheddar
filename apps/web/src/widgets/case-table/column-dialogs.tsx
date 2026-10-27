import { Button, Dialog, Switch, TextField } from "@workspace/ui";
import { type SubmitEvent, useState } from "react";
import {
  type ColumnDraft,
  ColumnForm,
  columnGroup,
  columnGroupLabel,
  optionDraft,
} from "@/entities/project";
import type { Column } from "@/entities/test-set";

/** 테스트 세트에 더할 열의 정의. 식별자는 호출한 쪽이 붙인다. */
export type NewColumn = Omit<Column, "id" | "systemKey">;

export interface AddColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 지금 표에 있는 열. 사전 정의 열은 이미 있는 것을 빼고 보여주고, 이름 중복을 막는다. */
  columns: Column[];
  /** 프로젝트 양식의 열. 없으면 직접 정의만 할 수 있다. */
  presets?: Column[];
  /** 0보다 크고 AI 채우기를 할 수 있으면 "기존 케이스 AI로 채우기"를 둔다 */
  fillableCount?: number;
  onAdd: (column: NewColumn, fill: boolean) => void;
}

const toDraft = (c: Column): ColumnDraft => ({
  ...c,
  enabled: true,
  options: c.options.map(optionDraft),
});

/** 사전 정의 열 중 아직 없는 것을 고르거나, 사용자 열을 직접 정의해 더한다. */
export function AddColumnDialog({
  open,
  onOpenChange,
  columns,
  presets,
  fillableCount = 0,
  onAdd,
}: AddColumnDialogProps) {
  const [custom, setCustom] = useState(false);
  const [fill, setFill] = useState(false);
  const present = new Set(columns.map((c) => c.presetKey));
  const available = (presets ?? []).filter(
    (p) => p.presetKey !== null && !present.has(p.presetKey),
  );
  const groups = (["ai", "qa"] as const)
    .map((g) => ({
      group: g,
      items: available.filter((p) => columnGroup(p) === g),
    }))
    .filter((g) => g.items.length > 0);
  const close = () => {
    onOpenChange(false);
    setCustom(false);
    setFill(false);
  };
  const add = (column: NewColumn) => {
    onAdd(column, fill && fillableCount > 0);
    close();
  };
  const fillSwitch = fillableCount > 0 && (
    <Switch
      label={`기존 케이스 ${fillableCount}개 AI로 채우기`}
      checked={fill}
      onCheckedChange={setFill}
    />
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <Dialog.Content size="sm">
        {open && custom ? (
          <ColumnForm
            column={null}
            others={columns.map(toDraft)}
            extra={fillSwitch || undefined}
            onSave={(draft) =>
              add({
                presetKey: null,
                name: draft.name.trim(),
                type: draft.type,
                description: draft.description.trim(),
                options: draft.options.map((o) => o.value.trim()),
              })
            }
          />
        ) : (
          open && (
            <>
              <Dialog.Header title="열 추가" />
              <Dialog.Body className="gap-4">
                {groups.map(({ group, items }) => (
                  <section
                    key={group}
                    aria-label={columnGroupLabel[group]}
                    className="flex flex-col gap-1"
                  >
                    <h3 className="m-0 px-2 text-overline text-fg-muted">
                      {columnGroupLabel[group]}
                    </h3>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {items.map((p) => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() =>
                              add({
                                presetKey: p.presetKey,
                                name: p.name,
                                type: p.type,
                                description: p.description,
                                options: p.options,
                              })
                            }
                            className="flex w-full flex-col items-start gap-0.5 rounded-md border-0 bg-transparent px-2 py-1.5 text-left transition-colors duration-fast hover:bg-subtle"
                          >
                            <span className="text-body text-fg">{p.name}</span>
                            {p.description && (
                              <span className="text-caption text-fg-muted">
                                {p.description}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </Dialog.Body>
              <Dialog.Footer>
                {fillSwitch}
                <span className="flex-1" />
                <Button variant="ghost" onClick={close}>
                  취소
                </Button>
                <Button variant="primary" onClick={() => setCustom(true)}>
                  직접 정의
                </Button>
              </Dialog.Footer>
            </>
          )
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

export interface RenameColumnDialogProps {
  column: Column | null;
  others: Column[];
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void;
}

/** 사용자 열의 이름과 작성 기준을 고친다. 형식은 값이 이미 있어 바꾸지 않는다. */
export function RenameColumnDialog({
  column,
  others,
  onOpenChange,
  onSave,
}: RenameColumnDialogProps) {
  return (
    <Dialog.Root
      open={column !== null}
      onOpenChange={(open) => !open && onOpenChange(false)}
    >
      <Dialog.Content size="sm">
        {column && (
          <RenameForm
            key={column.id}
            column={column}
            others={others}
            onSave={onSave}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function RenameForm({
  column,
  others,
  onSave,
}: {
  column: Column;
  others: Column[];
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState(column.name);
  const [description, setDescription] = useState(column.description);
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const error = !trimmed
    ? "열 이름을 입력하세요"
    : others.some((c) => c.id !== column.id && c.name === trimmed)
      ? "같은 이름의 열이 있습니다"
      : undefined;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (error) return;
    onSave(trimmed, description.trim());
  };
  return (
    <form onSubmit={submit} className="contents">
      <Dialog.Header title={column.name} />
      <Dialog.Body className="gap-4">
        <TextField
          label="열 이름"
          value={name}
          maxLength={50}
          autoFocus
          error={touched ? error : undefined}
          onChange={(e) => setName(e.target.value)}
        />
        <TextField
          label="작성 기준"
          value={description}
          maxLength={200}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button type="submit" variant="primary">
          저장
        </Button>
      </Dialog.Footer>
    </form>
  );
}
