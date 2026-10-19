import { hasOptions, type Template, type TemplateColumn } from "./model";

export interface OptionDraft {
  id: string;
  value: string;
}

/** 편집 중인 항목. 선택 항목은 순서를 바꾸고 지울 수 있도록 각각 식별자를 둔다. */
export interface ColumnDraft extends Omit<TemplateColumn, "options"> {
  options: OptionDraft[];
}

export interface TemplateDraft {
  revision: number;
  columns: ColumnDraft[];
}

export const optionDraft = (value: string): OptionDraft => ({
  id: crypto.randomUUID(),
  value,
});

export function toTemplateDraft(template: Template): TemplateDraft {
  return {
    revision: template.revision,
    columns: template.columns.map((c) => ({
      ...c,
      options: c.options.map(optionDraft),
    })),
  };
}

/** 저장할 값. 값 목록이 없는 형식은 선택 항목을 버린다. */
export function fromTemplateDraft(draft: TemplateDraft): Template {
  return {
    revision: draft.revision,
    columns: draft.columns.map((c) => ({
      ...c,
      name: c.name.trim(),
      description: c.description.trim(),
      options: hasOptions(c.type) ? c.options.map((o) => o.value.trim()) : [],
    })),
  };
}

export interface ColumnErrors {
  name?: string;
  description?: string;
  options?: string;
}

/** 서버와 같은 조건으로 확인한다. 오류가 없으면 빈 객체. */
export function validateTemplateDraft(draft: TemplateDraft) {
  const errors: Record<string, ColumnErrors> = {};
  const names = new Map<string, number>();
  for (const c of draft.columns) {
    const name = c.name.trim();
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  for (const c of draft.columns) {
    const found: ColumnErrors = {};
    const name = c.name.trim();
    if (!name) found.name = "항목 이름을 입력하세요";
    else if (name.length > 100) found.name = "100자 이하로 입력하세요";
    else if ((names.get(name) ?? 0) > 1)
      found.name = "같은 이름의 항목이 있습니다";
    if (c.description.trim().length > 2000)
      found.description = "2000자 이하로 입력하세요";
    if (hasOptions(c.type)) {
      const values = c.options.map((o) => o.value.trim());
      if (values.length === 0)
        found.options = "선택 항목을 하나 이상 추가하세요";
      else if (values.some((v) => !v))
        found.options = "빈 선택 항목이 있습니다";
      else if (values.some((v) => v.length > 100))
        found.options = "선택 항목은 100자 이하로 입력하세요";
      else if (new Set(values).size !== values.length)
        found.options = "같은 선택 항목이 있습니다";
      else if (values.length > 50)
        found.options = "선택 항목은 50개까지 둘 수 있습니다";
    }
    if (Object.keys(found).length > 0) errors[c.id] = found;
  }
  return errors;
}
