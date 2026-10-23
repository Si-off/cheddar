import type { ScreenDto, ScreenIdRulePartDto } from "../contracts/project.dto";
import { array, object, text } from "../generation/output-schema";
import type { JsonSchema, StepDefinition } from "../generation/types";
import { accepts, matches } from "./screen-id-rules";
import { type SourceSheet, type Sources, sheetLines } from "./screen-sources";

type ScreenType = ScreenDto["type"];
const SCREEN_TYPES: ScreenType[] = ["page", "popup", "bottom_sheet", "tab"];
const integer = (minimum = 0): JsonSchema => ({ type: "integer", minimum });
const nullableInteger: JsonSchema = { type: ["integer", "null"], minimum: 1 };

export type RuleDraft = {
  name: string;
  separator: string;
  parts: ScreenIdRulePartDto[];
};
export type ScreenDraft = {
  key: string;
  screenId: string;
  name: string;
  type: ScreenType;
  parentKey: string | null;
  description: string;
  /** 결과 확인에서 묶는 이름. 시트는 경로의 첫 칸(모듈)이다. */
  group: string;
};

/** 화면 ID처럼 보이는 글자: 영문·숫자 조각을 _나 -로 이은 것 */
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)+$/;
export const looksLikeId = (value: string) =>
  value.length >= 4 && value.length <= 100 && ID_PATTERN.test(value);
/** 화면 ID 열의 값. 구분 기호 없는 ID도 받고 "-"나 "추후 채번" 같은 자리 표시는 뺀다. */
const isIdValue = (value: string) =>
  value.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);

// ---------- 시트의 열 고르기 ----------

type ColumnPlan = {
  sheet: number;
  use: boolean;
  headerRow: number;
  idColumn: number | null;
  pathColumns: number[];
  typeColumn: number | null;
  noteColumn: number | null;
  types: { value: string; type: ScreenType | "none" }[];
};
export type ColumnsOutput = { sheets: ColumnPlan[] };

const columnsSchema = (): JsonSchema =>
  object({
    sheets: array(
      object({
        sheet: integer(),
        use: { type: "boolean" },
        headerRow: integer(),
        idColumn: nullableInteger,
        pathColumns: array(integer(1), 12),
        typeColumn: nullableInteger,
        noteColumn: nullableInteger,
        types: array(
          object({
            value: text(200),
            type: { type: "string", enum: [...SCREEN_TYPES, "none"] },
          }),
          60,
        ),
      }),
      40,
    ),
  });

/** 시트마다 머리글 근처 행과 열별 대표 값을 보낸다. 모든 행을 보내지 않는다. */
export function columnsSource(sheets: SourceSheet[]) {
  return {
    sheets: sheets.map((sheet, index) => {
      const width = Math.max(0, ...sheet.rows.map((r) => r.length));
      return {
        sheet: index,
        name: sheet.name,
        rowCount: sheet.rows.length,
        firstRows: sheetLines(sheet.rows, 0, 12),
        columns: Array.from({ length: width }, (_, col) => {
          const values = new Map<string, number>();
          for (const row of sheet.rows.slice(1)) {
            const value = row[col];
            if (value) values.set(value, (values.get(value) ?? 0) + 1);
          }
          return {
            column: col + 1,
            filled: [...values.values()].reduce((a, b) => a + b, 0),
            distinct: values.size,
            samples: [...values.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 25)
              .map(([value]) => value.slice(0, 60)),
          };
        }),
      };
    }),
  };
}

const headerIndex = (row: string[], pattern: RegExp) => {
  const index = row.findIndex((cell) => pattern.test(cell));
  return index < 0 ? null : index + 1;
};

export const screenColumns: StepDefinition = {
  key: "structure",
  displayStage: null,
  version: "screen-columns-1",
  maxTokens: 8000,
  timeoutMs: 120000,
  retries: 1,
  prompt:
    "IA 엑셀에서 화면 목록을 읽을 열을 고른다. 시트마다 행 수와 앞쪽 행, 열별 대표 값이 주어진다. 화면 ID 열이 있는 화면 목록 시트만 use=true로 한다. 화면 ID가 없거나 거의 비어 있는 이전 버전 시트, 규칙 설명 시트, 변경 이력 시트는 use=false다. headerRow는 머리글이 있는 마지막 행 번호이고 데이터는 다음 행부터다. idColumn은 화면 ID 열, pathColumns는 화면 경로를 상위에서 하위 순서로 담은 열(module, 1Depth, 2Depth처럼)이다. typeColumn은 화면 유형 열, noteColumn은 설명이나 비고 열이다. 없으면 null이다. types에는 typeColumn의 대표 값마다 page, popup(팝업, 풀팝업, 레이어팝업), bottom_sheet, tab 중 하나를 대응하고 버튼이나 기능처럼 화면이 아니면 none으로 한다. 열과 행 번호는 1부터 센다. use=false인 시트는 나머지 값을 0, null, 빈 배열로 둔다.",
  schema: columnsSchema,
  fake: (source) => {
    const { sheets } = source as ReturnType<typeof columnsSource>;
    return {
      sheets: sheets.map((sheet) => {
        const rows = sheet.firstRows.split("\n").map((line) => {
          const at = line.indexOf("| ");
          const no = line.slice(0, at);
          const rest = line.slice(at + 2);
          const row: string[] = [];
          for (const cell of rest.split(" | ")) {
            const [col, ...value] = cell.split(":");
            row[Number(col) - 1] = value.join(":");
          }
          return { no: Number(no), row: Array.from(row, (c) => c ?? "") };
        });
        const header = rows.find((r) =>
          r.row.some((c) => /screen ?id|화면 ?id/i.test(c)),
        );
        if (!header)
          return {
            sheet: sheet.sheet,
            use: false,
            headerRow: 0,
            idColumn: null,
            pathColumns: [],
            typeColumn: null,
            noteColumn: null,
            types: [],
          };
        const typeColumn = headerIndex(header.row, /^type$|유형/i);
        return {
          sheet: sheet.sheet,
          use: true,
          headerRow: header.no,
          idColumn: headerIndex(header.row, /screen ?id|화면 ?id/i),
          pathColumns: header.row.flatMap((c, i) =>
            /module|depth/i.test(c) ? [i + 1] : [],
          ),
          typeColumn,
          noteColumn: headerIndex(header.row, /note|설명|비고/i),
          types: (typeColumn
            ? (sheet.columns[typeColumn - 1]?.samples ?? [])
            : []
          ).map((value) => ({
            value,
            type: /pop/i.test(value)
              ? "popup"
              : /bottom|바텀/i.test(value)
                ? "bottom_sheet"
                : /^tab$/i.test(value)
                  ? "tab"
                  : /button|버튼/i.test(value)
                    ? "none"
                    : "page",
          })),
        };
      }),
    } satisfies ColumnsOutput;
  },
};

// 대응표에 없는 유형 값은 글자로 짐작한다.
function guessType(value: string): ScreenType | "none" {
  if (/button|버튼|기능/i.test(value)) return "none";
  if (/bottom|바텀/i.test(value)) return "bottom_sheet";
  if (/pop|팝업/i.test(value)) return "popup";
  if (/^tab$|^탭$/i.test(value)) return "tab";
  return "page";
}

/** 고른 열로 시트의 모든 행을 펼친다. 비어 있는 상위 경로는 윗행 값을 잇는다. */
export function parseSheet(
  sheet: SourceSheet,
  plan: ColumnPlan,
  sheetKey: string,
) {
  const drafts: ScreenDraft[] = [];
  let withoutId = 0;
  const id = plan.idColumn;
  if (!plan.use || !id) return { drafts, withoutId };
  const types = new Map(plan.types.map((t) => [t.value, t.type]));
  const byPath = new Map<string, string>();
  let previous: string[] = [];
  for (let index = plan.headerRow; index < sheet.rows.length; index++) {
    const row = sheet.rows[index] ?? [];
    const raw = plan.pathColumns.map((col) => row[col - 1] ?? "");
    const deepest = raw.reduce((last, value, i) => (value ? i : last), -1);
    if (deepest < 0) continue;
    const path = raw
      .slice(0, deepest + 1)
      .map((value, i) => value || previous[i] || "");
    previous = path;
    const typeValue = plan.typeColumn ? (row[plan.typeColumn - 1] ?? "") : "";
    const type = typeValue
      ? (types.get(typeValue) ?? guessType(typeValue))
      : "page";
    if (type === "none") continue;
    const screenId = (row[id - 1] ?? "").trim();
    if (!isIdValue(screenId)) {
      withoutId++;
      continue;
    }
    const pathKey = path.join("\u0000");
    let parentKey: string | null = null;
    for (let depth = path.length - 1; depth > 0 && !parentKey; depth--)
      parentKey = byPath.get(path.slice(0, depth).join("\u0000")) ?? null;
    const key = `${sheetKey}:${index + 1}`;
    if (!byPath.has(pathKey)) byPath.set(pathKey, key);
    drafts.push({
      key,
      screenId,
      name: path[path.length - 1].slice(0, 200),
      group: path[0].slice(0, 200),
      type,
      parentKey,
      description: plan.noteColumn
        ? (row[plan.noteColumn - 1] ?? "").slice(0, 2000)
        : "",
    });
  }
  return { drafts, withoutId };
}

// ---------- 이미지와 글에서 화면 목록 ----------

export type ListOutput = {
  screens: {
    screenId: string;
    name: string;
    type: ScreenType;
    parentScreenId: string | null;
    description: string;
  }[];
  withoutId: number;
};

export const screenList: StepDefinition = {
  key: "structure",
  displayStage: null,
  version: "screen-list-1",
  maxTokens: 32000,
  timeoutMs: 180000,
  retries: 1,
  prompt:
    "이미지나 글로 된 화면 목록에서 화면을 뽑는다. 화면 ID가 자료에 적힌 화면만 screens에 넣고 화면 ID는 자료의 글자 그대로 쓴다. 화면 ID를 짓거나 고치지 않는다. 화면 ID가 없는 화면은 넣지 않고 그 개수를 withoutId에 센다. name은 화면 이름, type은 page, popup, bottom_sheet, tab 중 하나, parentScreenId는 자료에서 바로 위 화면을 알 수 있을 때 그 화면 ID이고 모르면 null이다. 버튼이나 기능은 화면이 아니다. description은 자료에 있는 설명만 쓰고 없으면 빈 문자열이다.",
  schema: () =>
    object({
      screens: array(
        object({
          screenId: text(100),
          name: text(200),
          type: { type: "string", enum: SCREEN_TYPES },
          parentScreenId: { type: ["string", "null"], maxLength: 100 },
          description: text(2000),
        }),
        500,
      ),
      withoutId: integer(),
    }),
  fake: (source) => {
    const { texts } = source as { texts: { body: string }[] };
    const ids = [
      ...new Set(
        texts.flatMap((t) => t.body.split(/[\s,|]+/).filter(looksLikeId)),
      ),
    ];
    return {
      screens: ids.map((screenId) => ({
        screenId,
        name: screenId,
        type: "page",
        parentScreenId: null,
        description: "",
      })),
      withoutId: 0,
    } satisfies ListOutput;
  },
};

// ---------- 화면 ID 규칙 ----------

export type RulesOutput = { rules: RuleDraft[] };

const rulesSchema = (): JsonSchema =>
  object({
    rules: array(
      object({
        name: text(100),
        separator: text(3),
        parts: array(
          object({
            name: text(40),
            kind: { type: "string", enum: ["list", "fixed", "number"] },
            codes: array(object({ code: text(40), meaning: text(100) }), 200),
            value: text(40),
            digits: integer(),
          }),
          8,
        ),
      }),
      6,
    ),
  });

/** 화면 ID마다 처음 나온 행의 다른 글자를 맥락으로 붙인다. 짧은 시트는 규칙 설명일 수 있어 통째로 보낸다. */
export function rulesSource(sources: Sources, existingNames: string[]) {
  const ids = new Map<string, string>();
  const documents: { title: string; body: string }[] = [];
  for (const sheet of sources.sheets) {
    for (const row of sheet.rows)
      for (const value of row)
        if (looksLikeId(value) && !ids.has(value) && ids.size < 800)
          ids.set(
            value,
            row
              .filter((cell) => cell && cell !== value)
              .join(" / ")
              .slice(0, 160),
          );
    if (sheet.rows.length <= 60)
      documents.push({
        title: `${sheet.file} ${sheet.name}`,
        body: sheetLines(sheet.rows).slice(0, 12000),
      });
  }
  for (const doc of sources.texts) {
    for (const line of doc.body.split("\n"))
      for (const value of line.split(/[\s,|/]+/))
        if (looksLikeId(value) && !ids.has(value) && ids.size < 800)
          ids.set(value, line.replace(value, "").trim().slice(0, 160));
    documents.push({ title: doc.file, body: doc.body.slice(0, 20000) });
  }
  return {
    shapes: idShapes([...ids.keys()]),
    screenIds: [...ids].map(([id, context]) => ({ id, context })),
    documents,
    existingRuleNames: existingNames,
  };
}

/** ID를 자리별 글자 종류로 묶어 개수를 센다. 어느 구조가 주류이고 어느 것이 예외인지 AI가 알게 한다. */
function idShapes(ids: string[]) {
  const shapes = new Map<string, string[]>();
  for (const id of ids) {
    const shape = id
      .split(/([_-])/)
      .map((token) =>
        token === "_" || token === "-"
          ? token
          : /^[0-9]+$/.test(token)
            ? `[숫자${token.length}]`
            : "[영문]",
      )
      .join("");
    shapes.set(shape, [...(shapes.get(shape) ?? []), id]);
  }
  return [...shapes]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([shape, list]) => ({
      shape,
      count: list.length,
      examples: list.slice(0, 4),
    }));
}

/** 이 수보다 적은 ID에만 맞는 규칙은 예외로 보고 버린다. 그런 ID는 규칙 불일치로 남는다. */
const minimumHits = (total: number) =>
  total < 10 ? 1 : Math.max(2, Math.ceil(total * 0.03));

export const screenRules: StepDefinition = {
  key: "structure",
  displayStage: null,
  version: "screen-rules-2",
  maxTokens: 16000,
  timeoutMs: 180000,
  retries: 1,
  prompt:
    "자료에 있는 화면 ID에서 채번 규칙을 찾는다. shapes는 ID를 자리별 글자 종류로 묶은 개수다. 많은 ID가 따르는 구조마다 규칙 하나를 만든다(예: 관리자 화면, 앱 화면). 몇 개 ID에만 있는 구조는 표기 실수나 예외이므로 규칙으로 만들지 않는다. 같은 채널의 ID는 되도록 규칙 하나로 묶는다. separator는 부분 사이 구분 기호이고 parts는 구분 기호로 나눈 자리마다 하나다. 자리 값이 정해진 몇 가지 중 하나면 kind=list이고 codes에 그 구조의 ID에 실제로 나온 값을 모두 넣는다. 0101, 0103처럼 숫자여도 여러 ID가 같은 값을 나눠 쓰는 메뉴나 영역 코드면 list다. meaning은 같은 행의 모듈명, 화면 이름, 규칙 설명에서 알 수 있을 때만 짧게 쓰고 모르면 빈 문자열이다. 그 구조의 모든 ID에서 값이 같으면 kind=fixed와 value다. kind=number는 앞 부분이 같은 화면끼리 001, 002처럼 이어 세는 마지막 일련번호에만 쓰고 digits는 자릿수다. list가 아니면 codes는 빈 배열, fixed가 아니면 value는 빈 문자열, number가 아니면 digits는 0이다. 규칙 설명 문서가 있으면 그 구조와 부분 이름을 따른다. 규칙 이름과 부분 이름은 짧은 한국어 명사로 쓰고 existingRuleNames와 겹치지 않게 한다. 자료에 없는 코드를 지어내지 않는다. 화면 ID가 없으면 rules를 비운다.",
  schema: rulesSchema,
  fake: (source) => {
    const { screenIds } = source as ReturnType<typeof rulesSource>;
    const groups = new Map<string, string[][]>();
    for (const { id } of screenIds) {
      const values = id.split("_");
      const key = `${values[0]}:${values.length}`;
      groups.set(key, [...(groups.get(key) ?? []), values]);
    }
    return {
      rules: [...groups.values()].map((list, i) => ({
        name: `규칙 ${i + 1}`,
        separator: "_",
        parts: list[0].map((_, at) => {
          const values = [...new Set(list.map((v) => v[at]))];
          if (values.every((v) => /^[0-9]+$/.test(v)) && values.length > 1)
            return {
              name: `번호`,
              kind: "number" as const,
              codes: [],
              value: "",
              digits: values[0].length,
            };
          return {
            name: `부분 ${at + 1}`,
            kind: "list" as const,
            codes: values.map((code) => ({ code, meaning: "" })),
            value: "",
            digits: 0,
          };
        }),
      })),
    } satisfies RulesOutput;
  },
};

const CODE = /^[A-Za-z0-9_-]{1,40}$/;
const kindOf = (value: string) => (/^[0-9]+$/.test(value) ? "digit" : "alpha");

/**
 * 한 자리만 맞지 않는 ID가 있으면 그 값을 코드로 더한다. AI가 여러 값을 쓰는 자리를
 * 고정값으로 보거나 코드 일부를 빠뜨려도 자료의 ID가 규칙에 맞게 된다. 번호 자리는 넓히지 않는다.
 */
function widen(rule: RuleDraft, ids: string[]): RuleDraft {
  if (!rule.separator) return rule;
  const extra = rule.parts.map(() => new Set<string>());
  for (const id of ids) {
    const values = id.split(rule.separator);
    if (values.length !== rule.parts.length) continue;
    const misses = values.flatMap((value, i) =>
      accepts(rule.parts[i], value) ? [] : [i],
    );
    if (misses.length !== 1) continue;
    const at = misses[0];
    const part = rule.parts[at];
    const sample = part.kind === "fixed" ? part.value : part.codes[0]?.code;
    if (
      part.kind !== "number" &&
      sample &&
      CODE.test(values[at]) &&
      kindOf(values[at]) === kindOf(sample)
    )
      extra[at].add(values[at]);
  }
  return {
    ...rule,
    parts: rule.parts.map((part, i) => {
      if (!extra[i].size) return part;
      const codes =
        part.kind === "fixed"
          ? [{ code: part.value, meaning: "" }]
          : [...part.codes];
      for (const code of [...extra[i]].sort())
        if (!codes.some((c) => c.code === code))
          codes.push({ code, meaning: "" });
      return { ...part, kind: "list", codes, value: "", digits: 0 };
    }),
  };
}

/** AI 규칙을 저장 계약에 맞게 고친다. 고칠 수 없는 규칙은 버리고 이름은 기존 규칙과 겹치지 않게 한다. */
export function cleanRules(
  output: RulesOutput,
  ids: string[],
  existingNames: string[],
): RuleDraft[] {
  const names = new Set(existingNames);
  const cleaned: { rule: RuleDraft; hits: number }[] = [];
  for (const rule of output.rules) {
    const parts = rule.parts.map((part, at): ScreenIdRulePartDto | null => {
      const name = part.name.trim().slice(0, 40) || `부분 ${at + 1}`;
      if (part.kind === "list") {
        const seen = new Set<string>();
        const codes = part.codes
          .map((c) => ({ code: c.code.trim(), meaning: c.meaning.trim() }))
          .filter((c) => {
            if (!CODE.test(c.code) || seen.has(c.code)) return false;
            seen.add(c.code);
            return true;
          });
        return codes.length
          ? { name, kind: "list", codes, value: "", digits: 0 }
          : null;
      }
      if (part.kind === "fixed")
        return part.value.trim()
          ? {
              name,
              kind: "fixed",
              codes: [],
              value: part.value.trim().slice(0, 40),
              digits: 0,
            }
          : null;
      return part.digits >= 1 && part.digits <= 6
        ? { name, kind: "number", codes: [], value: "", digits: part.digits }
        : null;
    });
    if (parts.some((part) => !part)) continue;
    if (parts.length < 1 || parts.length > 8) continue;
    let name = rule.name.trim().slice(0, 100) || "화면 ID 규칙";
    for (let n = 2; names.has(name); n++)
      name = `${rule.name.trim().slice(0, 95)} ${n}`;
    names.add(name);
    const draft = widen(
      {
        name,
        separator: rule.separator.slice(0, 3),
        parts: parts as ScreenIdRulePartDto[],
      },
      ids,
    );
    cleaned.push({
      rule: draft,
      hits: ids.filter((id) => matches(draft, id)).length,
    });
  }
  // 자료의 ID에 거의 맞지 않는 규칙은 버린다. 이미지만 넣어 ID를 모르면 모두 둔다.
  return cleaned
    .filter((c) => !ids.length || c.hits >= minimumHits(ids.length))
    .sort((a, b) => b.hits - a.hits)
    .map((c) => c.rule);
}
