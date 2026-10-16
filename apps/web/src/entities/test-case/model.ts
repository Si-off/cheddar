import type { TestScenarioSnapshotDto } from "@/shared/api/generated";

export type SystemField = "caseCode" | "title";
export type ColumnValue = string | boolean | string[] | null;
export type Column = {
  id: string;
  kind: "system" | "custom";
  name: string;
  field?: SystemField;
  valueType?: "text" | "select" | "checkbox" | "tags";
  description?: string;
  options?: { id: string; name: string }[];
};
export type CaseDraft = {
  id: string;
  caseCode: string;
  title: string;
  relatedFrameIds: string[];
  screenIds: string[];
  customValues: Record<string, ColumnValue>;
};
export type ViewColumn = { columnId: string; width: number };
export type FrameReference = {
  id: string;
  uploadId: string;
  figmaFileKey: string;
  figmaNodeId: string;
  name: string;
  imageFileId: string;
  dataFileId: string;
};
export type IaReference = { id: string; screenId: string; name: string };
export type Snapshot = {
  id: string;
  projectId: string;
  name: string;
  kind: "unit" | "integration";
  uploadId: string | null;
  contentRevision: number;
  viewRevision: number;
  sourceTemplateRevision: number;
  createdAt: string;
  updatedAt: string;
  columns: Column[];
  cases: CaseDraft[];
  view: ViewColumn[];
  references: { frames: FrameReference[]; iaItems: IaReference[] };
};
export function fromSnapshot(dto: TestScenarioSnapshotDto): Snapshot {
  return structuredClone(dto);
}
export function newCase(): CaseDraft {
  return {
    id: crypto.randomUUID(),
    caseCode: "",
    title: "",
    relatedFrameIds: [],
    screenIds: [],
    customValues: {},
  };
}
export function content(snapshot: Snapshot) {
  return {
    columns: [...snapshot.columns].sort((a, b) => a.id.localeCompare(b.id)),
    cases: snapshot.cases,
  };
}
export function equal(a: unknown, b: unknown) {
  const canonical = (_key: string, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        )
      : value;
  return JSON.stringify(a, canonical) === JSON.stringify(b, canonical);
}
export function validate(snapshot: Snapshot): string | undefined {
  if (snapshot.columns.some((c) => !c.name.trim() || c.name.length > 100))
    return "열 이름은 1~100자로 입력해주세요.";
  const codes = snapshot.cases.map((c) => c.caseCode).filter(Boolean);
  if (new Set(codes).size !== codes.length)
    return "테스트 케이스 번호가 중복됩니다. 번호를 변경해주세요.";
  if (snapshot.cases.some((c) => c.caseCode.length > 100))
    return "테스트 케이스 번호는 100자 이내로 입력해주세요.";
  if (
    new TextEncoder().encode(
      JSON.stringify({
        ...content(snapshot),
        expectedRevision: snapshot.contentRevision,
      }),
    ).byteLength >
    5 * 1024 * 1024
  )
    return "시나리오 내용이 저장 한도인 5MiB를 넘었습니다. 입력 내용을 줄여주세요.";
}
export function displayValue(
  _snapshot: Snapshot,
  item: CaseDraft,
  column: Column,
): string {
  if (column.kind === "system") return column.field ? item[column.field] : "";
  const value = item.customValues[column.id];
  const label = (id: string) =>
    column.options?.find((option) => option.id === id)?.name ?? "";
  if (column.valueType === "checkbox")
    return value === true ? "체크" : "미체크";
  if (column.valueType === "select")
    return typeof value === "string" ? label(value) : "";
  if (column.valueType === "tags")
    return Array.isArray(value) ? value.map(label).join("\n") : "";
  return typeof value === "string" ? value : "";
}
export function setValue(
  item: CaseDraft,
  column: Column,
  value: string,
): CaseDraft {
  if (column.kind === "system")
    return column.field ? { ...item, [column.field]: value } : item;
  let parsed: ColumnValue = value;
  const optionId = (text: string) => {
    const option = column.options?.find(
      (option) => option.id === text || option.name === text,
    );
    if (!option) throw new Error(`${column.name}의 선택 항목을 확인해주세요.`);
    return option.id;
  };
  if (column.valueType === "select") parsed = value ? optionId(value) : null;
  if (column.valueType === "checkbox") {
    if (["체크", "true", "1"].includes(value)) parsed = true;
    else if (["", "미체크", "false", "0"].includes(value)) parsed = false;
    else throw new Error(`${column.name}에는 체크 또는 미체크를 입력해주세요.`);
  }
  if (column.valueType === "tags")
    parsed = value ? [...new Set(value.split("\n").map(optionId))] : [];
  return {
    ...item,
    customValues: { ...item.customValues, [column.id]: parsed },
  };
}
