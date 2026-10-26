import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { validateDraft, validateSchema } from "../output-schema";
import { emptyCell, isAiColumn } from "../steps/column-rules";
import type { CaseOutput, Draft, GenerationInput, JsonSchema } from "../types";

export type PiCase = { key: string; values: Draft; groupKey?: string };
export type PiReview = {
  key: string;
  reason: string;
  question: string | null;
  screenDescription: string;
  values: Draft;
  groupKey?: string;
};
export type PiDraft = {
  cases: PiCase[];
  reviews: PiReview[];
  readFrames: string[];
  readReference: boolean;
  complete: boolean;
  audit: string;
};
export const emptyPiDraft = (): PiDraft => ({
  cases: [],
  reviews: [],
  readFrames: [],
  readReference: false,
  complete: false,
  audit: "",
});
const str = { type: "string" };
const integer = { type: "integer", minimum: 0 };
const schema = (
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) => ({ type: "object", properties, required, additionalProperties: false });

/** 업로드와 기준 문서 사본만 접근한다. 파일 경로, 셸, 네트워크 권한은 모델에 노출하지 않는다. */
export class PiWorkspace {
  constructor(
    readonly input: GenerationInput,
    readonly draft: PiDraft,
    private readonly image: (
      frameId: string,
      index: number,
    ) => Promise<{ data: string; mimeType: string }>,
    private readonly persist: () => Promise<void>,
  ) {}

  form() {
    return this.input.columns.filter(isAiColumn).map((c) => ({
      key: c.id,
      name: c.name,
      type: c.type,
      options: c.options,
      // 기존 sheet-v3의 분해 규칙을 주입하지 않는다.
      description: c.presetKey ? "" : c.description,
    }));
  }

  private values(value: unknown, review = false): Draft {
    const columns = this.input.columns.filter(isAiColumn);
    const values = validateDraft(columns, value);
    for (const c of columns) {
      if (
        c.type === "select" &&
        values[c.id] != null &&
        !c.options.includes(String(values[c.id]))
      )
        throw new Error(`${c.name}: 허용된 선택값만 사용하세요.`);
      if (
        c.type === "tags" &&
        Array.isArray(values[c.id]) &&
        (values[c.id] as string[]).some((v) => !c.options.includes(v))
      )
        throw new Error(`${c.name}: 허용된 태그만 사용하세요.`);
      values[c.id] ??= emptyCell(c);
      if (
        !review &&
        (c.systemKey === "title" ||
          ["steps", "expected"].includes(c.presetKey ?? "")) &&
        (typeof values[c.id] !== "string" || !(values[c.id] as string).trim())
      )
        throw new Error(`${c.name}을 작성하세요.`);
    }
    return values;
  }

  private group(key: unknown) {
    if (key === undefined) return undefined;
    if (
      typeof key !== "string" ||
      !this.input.featureGroups.some((g) => g.id === key)
    )
      throw new Error("프로젝트의 기능 그룹 ID를 사용하세요.");
    return key;
  }

  tools(): ToolDefinition[] {
    const tool = (
      name: string,
      description: string,
      parameters: unknown,
      execute: (args: Record<string, unknown>) => Promise<unknown> | unknown,
    ): ToolDefinition => ({
      name,
      label: name,
      description,
      parameters: parameters as ToolDefinition["parameters"],
      execute: async (_id, args, signal) => {
        signal?.throwIfAborted();
        if (this.draft.complete) throw new Error("이미 제출한 작업입니다.");
        validateSchema(parameters as JsonSchema, args);
        const result = await execute(args as Record<string, unknown>);
        await this.persist();
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: {},
          ...(name === "complete" ? { terminate: true } : {}),
        };
      },
    });
    const item = schema(
      {
        key: { ...str, minLength: 1, maxLength: 100 },
        values: { type: "object" },
        groupKey: str,
      },
      ["key", "values"],
    );
    return [
      tool(
        "list_materials",
        "선택한 화면, 기준 QA 문서의 시트, 출력 열, 기존 케이스 수를 확인한다.",
        schema({}),
        () => ({
          frames: this.input.frames.map((f) => ({
            id: f.id,
            name: f.name,
            characters: f.screenDocument.length,
            images: f.imageStorageKeys.length,
          })),
          reference: this.input.qaReference && {
            name: this.input.qaReference.name,
            sheets: this.input.qaReference.sheets.map((s) => ({
              name: s.name,
              rows: s.rows.length,
              merges: s.merges,
            })),
          },
          form: this.form(),
          featureGroups: this.input.featureGroups,
          screenStructure: this.input.screenStructure,
          existingCases: this.input.existingCases.length,
        }),
      ),
      tool(
        "read_frame",
        "화면 원문 JSON을 읽는다. 텍스트, 노드 ID, 위치, 연결, 취소선 정보가 포함된다. nextOffset이 있으면 이어 읽을 수 있다.",
        schema({ frameId: str, offset: integer }, ["frameId"]),
        ({ frameId, offset = 0 }) => {
          const frame = this.input.frames.find((f) => f.id === frameId);
          if (!frame) throw new Error("선택한 화면을 찾을 수 없습니다.");
          if (!this.draft.readFrames.includes(frame.id))
            this.draft.readFrames.push(frame.id);
          const start = Number(offset),
            end = start + 24000;
          return {
            data: frame.screenDocument.slice(start, end),
            nextOffset: end < frame.screenDocument.length ? end : null,
          };
        },
      ),
      tool(
        "search_frames",
        "선택한 화면의 원문에서 단어를 찾아 주변 문맥과 위치를 반환한다. 이후 read_frame으로 자세히 읽는다.",
        schema({ query: { ...str, minLength: 1 } }),
        ({ query }) =>
          this.input.frames
            .flatMap((f) => {
              const text = f.screenDocument.toLowerCase(),
                needle = String(query).toLowerCase();
              const found = [];
              for (
                let pos = text.indexOf(needle);
                pos >= 0 && found.length < 20;
                pos = text.indexOf(needle, pos + needle.length)
              )
                found.push({
                  frameId: f.id,
                  offset: Math.max(0, pos - 150),
                  excerpt: f.screenDocument.slice(
                    Math.max(0, pos - 150),
                    pos + 500,
                  ),
                });
              return found;
            })
            .slice(0, 50),
      ),
      {
        name: "view_frame",
        label: "화면 이미지 확인",
        description:
          "선택한 화면의 이미지를 직접 확인한다. index는 0부터 시작하는 이미지 조각 번호다.",
        parameters: schema({ frameId: str, index: integer }, [
          "frameId",
        ]) as ToolDefinition["parameters"],
        execute: async (_id, args, signal) => {
          signal?.throwIfAborted();
          validateSchema(
            schema({ frameId: str, index: integer }, ["frameId"]) as JsonSchema,
            args,
          );
          const values = args as { frameId: string; index?: number };
          const result = await this.image(values.frameId, values.index ?? 0);
          return { content: [{ type: "image", ...result }], details: {} };
        },
      },
      tool(
        "read_reference",
        "프로젝트에 등록된 기준 QA 시트를 행 범위로 읽거나 문구를 검색한다. 문체와 시나리오 분해 방식의 근거다. 등록 문서가 없으면 기존 작성 예시를 반환한다.",
        schema({ sheet: str, offset: integer, query: str }, []),
        ({ sheet, offset = 0, query }) => {
          this.draft.readReference = true;
          if (!this.input.qaReference)
            return { examples: this.input.styleExamples, registered: false };
          const selected =
            this.input.qaReference.sheets.find((s) => s.name === sheet) ??
            (!sheet ? this.input.qaReference.sheets[0] : undefined);
          if (!selected)
            throw new Error("기준 문서의 시트를 찾을 수 없습니다.");
          const rows = query
            ? selected.rows.filter((row) =>
                JSON.stringify(row).includes(String(query)),
              )
            : selected.rows;
          return {
            sheet: selected.name,
            total: rows.length,
            rows: rows.slice(Number(offset), Number(offset) + 25),
            nextOffset:
              Number(offset) + 25 < rows.length ? Number(offset) + 25 : null,
          };
        },
      ),
      tool(
        "read_existing_cases",
        "추가 생성 시 중복을 피하도록 현재 세트의 기존 케이스를 읽는다.",
        schema({ offset: integer }, []),
        ({ offset = 0 }) => ({
          total: this.input.existingCases.length,
          cases: this.input.existingCases.slice(
            Number(offset),
            Number(offset) + 25,
          ),
        }),
      ),
      tool(
        "save_cases",
        "실행 가능한 테스트 행을 여러 번 나누어 저장한다. 같은 key는 수정하고 새로운 key는 추가한다. values의 키는 출력 열 UUID다. 시나리오 묶음에 속하는 행에는 같은 이름을 쓴다.",
        schema({
          cases: { type: "array", items: item, minItems: 1, maxItems: 50 },
        }),
        ({ cases }) => {
          const prepared = (cases as PiCase[]).map((c) => ({
            key: c.key,
            values: this.values(c.values),
            groupKey: this.group(c.groupKey),
          }));
          for (const value of prepared) {
            const index = this.draft.cases.findIndex(
              (c) => c.key === value.key,
            );
            if (index < 0) this.draft.cases.push(value);
            else this.draft.cases[index] = value;
          }
          return { saved: prepared.length, total: this.draft.cases.length };
        },
      ),
      tool(
        "save_reviews",
        "예상 결과를 결정할 수 없는 항목의 근거, 질문, 초안을 저장한다. 같은 key는 수정한다.",
        schema({
          reviews: {
            type: "array",
            minItems: 1,
            maxItems: 50,
            items: schema(
              {
                ...item.properties,
                reason: str,
                question: { type: ["string", "null"] },
                screenDescription: str,
              },
              ["key", "values", "reason", "question", "screenDescription"],
            ),
          },
        }),
        ({ reviews }) => {
          const prepared = (reviews as PiReview[]).map((r) => ({
            ...r,
            values: this.values(r.values, true),
            groupKey: this.group(r.groupKey),
          }));
          for (const value of prepared) {
            const index = this.draft.reviews.findIndex(
              (r) => r.key === value.key,
            );
            if (index < 0) this.draft.reviews.push(value);
            else this.draft.reviews[index] = value;
          }
          return { saved: prepared.length, total: this.draft.reviews.length };
        },
      ),
      tool(
        "read_draft",
        "저장된 초안을 읽고 원문과 대조한다. 필요한 행은 save_cases 또는 save_reviews로 수정한다.",
        schema({ offset: integer }, []),
        ({ offset = 0 }) => ({
          cases: this.draft.cases.slice(Number(offset), Number(offset) + 25),
          total: this.draft.cases.length,
          reviews: this.draft.reviews,
        }),
      ),
      tool(
        "remove_drafts",
        "중복 또는 잘못 작성된 초안만 삭제한다. 삭제 이유를 기록한다.",
        schema({
          keys: { type: "array", items: str, maxItems: 50 },
          reason: { ...str, minLength: 1 },
        }),
        ({ keys }) => {
          const removed = new Set(keys as string[]);
          this.draft.cases = this.draft.cases.filter(
            (c) => !removed.has(c.key),
          );
          this.draft.reviews = this.draft.reviews.filter(
            (r) => !removed.has(r.key),
          );
          return {
            cases: this.draft.cases.length,
            reviews: this.draft.reviews.length,
          };
        },
      ),
      tool(
        "complete",
        "원문과 기준 문서에 맞춰 누락, 중복, 실행 가능성을 검토한 뒤 제출한다. audit에 검토한 범위와 남은 불확실성을 남긴다.",
        schema({ audit: { ...str, minLength: 20, maxLength: 10000 } }),
        ({ audit }) => {
          if (
            this.input.frames.some((f) => !this.draft.readFrames.includes(f.id))
          )
            throw new Error("아직 읽지 않은 선택 화면이 있습니다.");
          if (
            !this.draft.readReference &&
            (this.input.qaReference || this.input.styleExamples.length)
          )
            throw new Error("기준 QA 작성 예시를 먼저 확인하세요.");
          if (!this.draft.cases.length && !this.draft.reviews.length)
            throw new Error("작성한 테스트 또는 확인 필요 항목이 없습니다.");
          this.draft.audit = String(audit);
          this.draft.complete = true;
          return {
            cases: this.draft.cases.length,
            reviews: this.draft.reviews.length,
          };
        },
      ),
    ];
  }

  output(): CaseOutput {
    return {
      cases: this.draft.cases.map((c) => this.values(c.values)),
      caseGroupKeys: this.draft.cases.map((c) => c.groupKey ?? null),
      reviews: this.draft.reviews.map((r) => ({
        reason: r.reason,
        question: r.question,
        screenDescription: r.screenDescription,
        draft: this.values(r.values, true),
      })),
      reviewGroupKeys: this.draft.reviews.map((r) => r.groupKey ?? null),
      coverage: [],
      mergedCount: 0,
    };
  }
}
