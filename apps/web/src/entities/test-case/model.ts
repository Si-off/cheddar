import type { TestScenarioSnapshotDto } from "@/shared/api/generated";

export type SystemField =
  | "caseCode"
  | "title"
  | "preconditions"
  | "steps"
  | "expectedResult"
  | "priority"
  | "relatedFrames"
  | "screens";
export type Column = {
  id: string;
  kind: "system" | "custom";
  name: string;
  field?: SystemField;
  valueType?: "text";
};
export type CaseDraft = {
  id: string;
  caseCode: string;
  title: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: "high" | "medium" | "low" | null;
  relatedFrameIds: string[];
  screenIds: string[];
  customValues: Record<string, string>;
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
    preconditions: "",
    steps: "",
    expectedResult: "",
    priority: null,
    relatedFrameIds: [],
    screenIds: [],
    customValues: {},
  };
}
export const priorityLabels = { high: "높음", medium: "보통", low: "낮음" };
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
  snapshot: Snapshot,
  item: CaseDraft,
  column: Column,
) {
  if (column.kind === "custom") return item.customValues[column.id] ?? "";
  if (column.field === "priority")
    return item.priority ? priorityLabels[item.priority] : "";
  if (column.field === "relatedFrames")
    return item.relatedFrameIds
      .map((id) => {
        const f = snapshot.references.frames.find((v) => v.id === id);
        return f ? f.name : "프레임";
      })
      .join("\n");
  if (column.field === "screens")
    return item.screenIds
      .map((id) => {
        const i = snapshot.references.iaItems.find((v) => v.id === id);
        return i ? `${i.screenId} ${i.name}` : "화면";
      })
      .join("\n");
  return column.field ? item[column.field] : "";
}
export function setValue(
  item: CaseDraft,
  column: Column,
  value: string,
): CaseDraft {
  if (column.kind === "custom")
    return {
      ...item,
      customValues: { ...item.customValues, [column.id]: value },
    };
  if (column.field === "priority") {
    const priority =
      value === ""
        ? null
        : value === "높음" || value === "high"
          ? "high"
          : value === "보통" || value === "medium"
            ? "medium"
            : value === "낮음" || value === "low"
              ? "low"
              : undefined;
    if (priority === undefined)
      throw new Error("우선순위 셀에서 값을 선택하거나 비워주세요.");
    return { ...item, priority };
  }
  if (column.field === "relatedFrames" || column.field === "screens")
    throw new Error("프레임과 화면 구조 연결은 상세 편집에서 변경해주세요.");
  return column.field ? { ...item, [column.field]: value } : item;
}
