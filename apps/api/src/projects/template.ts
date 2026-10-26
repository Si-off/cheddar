import { randomUUID } from "node:crypto";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ApiError } from "../common/errors";
import { optionColors } from "../contracts/option-colors";
import {
  type TemplateColumnDto,
  UpdateTemplateDto,
} from "../contracts/project.dto";

const fail = (message: string): never => {
  throw new ApiError(400, "VALIDATION_FAILED", message);
};
function validateColumns(input: unknown, project: boolean): UpdateTemplateDto {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return fail("양식의 입력 내용을 확인해주세요.");
  const dto = plainToInstance(UpdateTemplateDto, input);
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
    return fail("양식의 항목 수, 이름, 설명과 형식을 확인해주세요.");
  const ids = new Set<string>();
  const columnNames = new Set<string>();
  const presets = new Set<string>();
  const systems = new Set<string>();
  for (const column of dto.columns) {
    if (column.presetKey !== null) {
      const preset = findPresetColumn(column.presetKey);
      if (
        !preset ||
        presets.has(column.presetKey) ||
        column.systemKey !== preset.systemKey ||
        column.name !== preset.name ||
        column.type !== preset.type ||
        column.description !== preset.description ||
        JSON.stringify(column.options) !== JSON.stringify(preset.options)
      )
        return fail("사전 정의 열은 켜고 끄기와 순서만 바꿀 수 있습니다.");
      presets.add(column.presetKey);
    }
    if (column.systemKey !== null) {
      const name = column.systemKey === "test_id" ? "테스트 ID" : "제목";
      if (
        systems.has(column.systemKey) ||
        column.name !== name ||
        column.type !== "text" ||
        !column.enabled ||
        (project && column.presetKey !== column.systemKey)
      )
        return fail(
          "테스트 ID와 제목은 항상 켜져 있어야 하며 이름과 형식을 바꿀 수 없습니다.",
        );
      systems.add(column.systemKey);
    }
    const id = column.id.toLowerCase();
    if (ids.has(id)) return fail("같은 항목이 두 번 들어 있습니다.");
    if (columnNames.has(column.name))
      return fail("같은 이름의 항목이 있습니다.");
    ids.add(id);
    column.id = id;
    columnNames.add(column.name);
    if (column.type === "select" || column.type === "tags") {
      if (
        column.options.length < 1 ||
        column.options.length > 50 ||
        column.options.some((v) => v.length < 1 || v.length > 100) ||
        new Set(column.options).size !== column.options.length
      )
        return fail(
          "선택과 태그의 값은 1~50개이며 각 1~100자로 서로 달라야 합니다.",
        );
    } else column.options = [];
    column.colors = optionColors(
      column.options,
      column.presetKey
        ? findPresetColumn(column.presetKey)?.colors
        : column.colors,
    );
  }
  if (systems.size !== 2) return fail("테스트 ID와 제목이 필요합니다.");
  if (project && presets.size !== PRESET_COLUMNS.length)
    return fail("사전 정의 열은 모두 하나씩 있어야 합니다.");
  if (!project && dto.columns[0]?.systemKey !== "test_id")
    return fail("테스트 ID는 맨 앞에 있어야 합니다.");
  return dto;
}
export const PRESET_COLUMNS: readonly Readonly<
  Omit<TemplateColumnDto, "id" | "options"> & { options: readonly string[] }
>[] = Object.freeze(
  (
    [
      {
        presetKey: "test_id",
        systemKey: "test_id",
        enabled: true,
        name: "테스트 ID",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "test_env",
        systemKey: null,
        enabled: true,
        name: "테스트 환경",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "test_case",
        systemKey: null,
        enabled: true,
        name: "테스트 케이스",
        type: "text",
        description: "시나리오 이름",
        options: [],
      },
      {
        presetKey: "title",
        systemKey: "title",
        enabled: true,
        name: "제목",
        type: "text",
        description: "테스트 케이스 안의 하위 시나리오 이름",
        options: [],
      },
      {
        presetKey: "user_role",
        systemKey: null,
        enabled: true,
        name: "사용자/관리자",
        type: "select",
        description: "",
        options: ["사용자", "관리자"],
      },
      {
        presetKey: "screen_id",
        systemKey: null,
        enabled: true,
        name: "화면 ID 또는 URL",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "steps",
        systemKey: null,
        enabled: true,
        name: "수행 절차",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "expected",
        systemKey: null,
        enabled: true,
        name: "예상 결과",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "qa_result",
        systemKey: null,
        enabled: true,
        name: "QA 결과",
        type: "select",
        description: "",
        options: ["Pass", "Fail", "Deferred", "N/A", "-", "추가 요청"],
        colors: {
          Pass: "green",
          Fail: "red",
          Deferred: "yellow",
          "N/A": "gray",
          "-": "gray",
          "추가 요청": "yellow",
        },
      },
      {
        presetKey: "qa_owner",
        systemKey: null,
        enabled: true,
        name: "QA 담당자",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "result_comment",
        systemKey: null,
        enabled: true,
        name: "결과 및 의견",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "dev_status",
        systemKey: null,
        enabled: true,
        name: "개발 진행 상태",
        type: "select",
        description: "",
        options: ["완료", "수정중", "수정 완료", "보류", "기타", "-"],
        colors: {
          완료: "green",
          수정중: "blue",
          "수정 완료": "green",
          보류: "yellow",
          기타: "gray",
          "-": "gray",
        },
      },
      {
        presetKey: "dev_owner",
        systemKey: null,
        enabled: true,
        name: "개발 담당자",
        type: "text",
        description: "",
        options: [],
      },
      {
        presetKey: "extra",
        systemKey: null,
        enabled: false,
        name: "추가 정보",
        type: "text",
        description: "",
        options: [],
      },
    ] satisfies Omit<TemplateColumnDto, "id">[]
  ).map((column) =>
    Object.freeze({
      ...column,
      colors: Object.freeze({
        ...Object.fromEntries(
          column.options.map((option) => [option, "gray" as const]),
        ),
        ...("colors" in column ? column.colors : {}),
      }),
      options: Object.freeze(column.options),
    }),
  ),
);
export function findPresetColumn(presetKey: string) {
  return PRESET_COLUMNS.find((column) => column.presetKey === presetKey);
}
export function defaultColumns(): TemplateColumnDto[] {
  return PRESET_COLUMNS.map((column) => ({
    ...column,
    options: [...column.options],
    colors: { ...column.colors },
    id: randomUUID(),
  }));
}
export function validateTemplate(input: unknown): UpdateTemplateDto {
  return validateColumns(input, true);
}
// 세트는 사전 정의 열 일부를 생략할 수 있다.
export function validateSetColumns(input: unknown): UpdateTemplateDto {
  return validateColumns(input, false);
}
