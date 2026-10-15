import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Surface,
  Textarea,
} from "@cheddar/ui";
import type { IaItemDto } from "@/shared/api/generated";
import {
  type FieldErrors,
  forbiddenParents,
  type IaForm,
  orderedIa,
} from "./model";

export function IaEditor({
  items,
  selected,
  value,
  onChange,
  onSelect,
  onDelete,
  disabled,
  errors,
}: {
  items: IaItemDto[];
  selected: IaItemDto | null;
  value: IaForm;
  onChange: (value: IaForm) => void;
  onSelect: (item: IaItemDto | null) => void;
  onDelete: () => void;
  disabled: boolean;
  errors: FieldErrors;
}) {
  const blocked = forbiddenParents(items, selected?.id);
  const parents = [
    { value: "", label: "상위 항목 없음" },
    ...orderedIa(items)
      .filter(({ item }) => !blocked.has(item.id))
      .map(({ item }) => ({
        value: item.id,
        label: `${item.screenId} · ${item.name}`,
      })),
  ];
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Surface className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading font-heading">IA 목록</h2>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            IA 추가
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="text-label text-muted">등록된 IA가 없습니다.</p>
        ) : (
          <ul className="space-y-2" aria-label="IA 목록">
            {orderedIa(items).map(({ item, depth }) => (
              <li key={item.id}>
                <Button
                  variant={selected?.id === item.id ? "secondary" : "ghost"}
                  className="h-auto w-full justify-start whitespace-normal py-3 text-left"
                  aria-pressed={selected?.id === item.id}
                  disabled={disabled}
                  onClick={() => onSelect(item)}
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="break-all font-heading">
                      {depth > 0 ? "↳ " : ""}
                      {item.screenId}
                    </span>
                    <span className="break-all text-label">{item.name}</span>
                    {item.parentId && (
                      <span
                        className={
                          selected?.id === item.id
                            ? "text-caption text-secondary-foreground"
                            : "text-caption text-muted"
                        }
                      >
                        상위:{" "}
                        {items.find((parent) => parent.id === item.parentId)
                          ?.screenId ?? "—"}
                      </span>
                    )}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Surface>
      <Surface className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-heading font-heading">
            {selected ? "IA 편집" : "IA 추가"}
          </h2>
          {selected && (
            <Button
              variant="destructive"
              disabled={disabled}
              onClick={onDelete}
            >
              IA 삭제
            </Button>
          )}
        </div>
        <fieldset disabled={disabled} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ia-screen-id">화면 ID</Label>
            <Input
              id="ia-screen-id"
              value={value.screenId}
              onValueChange={(screenId) => onChange({ ...value, screenId })}
              maxLength={100}
              aria-invalid={!!errors.screenId}
              aria-describedby={
                errors.screenId ? "ia-screen-id-error" : undefined
              }
            />
            {errors.screenId && (
              <p
                id="ia-screen-id-error"
                role="alert"
                className="text-label text-danger"
              >
                {errors.screenId}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ia-name">화면 이름</Label>
            <Input
              id="ia-name"
              value={value.name}
              onValueChange={(name) => onChange({ ...value, name })}
              maxLength={100}
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "ia-name-error" : undefined}
            />
            {errors.name && (
              <p id="ia-name-error" className="text-label text-danger">
                {errors.name}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ia-parent">상위 항목</Label>
            <Select
              items={parents}
              value={value.parentId}
              onValueChange={(parentId) =>
                onChange({ ...value, parentId: parentId ?? "" })
              }
            >
              <SelectTrigger
                id="ia-parent"
                aria-invalid={!!errors.parentId}
                aria-describedby={
                  errors.parentId ? "ia-parent-error" : undefined
                }
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {parents.map((parent) => (
                  <SelectItem key={parent.value} value={parent.value}>
                    {parent.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.parentId && (
              <p
                id="ia-parent-error"
                role="alert"
                className="text-label text-danger"
              >
                {errors.parentId}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ia-position">순서</Label>
            <Input
              id="ia-position"
              type="number"
              min={0}
              step={1}
              value={value.position}
              onValueChange={(position) => onChange({ ...value, position })}
              aria-invalid={!!errors.position}
              aria-describedby={
                errors.position ? "ia-position-error" : undefined
              }
            />
            {errors.position && (
              <p id="ia-position-error" className="text-label text-danger">
                {errors.position}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ia-description">설명</Label>
            <Textarea
              id="ia-description"
              value={value.description}
              onChange={(event) =>
                onChange({ ...value, description: event.target.value })
              }
              maxLength={2000}
              aria-invalid={!!errors.description}
              aria-describedby={
                errors.description ? "ia-description-error" : undefined
              }
            />
            {errors.description && (
              <p id="ia-description-error" className="text-label text-danger">
                {errors.description}
              </p>
            )}
          </div>
        </fieldset>
      </Surface>
    </div>
  );
}
