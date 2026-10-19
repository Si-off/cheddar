import {
  Button,
  cn,
  IconButton,
  RadioGroup,
  SortableList,
  TextArea,
  TextField,
} from "@cheddar/ui";
import { CircleAlert, Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  type ColumnDraft,
  type ColumnErrors,
  type ColumnType,
  columnTypeLabel,
  hasOptions,
  type OptionDraft,
  optionDraft,
  type TemplateDraft,
} from "@/entities/project";

const MAX_COLUMNS = 50;

const typeOptions = (Object.keys(columnTypeLabel) as ColumnType[]).map(
  (value) => ({ value, label: columnTypeLabel[value] }),
);

export interface ColumnsEditorProps {
  value: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  /** 저장을 시도한 뒤에만 보여준다 */
  errors?: Record<string, ColumnErrors>;
  /** 오류가 있는 항목으로 옮길 때 바깥에서 고른다 */
  selectedId: string;
  onSelect: (id: string) => void;
  readOnly?: boolean;
}

/** 왼쪽 항목 목록과 오른쪽 항목 설정. 테스트 ID와 제목은 맨 앞에 고정한다. */
export function ColumnsEditor({
  value,
  onChange,
  errors = {},
  selectedId,
  onSelect,
  readOnly,
}: ColumnsEditorProps) {
  const system = value.columns.filter((c) => c.systemKey);
  const user = value.columns.filter((c) => !c.systemKey);
  const selected =
    value.columns.find((c) => c.id === selectedId) ?? value.columns[0];

  const setColumns = (columns: ColumnDraft[]) =>
    onChange({ ...value, columns });
  const update = (id: string, patch: Partial<ColumnDraft>) =>
    setColumns(
      value.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );

  const add = () => {
    let n = user.length + 1;
    const taken = new Set(value.columns.map((c) => c.name.trim()));
    while (taken.has(`새 항목 ${n}`)) n += 1;
    const column: ColumnDraft = {
      id: crypto.randomUUID(),
      systemKey: null,
      name: `새 항목 ${n}`,
      type: "text",
      description: "",
      options: [],
    };
    setColumns([...value.columns, column]);
    onSelect(column.id);
  };

  const remove = (id: string) => {
    const index = value.columns.findIndex((c) => c.id === id);
    const next = value.columns.filter((c) => c.id !== id);
    setColumns(next);
    onSelect(next[Math.min(index, next.length - 1)]?.id ?? "");
  };

  const row = (column: ColumnDraft, handle: ReactNode) => (
    <div
      className={cn(
        "flex items-center gap-1 rounded-md pr-3 pl-1 transition-colors duration-fast",
        column.id === selected?.id
          ? "bg-selected text-accent-text"
          : "hover:bg-subtle",
      )}
    >
      {handle ?? <span className="size-6 shrink-0" />}
      <button
        type="button"
        aria-current={column.id === selected?.id ? "true" : undefined}
        onClick={() => onSelect(column.id)}
        className="flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent py-2 text-left text-body-sm text-inherit outline-none"
      >
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            column.id === selected?.id && "font-medium",
          )}
        >
          {column.name.trim() || "이름 없음"}
        </span>
        {errors[column.id] && (
          <CircleAlert
            size={14}
            strokeWidth={1.75}
            className="text-danger"
            aria-label="확인할 내용 있음"
          />
        )}
        <span className="text-caption text-fg-muted">
          {column.systemKey ? "필수" : columnTypeLabel[column.type]}
        </span>
      </button>
    </div>
  );

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      <section className="rounded-lg border border-line bg-surface">
        <header className="flex items-center gap-2 border-line border-b px-4 py-3">
          <h2 className="m-0 flex-1 text-title-sm text-fg">항목</h2>
          {!readOnly && (
            <IconButton
              icon={Plus}
              label="항목 추가"
              size="sm"
              disabled={value.columns.length >= MAX_COLUMNS}
              onClick={add}
            />
          )}
        </header>
        <div className="flex flex-col p-1.5">
          <ul className="m-0 list-none p-0">
            {system.map((c) => (
              <li key={c.id} className="border-transparent border-y-2">
                {row(c, null)}
              </li>
            ))}
          </ul>
          <SortableList
            aria-label="사용자 항목"
            items={user}
            disabled={readOnly}
            getId={(c) => c.id}
            getHandleLabel={(c) => `${c.name.trim() || "이름 없음"} 순서 이동`}
            onReorder={(next) => setColumns([...system, ...next])}
            renderItem={row}
          />
        </div>
      </section>
      {selected && (
        <ColumnPanel
          key={selected.id}
          column={selected}
          errors={errors[selected.id]}
          readOnly={readOnly}
          onChange={(patch) => update(selected.id, patch)}
          onRemove={() => remove(selected.id)}
        />
      )}
    </div>
  );
}

function ColumnPanel({
  column,
  errors = {},
  readOnly,
  onChange,
  onRemove,
}: {
  column: ColumnDraft;
  errors?: ColumnErrors;
  readOnly?: boolean;
  onChange: (patch: Partial<ColumnDraft>) => void;
  onRemove: () => void;
}) {
  const fixed = Boolean(column.systemKey);
  const [focusOption, setFocusOption] = useState<string | null>(null);
  const setOptions = (options: OptionDraft[]) => onChange({ options });
  const addOption = () => {
    const next = optionDraft("");
    setOptions([...column.options, next]);
    setFocusOption(next.id);
  };

  return (
    <section className="min-w-0 rounded-lg border border-line bg-surface lg:col-span-2">
      <header className="flex items-center gap-2 border-line border-b px-5 py-3">
        <h2 className="m-0 min-w-0 flex-1 truncate text-title-sm text-fg">
          {column.name.trim() || "이름 없음"}
        </h2>
        {!readOnly && !fixed && (
          <Button variant="ghost" size="sm" icon={Trash2} onClick={onRemove}>
            항목 삭제
          </Button>
        )}
      </header>
      <div className="flex max-w-2xl flex-col gap-5 p-5">
        <TextField
          label="항목 이름"
          value={column.name}
          readOnly={readOnly || fixed}
          description={
            fixed ? "필수 항목은 이름을 바꿀 수 없습니다" : undefined
          }
          counter={`${column.name.trim().length}/100`}
          error={errors.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-label text-fg">값 형식</span>
          <RadioGroup
            aria-label="값 형식"
            orientation="horizontal"
            options={typeOptions}
            value={column.type}
            disabled={readOnly || fixed}
            onValueChange={(type) => {
              const next = type as ColumnType;
              onChange({
                type: next,
                options:
                  hasOptions(next) && column.options.length === 0
                    ? [optionDraft("")]
                    : column.options,
              });
            }}
          />
        </div>
        <TextArea
          label="작성 기준"
          description="AI가 이 항목을 채울 때 따르는 기준"
          rows={3}
          readOnly={readOnly}
          value={column.description}
          counter={`${column.description.trim().length}/2000`}
          error={errors.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
        {hasOptions(column.type) && (
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">선택 항목</span>
            <SortableList
              aria-label="선택 항목"
              items={column.options}
              disabled={readOnly}
              getId={(o) => o.id}
              getHandleLabel={(o) => `${o.value.trim() || "빈 항목"} 순서 이동`}
              onReorder={setOptions}
              renderItem={(o, handle) => (
                <div className="flex items-center gap-2 py-0.5">
                  {handle}
                  <TextField
                    size="sm"
                    aria-label="선택 항목 이름"
                    className="min-w-0 flex-1"
                    readOnly={readOnly}
                    autoFocus={o.id === focusOption}
                    value={o.value}
                    onChange={(e) =>
                      setOptions(
                        column.options.map((x) =>
                          x.id === o.id ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  {!readOnly && (
                    <IconButton
                      icon={X}
                      size="sm"
                      label={`${o.value.trim() || "빈 항목"} 삭제`}
                      onClick={() =>
                        setOptions(column.options.filter((x) => x.id !== o.id))
                      }
                    />
                  )}
                </div>
              )}
            />
            {errors.options && (
              <span role="alert" className="text-caption text-danger">
                {errors.options}
              </span>
            )}
            {!readOnly && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Plus}
                  onClick={addOption}
                >
                  선택 항목 추가
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
