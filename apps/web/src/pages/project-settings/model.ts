import type {
  IaItemDto,
  ProjectDto,
  ProjectTemplateDto,
  SheetColumnDto,
} from "@/shared/api/generated";

export type ProjectForm = { name: string; description: string };
export type IaForm = {
  screenId: string;
  name: string;
  description: string;
  parentId: string;
  position: string;
};
export type TemplateForm = {
  columns: SheetColumnDto[];
  view: { columnId: string; width: string }[];
};
export type SettingsDraft =
  | { kind: "project"; base: ProjectDto; value: ProjectForm }
  | { kind: "ia"; base: IaItemDto | null; value: IaForm }
  | { kind: "template"; base: ProjectTemplateDto; value: TemplateForm };
export type FieldErrors = Record<string, string>;
export type SaveIssue = {
  kind: "conflict" | "uncertain" | "validation" | "reference";
  message: string;
  field?: string;
};

export function sameValue(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  };
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

export function projectForm(project: ProjectDto): ProjectForm {
  return { name: project.name, description: project.description ?? "" };
}
export function iaForm(item: IaItemDto | null): IaForm {
  return {
    screenId: item?.screenId ?? "",
    name: item?.name ?? "",
    description: item?.description ?? "",
    parentId: item?.parentId ?? "",
    position: String(item?.position ?? 0),
  };
}
export function templateForm(template: ProjectTemplateDto): TemplateForm {
  return {
    columns: structuredClone(template.columns),
    view: template.view.map((entry) => ({
      ...entry,
      width: String(entry.width),
    })),
  };
}
export function isDirty(draft: SettingsDraft | null) {
  if (!draft) return false;
  const base =
    draft.kind === "project"
      ? projectForm(draft.base)
      : draft.kind === "ia"
        ? iaForm(draft.base)
        : templateForm(draft.base);
  return !sameValue(draft.value, base);
}

export function validateDraft(draft: SettingsDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (draft.kind !== "template") {
    if (!draft.value.name.trim()) errors.name = "이름을 입력해주세요.";
    else if (draft.value.name.trim().length > 100)
      errors.name = "이름은 100자 이내로 입력해주세요.";
    if (draft.value.description.length > 2000)
      errors.description = "설명은 2,000자 이내로 입력해주세요.";
    if (draft.kind === "ia") {
      if (!draft.value.screenId.trim())
        errors.screenId = "화면 ID를 입력해주세요.";
      else if (draft.value.screenId.trim().length > 100)
        errors.screenId = "화면 ID는 100자 이내로 입력해주세요.";
      if (
        !/^\d+$/.test(draft.value.position) ||
        Number(draft.value.position) > 2147483647
      )
        errors.position =
          "순서는 0부터 2,147,483,647 사이의 정수로 입력해주세요.";
    }
  } else {
    for (const column of draft.value.columns) {
      if (!column.name.trim() || column.name.length > 100)
        errors[`name-${column.id}`] = "열 이름을 1~100자로 입력해주세요.";
    }
    for (const entry of draft.value.view) {
      if (
        !/^\d+$/.test(entry.width) ||
        !Number.isSafeInteger(Number(entry.width)) ||
        Number(entry.width) < 1
      )
        errors[`width-${entry.columnId}`] =
          "너비는 1 이상의 정수로 입력해주세요.";
    }
  }
  return errors;
}

export function saveIssue(error: unknown): SaveIssue {
  const value = error as {
    error?: {
      code?: string;
      details?: { references?: string[] } | { field?: string; code?: string }[];
    };
  } | null;
  const code = value?.error?.code;
  if (code === "REVISION_CONFLICT")
    return {
      kind: "conflict",
      message:
        "다른 변경 사항이 저장되어 있습니다. 입력은 유지됩니다. 최신 저장 내용을 확인해주세요.",
    };
  if (code === "SCREEN_ID_CONFLICT")
    return {
      kind: "validation",
      message: "이미 사용 중인 화면 ID입니다. 다른 ID를 입력해주세요.",
      field: "screenId",
    };
  if (code === "REFERENCE_IN_USE") {
    const details = value?.error?.details;
    const refs = !Array.isArray(details) ? (details?.references ?? []) : [];
    return {
      kind: "reference",
      message:
        refs.includes("children") && refs.includes("cases")
          ? "하위 IA 항목과 테스트 케이스에서 사용 중입니다. 상위 항목과 케이스 연결을 해제한 뒤 삭제해주세요."
          : refs.includes("children")
            ? "하위 IA 항목이 있습니다. 상위 항목 연결을 해제한 뒤 삭제해주세요."
            : refs.includes("cases")
              ? "테스트 케이스에서 사용 중입니다. 케이스의 IA 연결을 해제한 뒤 삭제해주세요."
              : "연결된 항목이 있습니다. 연결을 해제한 뒤 삭제해주세요.",
    };
  }
  if (code === "VALIDATION_ERROR") {
    const details = value?.error?.details;
    if (
      Array.isArray(details) &&
      details.some(
        (detail) => detail.field === "parentId" && detail.code === "cycle",
      )
    )
      return {
        kind: "validation",
        field: "parentId",
        message:
          "자신이나 하위 항목은 상위 항목으로 선택할 수 없습니다. 다른 상위 항목을 선택해주세요.",
      };
    return {
      kind: "validation",
      message: "입력 내용을 저장할 수 없습니다. 입력값을 확인해주세요.",
    };
  }
  if (code === "NOT_FOUND")
    return {
      kind: "conflict",
      message:
        "저장된 항목을 찾을 수 없습니다. 입력은 유지됩니다. 최신 목록을 확인해주세요.",
    };
  return {
    kind: "uncertain",
    message:
      "저장 요청 결과를 확인하지 못했습니다. 입력은 유지됩니다. 저장 결과를 확인해주세요.",
  };
}

export function orderedIa(items: IaItemDto[]) {
  const result: { item: IaItemDto; depth: number }[] = [];
  const seen = new Set<string>();
  const ordered = [...items].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const visit = (parentId: string | null, depth: number) => {
    for (const item of ordered.filter((entry) => entry.parentId === parentId)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      result.push({ item, depth });
      visit(item.id, depth + 1);
    }
  };
  visit(null, 0);
  for (const item of ordered)
    if (!seen.has(item.id)) result.push({ item, depth: 0 });
  return result;
}
export function forbiddenParents(items: IaItemDto[], itemId?: string) {
  const ids = new Set(itemId ? [itemId] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items)
      if (item.parentId && ids.has(item.parentId) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
  }
  return ids;
}
