import { createHash } from "node:crypto";
import type { TestSetColumnDto } from "../../contracts/test-set.dto";
import { sheetV1 } from "./sheet-v1";
import type { Guide } from "./types";

export type { DecompositionRule, Guide, Viewpoint } from "./types";

/** 비교 실험을 위해 이전 지침도 남긴다. 작업 입력에 기록된 지침은 지우지 않는다. */
export const GUIDES: Readonly<Record<string, Guide>> = {
  [sheetV1.id]: sheetV1,
};
export const DEFAULT_GUIDE = sheetV1.id;

/** 작업을 만들 때 기록한 지침. 기록이 없는 이전 작업은 기본 지침을 쓴다. */
export function guideOf(input: { guide?: string }): Guide {
  const id = input.guide ?? DEFAULT_GUIDE;
  if (!Object.hasOwn(GUIDES, id))
    throw new Error(`알 수 없는 작성 지침입니다: ${id}`);
  return GUIDES[id];
}

/** 단계 프롬프트와 지침 내용이 같으면 같은 값이다. 단계 기록의 프롬프트 버전으로 쓴다. */
export function promptVersion(
  step: { version: string; prompt: string },
  guide: Guide,
) {
  const hash = createHash("sha256")
    .update(JSON.stringify([step.prompt, guide]))
    .digest("hex")
    .slice(0, 8);
  return `${step.version}+${guide.id}@${hash}`;
}

export const columnRule = (column: TestSetColumnDto, guide: Guide) =>
  column.presetKey === null
    ? `${column.name} (${column.type}): ${column.description}. 자료에 근거가 없으면 빈 값으로 둔다.`
    : (guide.columns[column.presetKey] ?? column.description);

export function applicableViewpoints(
  guide: Guide,
  frames: { name: string }[],
  screenStructure: unknown[],
) {
  const admin =
    /관리자|어드민|(?:^|[^a-z])admin(?:istrator)?(?:$|[^a-z])|back[ _-]?office/i.test(
      JSON.stringify([
        frames.map((frame) => frame.name),
        screenStructure.map((item) => {
          if (!item || typeof item !== "object") return "";
          const screen = item as { name?: unknown; screenId?: unknown };
          return [screen.name, screen.screenId];
        }),
      ]),
    );
  return guide.viewpoints
    .filter((viewpoint) => admin || !viewpoint.admin)
    .map(({ id, name, when }) => ({ id, name, when }));
}
