import { Input, Label, Textarea } from "@cheddar/ui";
import type { FieldErrors, ProjectForm } from "./model";

export function ProjectInfoEditor({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: ProjectForm;
  onChange: (value: ProjectForm) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="project-name">프로젝트 이름</Label>
        <Input
          id="project-name"
          value={value.name}
          onValueChange={(name) => onChange({ ...value, name })}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? "project-name-error" : undefined}
          maxLength={100}
        />
        {errors.name && (
          <p id="project-name-error" className="text-label text-danger">
            {errors.name}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-description">설명</Label>
        <Textarea
          id="project-description"
          value={value.description}
          onChange={(event) =>
            onChange({ ...value, description: event.target.value })
          }
          aria-invalid={!!errors.description}
          aria-describedby={
            errors.description ? "project-description-error" : undefined
          }
          maxLength={2000}
        />
        {errors.description && (
          <p id="project-description-error" className="text-label text-danger">
            {errors.description}
          </p>
        )}
      </div>
    </fieldset>
  );
}
