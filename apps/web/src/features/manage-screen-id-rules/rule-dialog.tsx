import {
  Button,
  ContextMenu,
  cn,
  Dialog,
  IconButton,
  Menu,
  Select,
} from "@cheddar/ui";
import { MoreHorizontal, Plus, Trash2, X } from "lucide-react";
import {
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
  useState,
} from "react";
import {
  type ScreenIdPartKind,
  type ScreenIdRule,
  type ScreenIdRuleInput,
  type ScreenIdRulePart,
  screenIdExampleParts,
  screenIdPartKindLabel,
} from "@/entities/project";

const MAX_PARTS = 8;

const digitItems = [1, 2, 3, 4, 5, 6].map((n) => ({
  value: String(n),
  label: `${n}자리`,
}));

const newPart = (kind: ScreenIdPartKind = "list"): ScreenIdRulePart => ({
  name: "",
  kind,
  codes: kind === "list" ? [{ code: "AAA", meaning: "" }] : [],
  value: kind === "fixed" ? "X" : "",
  digits: kind === "number" ? 3 : 0,
});

export interface ScreenIdRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 없으면 새 규칙 */
  rule: ScreenIdRule | null;
  pending?: boolean;
  onSave: (input: ScreenIdRuleInput) => void;
}

/** 예시 ID를 부분으로 나눠 보여주고, 부분을 눌러 코드 표나 자릿수를 고친다. */
export function ScreenIdRuleDialog({
  open,
  onOpenChange,
  rule,
  pending,
  onSave,
}: ScreenIdRuleDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        {open && (
          <RuleForm
            key={rule?.id ?? "new"}
            rule={rule}
            pending={pending}
            onSave={onSave}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function RuleForm({
  rule,
  pending,
  onSave,
}: {
  rule: ScreenIdRule | null;
  pending?: boolean;
  onSave: (input: ScreenIdRuleInput) => void;
}) {
  const [name, setName] = useState(rule?.name ?? "새 규칙");
  const [separator] = useState(rule?.separator ?? "_");
  const [parts, setParts] = useState<ScreenIdRulePart[]>(
    rule?.parts ?? [newPart("list"), newPart("number")],
  );
  const [renaming, setRenaming] = useState(false);
  const valid = isValidRule({ name, separator, parts });

  return (
    <>
      <Dialog.Header
        title={
          <span className="flex items-center gap-3">
            <span>화면 ID 규칙</span>
            {renaming ? (
              <InlineInput
                value={name}
                label="규칙 이름"
                onCommit={(v) => {
                  if (v.trim()) setName(v.trim());
                  setRenaming(false);
                }}
                onCancel={() => setRenaming(false)}
                className="w-48"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setRenaming(true)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setRenaming(true);
                  }
                }}
                aria-label={`규칙 이름 ${name} 변경`}
                className="cursor-text border-0 bg-transparent p-0 text-body-sm text-fg-muted"
              >
                {name}
              </button>
            )}
          </span>
        }
      />
      <Dialog.Body className="gap-6 py-6">
        <RuleParts
          parts={parts}
          separator={separator}
          onPartsChange={setParts}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          variant="primary"
          loading={pending}
          disabled={!valid}
          onClick={() => onSave({ name: name.trim(), separator, parts })}
        >
          저장
        </Button>
      </Dialog.Footer>
    </>
  );
}

/** 저장할 수 있는 규칙인지. 서버의 부분 값 검사와 같다. */
export function isValidRule({ name, parts }: ScreenIdRuleInput) {
  return (
    name.trim().length > 0 &&
    parts.length > 0 &&
    parts.every(
      (p) =>
        p.name.trim() &&
        (p.kind === "list"
          ? p.codes.length > 0 && p.codes.every((c) => c.code.trim())
          : p.kind === "fixed"
            ? p.value.trim()
            : p.digits >= 1),
    )
  );
}

/**
 * 예시 ID를 부분으로 나눠 보여주고, 고른 부분의 코드 표나 자릿수를 아래에 편다.
 * 부분을 바꾸면 전체 목록을 돌려준다. 다른 규칙으로 바꿀 때는 key를 바꿔 새로 그린다.
 */
export function RuleParts({
  parts,
  separator,
  onPartsChange: setParts,
}: {
  parts: ScreenIdRulePart[];
  separator: string;
  onPartsChange: (parts: ScreenIdRulePart[]) => void;
}) {
  const [selected, setSelected] = useState(0);
  // 부분은 이름이 겹칠 수 있어 화면용 식별자를 따로 둔다
  const [keys, setKeys] = useState(() =>
    parts.map((): string => crypto.randomUUID()),
  );
  const [renaming, setRenaming] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const examples = screenIdExampleParts({ parts });
  const current = parts[selected];

  const updatePart = (index: number, patch: Partial<ScreenIdRulePart>) =>
    setParts(parts.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  const insertPart = (at: number) => {
    if (parts.length >= MAX_PARTS) return;
    const next = [...parts];
    next.splice(at, 0, newPart());
    const nextKeys = [...keys];
    nextKeys.splice(at, 0, crypto.randomUUID());
    setParts(next);
    setKeys(nextKeys);
    setSelected(at);
    setRenaming(at);
  };
  const removePart = (index: number) => {
    if (parts.length <= 1) return;
    const next = parts.filter((_, i) => i !== index);
    setParts(next);
    setKeys(keys.filter((_, i) => i !== index));
    setSelected(Math.min(selected, next.length - 1));
  };
  const movePart = (from: number, to: number) => {
    if (from === to) return;
    const next = [...parts];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved as ScreenIdRulePart);
    const nextKeys = [...keys];
    const [movedKey] = nextKeys.splice(from, 1);
    nextKeys.splice(to, 0, movedKey as string);
    setParts(next);
    setKeys(nextKeys);
    setSelected(to);
  };
  const changeKind = (index: number, kind: ScreenIdPartKind) => {
    const part = parts[index];
    if (!part || part.kind === kind) return;
    // 종류에 맞지 않는 값은 비운다(서버가 그렇게 요구한다)
    updatePart(index, {
      kind,
      codes:
        kind !== "list"
          ? []
          : part.codes.length === 0
            ? newPart().codes
            : part.codes,
      value: kind !== "fixed" ? "" : part.value || "X",
      digits: kind !== "number" ? 0 : part.digits || 3,
    });
  };

  const partMenu = (index: number, part: ScreenIdRulePart) => (
    <>
      <Menu.Item onClick={() => setRenaming(index)}>이름 변경</Menu.Item>
      <Menu.Group>
        <Menu.GroupLabel>종류</Menu.GroupLabel>
        {(Object.keys(screenIdPartKindLabel) as ScreenIdPartKind[]).map(
          (kind) => (
            <Menu.CheckboxItem
              key={kind}
              closeOnClick
              checked={part.kind === kind}
              onCheckedChange={() => changeKind(index, kind)}
            >
              {screenIdPartKindLabel[kind]}
            </Menu.CheckboxItem>
          ),
        )}
      </Menu.Group>
      <Menu.Separator />
      <Menu.Item
        disabled={parts.length >= MAX_PARTS}
        onClick={() => insertPart(index)}
      >
        왼쪽에 부분 추가
      </Menu.Item>
      <Menu.Item
        disabled={parts.length >= MAX_PARTS}
        onClick={() => insertPart(index + 1)}
      >
        오른쪽에 부분 추가
      </Menu.Item>
      <Menu.Separator />
      <Menu.Item
        icon={Trash2}
        tone="danger"
        disabled={parts.length <= 1}
        onClick={() => removePart(index)}
      >
        삭제
      </Menu.Item>
    </>
  );

  return (
    <>
      <div className="flex justify-center">
        <fieldset
          aria-label="예시 ID"
          className="m-0 inline-flex rounded-md border border-line bg-surface p-0"
        >
          {parts.map((part, index) => {
            const on = index === selected;
            return (
              <ContextMenu.Root key={keys[index]}>
                <ContextMenu.Trigger
                  render={
                    // biome-ignore lint/a11y/noStaticElementInteractions: 끌기 이벤트만 받는 틀이며 조작은 안쪽 버튼이 맡는다
                    <div
                      draggable
                      onDragStart={(e: DragEvent) => {
                        e.dataTransfer.effectAllowed = "move";
                        setDrag(index);
                      }}
                      onDragOver={(e: DragEvent) => {
                        if (drag === null) return;
                        e.preventDefault();
                        setOver(index);
                      }}
                      onDrop={(e: DragEvent) => {
                        e.preventDefault();
                        if (drag !== null) movePart(drag, index);
                        setDrag(null);
                        setOver(null);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setOver(null);
                      }}
                      className={cn(
                        "group/part relative flex min-w-16 cursor-grab flex-col items-center gap-1 border-line border-r px-4 pt-2.5 pb-2 transition-colors duration-fast last:border-r-0",
                        on &&
                          "bg-selected shadow-[inset_0_-2px_0_var(--color-accent)]",
                        drag === index && "opacity-40",
                        over === index &&
                          drag !== index &&
                          "shadow-[inset_2px_0_0_var(--color-accent)]",
                      )}
                    />
                  }
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(index)}
                    onDoubleClick={() => setRenaming(index)}
                    className={cn(
                      "flex flex-col items-center gap-1 border-0 bg-transparent p-0 outline-none",
                      on ? "text-accent-text" : "text-fg",
                    )}
                  >
                    <span className="font-mono text-mono text-xl leading-7">
                      {examples[index] || "…"}
                    </span>
                    {renaming === index ? (
                      <InlineInput
                        value={part.name}
                        label="부분 이름"
                        onCommit={(v) => {
                          updatePart(index, { name: v.trim() });
                          setRenaming(null);
                        }}
                        onCancel={() => setRenaming(null)}
                        className="w-16 text-center"
                      />
                    ) : (
                      <span
                        className={cn(
                          "min-h-4 text-caption",
                          on ? "text-accent-text" : "text-fg-muted",
                        )}
                      >
                        {part.name || "이름 없음"}
                      </span>
                    )}
                  </button>
                  <span className="absolute top-1 right-1 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/part:opacity-100">
                    <Menu.Root>
                      <Menu.Trigger
                        render={
                          <IconButton
                            icon={MoreHorizontal}
                            label={`${part.name || "부분"} 작업`}
                            size="xs"
                          />
                        }
                      />
                      <Menu.Popup align="end">
                        {partMenu(index, part)}
                      </Menu.Popup>
                    </Menu.Root>
                  </span>
                </ContextMenu.Trigger>
                <ContextMenu.Popup aria-label={`${part.name || "부분"} 작업`}>
                  {partMenu(index, part)}
                </ContextMenu.Popup>
              </ContextMenu.Root>
            );
          })}
          <button
            type="button"
            aria-label="부분 추가"
            disabled={parts.length >= MAX_PARTS}
            onClick={() => insertPart(parts.length)}
            className="grid w-11 place-items-center border-0 border-line border-l bg-transparent text-fg-muted transition-colors duration-fast hover:text-fg disabled:opacity-50"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </fieldset>
      </div>

      {current && (
        <fieldset
          aria-label={current.name || "부분"}
          className="m-0 flex flex-col gap-4 border-0 p-0"
        >
          {current.kind === "number" && (
            <Select
              size="sm"
              aria-label="자릿수"
              className="w-32"
              items={digitItems}
              value={String(current.digits)}
              onValueChange={(v) =>
                updatePart(selected, { digits: Number(v ?? 3) })
              }
            />
          )}
          {current.kind === "fixed" && (
            <CodeGrid
              label="값"
              columns={["값"]}
              rows={[[current.value]]}
              onChange={(_, __, text) =>
                updatePart(selected, { value: text.trim() })
              }
            />
          )}
          {current.kind === "list" && (
            <CodeGrid
              label="코드"
              columns={["코드", "뜻"]}
              rows={current.codes.map((c) => [c.code, c.meaning])}
              onChange={(row, col, text) =>
                updatePart(selected, {
                  codes: current.codes.map((c, i) =>
                    i === row
                      ? col === 0
                        ? { ...c, code: text.trim() }
                        : { ...c, meaning: text.trim() }
                      : c,
                  ),
                })
              }
              onAdd={() =>
                updatePart(selected, {
                  codes: [...current.codes, { code: "", meaning: "" }],
                })
              }
              onRemove={(row) =>
                updatePart(selected, {
                  codes: current.codes.filter((_, i) => i !== row),
                })
              }
            />
          )}
        </fieldset>
      )}
      <span className="sr-only">
        구분 기호 {separator || "없음"}, 예시 {examples.join(separator)}
      </span>
    </>
  );
}

/** 제자리 편집 입력. Enter로 확정, Esc로 취소, 포커스가 나가면 확정한다. */
export function InlineInput({
  value,
  label,
  onCommit,
  onCancel,
  className,
}: {
  value: string;
  label: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <input
      // biome-ignore lint/a11y/noAutofocus: 두 번 눌러 연 입력이라 바로 쓸 수 있어야 한다
      autoFocus
      aria-label={label}
      defaultValue={value}
      onBlur={(e) => onCommit(e.currentTarget.value)}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onCommit(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      className={cn(
        "h-6 rounded-xs border-0 border-accent border-b bg-transparent px-1 text-body-sm text-fg outline-none",
        className,
      )}
    />
  );
}

/**
 * 셀을 눌러 그 자리에서 고치는 작은 표. 마지막 줄의 +로 행을 더하고, 행에 올리면 × 가 보인다.
 */
function CodeGrid({
  label,
  columns,
  rows,
  onChange,
  onAdd,
  onRemove,
}: {
  label: string;
  columns: string[];
  rows: string[][];
  onChange: (row: number, col: number, text: string) => void;
  onAdd?: () => void;
  onRemove?: (row: number) => void;
}) {
  const [editing, setEditing] = useState<{ row: number; col: number } | null>(
    null,
  );
  const cell = (row: number, col: number, text: string): ReactNode => {
    const on = editing?.row === row && editing.col === col;
    return (
      <td
        key={col}
        className={cn(
          "h-8 border-line border-b px-0 align-middle",
          col === 0 && "border-r font-mono text-mono",
          col < columns.length - 1 && "border-r",
          on &&
            "relative z-10 bg-selected outline-2 -outline-offset-1 outline-accent",
        )}
      >
        {on ? (
          <input
            // biome-ignore lint/a11y/noAutofocus: 셀을 눌러 연 입력이라 바로 쓸 수 있어야 한다
            autoFocus
            aria-label={`${columns[col]} 입력`}
            defaultValue={text}
            onBlur={(e) => {
              onChange(row, col, e.currentTarget.value);
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onChange(row, col, e.currentTarget.value);
                setEditing(null);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(null);
              }
            }}
            className="h-8 w-full border-0 bg-transparent px-3 font-[inherit] text-[inherit] outline-none"
          />
        ) : (
          <button
            type="button"
            aria-label={`${columns[col]} ${text || "비어 있음"}`}
            onClick={() => setEditing({ row, col })}
            className="flex h-8 w-full items-center border-0 bg-transparent px-3 text-left text-body-sm text-fg outline-none focus-visible:bg-subtle"
          >
            {text}
          </button>
        )}
      </td>
    );
  };
  return (
    <table
      aria-label={label}
      className="w-full table-fixed border-separate border-spacing-0 overflow-hidden rounded-lg border border-line bg-surface text-body-sm"
    >
      <colgroup>
        {columns.map((c, i) => (
          <col
            key={c}
            style={{ width: i === 0 && columns.length > 1 ? 140 : undefined }}
          />
        ))}
        {onRemove && <col style={{ width: 40 }} />}
      </colgroup>
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th
              key={c}
              scope="col"
              className={cn(
                "h-8 border-line border-b bg-subtle px-3 text-left text-overline text-fg-muted",
                i < columns.length - 1 && "border-r",
              )}
            >
              {c}
            </th>
          ))}
          {onRemove && <th className="border-line border-b bg-subtle" />}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 행은 위치로만 구분한다
          <tr key={r} className="group/row">
            {row.map((text, c) => cell(r, c, text))}
            {onRemove && (
              <td className="border-line border-b text-center align-middle">
                <IconButton
                  icon={X}
                  size="sm"
                  label={`${row[0] || "빈 행"} 삭제`}
                  onClick={() => onRemove(r)}
                  className="opacity-0 group-focus-within/row:opacity-100 group-hover/row:opacity-100"
                />
              </td>
            )}
          </tr>
        ))}
        {onAdd && (
          <tr>
            <td colSpan={columns.length + 1} className="p-0">
              <button
                type="button"
                aria-label={`${label} 추가`}
                onClick={onAdd}
                className="grid h-9 w-full place-items-center border-0 bg-transparent text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg"
              >
                <Plus size={16} strokeWidth={1.75} aria-hidden />
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
