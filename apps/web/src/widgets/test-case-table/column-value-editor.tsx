import { Button, Checkbox, Label, Textarea } from "@cheddar/ui";
import type { Column, ColumnValue } from "@/entities/test-case";
import { WorkspaceSelect } from "@/shared/ui/workspace";

export function ColumnValueEditor({
  id,
  column,
  value,
  disabled,
  onChange,
  onComposition,
  onDone,
}: {
  id: string;
  column: Column;
  value: ColumnValue | undefined;
  disabled?: boolean;
  onChange: (value: ColumnValue) => void;
  onComposition?: (active: boolean) => void;
  onDone?: () => void;
}) {
  if (column.valueType === "checkbox")
    return (
      <Checkbox
        id={id}
        aria-label={column.name}
        disabled={disabled}
        checked={value === true}
        onCheckedChange={(checked) => {
          onChange(checked === true);
          onDone?.();
        }}
      />
    );
  if (column.valueType === "select")
    return (
      <WorkspaceSelect
        id={id}
        label={column.name}
        disabled={disabled}
        value={typeof value === "string" ? value : ""}
        options={[
          { value: "", label: "미지정" },
          ...(column.options ?? []).map((option) => ({
            value: option.id,
            label: option.name,
          })),
        ]}
        onValueChange={(next) => {
          onChange(next || null);
          onDone?.();
        }}
      />
    );
  if (column.valueType === "tags")
    return (
      <fieldset
        id={id}
        disabled={disabled}
        className="workspace-form-stack"
        aria-label={column.name}
      >
        {(column.options ?? []).map((option) => (
          <Label key={option.id}>
            <Checkbox
              checked={Array.isArray(value) && value.includes(option.id)}
              onCheckedChange={(checked) => {
                const selected = Array.isArray(value) ? value : [];
                onChange(
                  checked
                    ? [...new Set([...selected, option.id])]
                    : selected.filter((id) => id !== option.id),
                );
              }}
            />
            {option.name}
          </Label>
        ))}
        {onDone && (
          <Button variant="ghost" onClick={onDone}>
            완료
          </Button>
        )}
      </fieldset>
    );
  return (
    <Textarea
      id={id}
      aria-label={column.name}
      disabled={disabled}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
      onCompositionStart={() => onComposition?.(true)}
      onCompositionEnd={() => onComposition?.(false)}
      onBlur={() => onComposition?.(false)}
    />
  );
}
