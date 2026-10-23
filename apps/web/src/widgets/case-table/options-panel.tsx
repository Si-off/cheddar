import {
  Button,
  IconButton,
  SortableList,
  TextField,
  type Tone,
  TonePicker,
} from "@cheddar/ui";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import {
  type OptionDraft,
  optionDraft,
  validateOptions,
} from "@/entities/project";
import {
  type Column,
  type OptionColor,
  optionColor,
  optionTone,
} from "@/entities/test-set";

/** 바뀐 것만 담는다. 둘 다 없으면 보내지 않는다. */
export type OptionsChange = {
  options?: string[];
  colors?: Record<string, OptionColor>;
};

const colorOfTone = Object.fromEntries(
  Object.entries(optionTone).map(([color, tone]) => [tone, color]),
) as Record<Tone, OptionColor>;

/** 회색은 기본값이라 담지 않는다 */
const colorMap = (pairs: [string, OptionColor][]) =>
  Object.fromEntries(pairs.filter(([, c]) => c !== "gray"));
const sameColors = (
  a: Record<string, OptionColor>,
  b: Record<string, OptionColor>,
) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([k, v]) => b[k] === v);

/**
 * 선택과 태그 열의 항목과 칩 색을 그 자리에서 고친다. 완료하면 바뀐 것을 한 번에 돌려준다.
 * 스프레드시트의 목록처럼 항목을 바꾸거나 지워도 이미 입력된 셀 값은 그대로 남는다.
 */
export function OptionsPanel({
  column,
  onDone,
}: {
  column: Column;
  /** 바뀐 것이 없으면 undefined */
  onDone: (change: OptionsChange | undefined) => void;
}) {
  // 연 시점의 항목과 색. 고치지 않았으면 그사이 다른 사람이 바꾼 것을 되돌리지 않도록 보내지 않는다.
  const [initial] = useState(() => column.options);
  const [initialColors] = useState(() =>
    colorMap(column.options.map((o) => [o, optionColor(column, o)])),
  );
  const [items, setItems] = useState<OptionDraft[]>(() =>
    initial.map(optionDraft),
  );
  // 항목 이름을 고쳐도 색이 따라가도록 항목 id로 기억한다
  const [colors, setColors] = useState<Record<string, OptionColor>>(() =>
    Object.fromEntries(items.map((o) => [o.id, optionColor(column, o.value)])),
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
    const nextColors = colorMap(
      items.map((o) => [o.value.trim(), colors[o.id] ?? "gray"]),
    );
    const recolored = !sameColors(nextColors, initialColors);
    onDone(
      changed || recolored
        ? {
            ...(changed && { options: values }),
            // 이름을 고친 항목의 색이 따라가도록, 색이 있는 열이면 항목이 바뀔 때도 함께 보낸다
            ...((recolored ||
              (changed && Object.keys(nextColors).length > 0)) && {
              colors: nextColors,
            }),
          }
        : undefined,
    );
  };

  return (
    <div className="flex w-72 flex-col">
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
              <TonePicker
                label={`${o.value.trim() || "빈 항목"} 색`}
                value={optionTone[colors[o.id] ?? "gray"]}
                onChange={(tone) =>
                  setColors({ ...colors, [o.id]: colorOfTone[tone] })
                }
              />
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
