import { Button, Input, Label } from "@cheddar/ui";
import type { FieldErrors, TemplateForm } from "./model";

export function TemplateEditor({
  value,
  onChange,
  onRemove,
  errors,
  disabled,
}: {
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onRemove: (id: string) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  const move = (index: number, offset: number) => {
    const view = [...value.view];
    [view[index], view[index + offset]] = [view[index + offset], view[index]];
    onChange({ ...value, view });
  };
  const add = () => {
    const id = crypto.randomUUID();
    onChange({
      columns: [
        ...value.columns,
        { id, kind: "custom", valueType: "text", name: "새 열" },
      ],
      view: [...value.view, { columnId: id, width: "180" }],
    });
  };
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-label text-muted">
          변경한 양식은 새 시트에만 적용됩니다.
        </p>
        <Button variant="outline" disabled={disabled} onClick={add}>
          열 추가
        </Button>
      </div>
      <ol className="space-y-3" aria-label="기본 양식 열">
        {value.view.map((entry, index) => {
          const column = value.columns.find(
            (item) => item.id === entry.columnId,
          );
          if (!column) return null;
          return (
            <li
              key={column.id}
              className="rounded-panel border border-border bg-surface p-4"
            >
              <fieldset
                disabled={disabled}
                className="flex flex-wrap items-start gap-4"
              >
                <span className="pt-2 text-label text-muted" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={`column-name-${column.id}`}>열 이름</Label>
                  <Input
                    id={`column-name-${column.id}`}
                    value={column.name}
                    maxLength={100}
                    onValueChange={(name) =>
                      onChange({
                        ...value,
                        columns: value.columns.map((item) =>
                          item.id === column.id ? { ...item, name } : item,
                        ),
                      })
                    }
                    aria-invalid={!!errors[`name-${column.id}`]}
                    aria-describedby={
                      errors[`name-${column.id}`]
                        ? `name-error-${column.id}`
                        : undefined
                    }
                  />
                  {errors[`name-${column.id}`] && (
                    <p
                      id={`name-error-${column.id}`}
                      className="text-label text-danger"
                    >
                      {errors[`name-${column.id}`]}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`column-width-${column.id}`}>너비</Label>
                  <Input
                    id={`column-width-${column.id}`}
                    className="w-24"
                    type="number"
                    min={1}
                    step={1}
                    value={entry.width}
                    onValueChange={(width) =>
                      onChange({
                        ...value,
                        view: value.view.map((item) =>
                          item.columnId === column.id
                            ? { ...item, width }
                            : item,
                        ),
                      })
                    }
                    aria-invalid={!!errors[`width-${column.id}`]}
                    aria-describedby={
                      errors[`width-${column.id}`]
                        ? `width-error-${column.id}`
                        : undefined
                    }
                  />
                  {errors[`width-${column.id}`] && (
                    <p
                      id={`width-error-${column.id}`}
                      className="text-label text-danger"
                    >
                      {errors[`width-${column.id}`]}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 pt-8">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === 0}
                    aria-label={`${column.name} 위로`}
                    onClick={() => move(index, -1)}
                  >
                    위로
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={index === value.view.length - 1}
                    aria-label={`${column.name} 아래로`}
                    onClick={() => move(index, 1)}
                  >
                    아래로
                  </Button>
                  {column.kind === "custom" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      aria-label={`${column.name} 열 삭제`}
                      onClick={() => onRemove(column.id)}
                    >
                      삭제
                    </Button>
                  )}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
