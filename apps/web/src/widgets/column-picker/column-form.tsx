import {
  Button,
  Dialog,
  IconButton,
  RadioGroup,
  SortableList,
  TextArea,
  TextField,
} from "@cheddar/ui";
import { Plus, X } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import {
  type ColumnDraft,
  type ColumnErrors,
  type ColumnType,
  columnTypeLabel,
  hasOptions,
  optionDraft,
  validateTemplateDraft,
} from "@/entities/project";

const typeOptions = (Object.keys(columnTypeLabel) as ColumnType[]).map(
  (value) => ({ value, label: columnTypeLabel[value] }),
);

export interface ColumnFormProps {
  /** 없으면 새 사용자 열 */
  column: ColumnDraft | null;
  /** 이름 중복을 확인할 다른 열 */
  others: ColumnDraft[];
  pending?: boolean;
  onSave: (column: ColumnDraft) => void;
}

/** 사용자 열의 이름, 형식, 작성 기준, 선택 항목을 쓰는 대화상자 내용 */
export function ColumnForm({
  column,
  others,
  pending,
  onSave,
}: ColumnFormProps) {
  const [draft, setDraft] = useState<ColumnDraft>(
    column ?? {
      id: crypto.randomUUID(),
      presetKey: null,
      systemKey: null,
      enabled: true,
      name: "",
      type: "text",
      description: "",
      options: [],
    },
  );
  const [errors, setErrors] = useState<ColumnErrors | null>(null);
  const [focusOption, setFocusOption] = useState<string | null>(null);
  const setOptions = (options: ColumnDraft["options"]) =>
    setDraft({ ...draft, options });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateTemplateDraft({
      revision: 1,
      columns: [...others, draft],
    })[draft.id];
    setErrors(found ?? null);
    if (found) return;
    onSave(draft);
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <Dialog.Header title={column ? column.name : "사용자 열 추가"} />
      <Dialog.Body className="gap-5">
        <TextField
          label="이름"
          required
          autoFocus
          maxLength={100}
          counter={`${draft.name.trim().length}/100`}
          error={errors?.name}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <div className="flex flex-col gap-2">
          <span className="text-label text-fg">형식</span>
          <RadioGroup
            aria-label="형식"
            orientation="horizontal"
            options={typeOptions}
            value={draft.type}
            onValueChange={(type) => {
              const next = type as ColumnType;
              setDraft({
                ...draft,
                type: next,
                options:
                  hasOptions(next) && draft.options.length === 0
                    ? [optionDraft("")]
                    : draft.options,
              });
            }}
          />
        </div>
        <TextArea
          label="작성 기준"
          rows={3}
          maxLength={2000}
          counter={`${draft.description.trim().length}/2000`}
          error={errors?.description}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
        {hasOptions(draft.type) && (
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">선택 항목</span>
            <SortableList
              aria-label="선택 항목"
              items={draft.options}
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
                    autoFocus={o.id === focusOption}
                    value={o.value}
                    onChange={(e) =>
                      setOptions(
                        draft.options.map((x) =>
                          x.id === o.id ? { ...x, value: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <IconButton
                    icon={X}
                    size="sm"
                    label={`${o.value.trim() || "빈 항목"} 삭제`}
                    onClick={() =>
                      setOptions(draft.options.filter((x) => x.id !== o.id))
                    }
                  />
                </div>
              )}
            />
            {errors?.options && (
              <span role="alert" className="text-caption text-danger">
                {errors.options}
              </span>
            )}
            <div>
              <Button
                variant="ghost"
                size="sm"
                icon={Plus}
                onClick={() => {
                  const next = optionDraft("");
                  setOptions([...draft.options, next]);
                  setFocusOption(next.id);
                }}
              >
                선택 항목 추가
              </Button>
            </div>
          </div>
        )}
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button type="submit" variant="primary" loading={pending}>
          {column ? "저장" : "추가"}
        </Button>
      </Dialog.Footer>
    </form>
  );
}
