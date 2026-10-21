import { Button, IconButton, SortableList, TextField } from "@cheddar/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import {
  type OptionDraft,
  optionDraft,
  validateOptions,
} from "@/entities/project";
import type { Column } from "@/entities/test-set";

/**
 * 선택과 태그 열의 항목을 그 자리에서 고친다. 완료하면 바뀐 항목 목록을 한 번에 돌려준다.
 * Excel의 목록처럼 항목을 바꾸거나 지워도 이미 입력된 셀 값은 그대로 남는다.
 */
export function OptionsPanel({
  column,
  onDone,
}: {
  column: Column;
  /** 바뀐 것이 없으면 undefined */
  onDone: (options: string[] | undefined) => void;
}) {
  // 연 시점의 항목. 고치지 않았으면 그사이 다른 사람이 바꾼 항목을 되돌리지 않도록 보내지 않는다.
  const [initial] = useState(() => column.options);
  const [items, setItems] = useState<OptionDraft[]>(() =>
    initial.map(optionDraft),
  );
  const [focusId, setFocusId] = useState<string | null>(null);
  const [error, setError] = useState<string | undefined>();
  const update = (next: OptionDraft[]) => {
    setItems(next);
    if (error) setError(undefined);
  };
  const add = () => {
    const next = optionDraft("");
    update([...items, next]);
    setFocusId(next.id);
  };
  const done = () => {
    const found = validateOptions(items);
    if (found) {
      setError(found);
      return;
    }
    const values = items.map((o) => o.value.trim());
    const changed =
      values.length !== initial.length ||
      values.some((v, i) => v !== initial[i]);
    onDone(changed ? values : undefined);
  };

  return (
    <div className="flex w-64 flex-col">
      <div className="max-h-72 overflow-auto p-1">
        <SortableList
          aria-label={`${column.name} 선택 항목`}
          items={items}
          getId={(o) => o.id}
          getHandleLabel={(o) => `${o.value.trim() || "빈 항목"} 순서 이동`}
          onReorder={update}
          itemClassName="group"
          renderItem={(o, handle) => (
            <div className="flex items-center gap-1 py-0.5">
              {handle}
              <TextField
                size="sm"
                aria-label="선택 항목 이름"
                className="min-w-0 flex-1"
                autoFocus={o.id === focusId}
                value={o.value}
                onChange={(e) =>
                  update(
                    items.map((x) =>
                      x.id === o.id ? { ...x, value: e.target.value } : x,
                    ),
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    done();
                  }
                }}
              />
              <IconButton
                icon={X}
                size="sm"
                label={`${o.value.trim() || "빈 항목"} 삭제`}
                className="opacity-0 transition-opacity duration-fast focus-visible:opacity-100 group-hover:opacity-100"
                onClick={() => update(items.filter((x) => x.id !== o.id))}
              />
            </div>
          )}
        />
      </div>
      {error && (
        <span role="alert" className="px-3 pb-2 text-caption text-danger">
          {error}
        </span>
      )}
      <div className="flex items-center justify-between gap-2 border-line border-t p-1">
        <Button variant="ghost" size="sm" icon={Plus} onClick={add}>
          항목 추가
        </Button>
        <Button variant="secondary" size="sm" onClick={done}>
          완료
        </Button>
      </div>
    </div>
  );
}
