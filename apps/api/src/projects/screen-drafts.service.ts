import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { AuthorizationService } from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import type {
  ScreenDraftListDto,
  ScreenIdRuleDraftListDto,
} from "../contracts/project.dto";
import { DatabaseService } from "../database/database.service";
import {
  projects,
  screenIdRules,
  screenStructureItems,
} from "../database/schema";
import {
  AiFailure,
  type AiProvider,
  type AiRequest,
} from "../generation/providers/ai-provider";
import { ProviderService } from "../generation/providers/provider.service";
import type { GenerationInput, StepDefinition } from "../generation/types";
import { AiUsageService } from "../generation/usage.service";
import { validatedOutput } from "../generation/validated-output";
import {
  type ColumnsOutput,
  cleanRules,
  columnsSource,
  type ListOutput,
  parseSheet,
  type RulesOutput,
  rulesSource,
  type ScreenDraft,
  screenColumns,
  screenList,
  screenRules,
} from "./screen-drafts";
import { example, matches } from "./screen-id-rules";
import {
  MAX_SOURCE_TOTAL_BYTES,
  readSources,
  type Sources,
  type UploadedSource,
} from "./screen-sources";

// 단발 호출은 테스트 세트 맥락이 없어 빈 입력을 넘긴다.
const NO_CONTEXT: GenerationInput = {
  columns: [],
  memo: "",
  frames: [],
  featureGroups: [],
  viewpoints: [],
  screenStructure: [],
  styleExamples: [],
  existingCases: [],
};
/** 일괄 추가 한도와 같다 */
export const MAX_DRAFTS = 5000;
const notFoundIds = () =>
  new ApiError(
    422,
    "SCREEN_IDS_NOT_FOUND",
    "화면 ID를 찾지 못했습니다. 화면 ID가 있는 파일을 넣어 주세요.",
  );

@Injectable()
export class ScreenDraftsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuthorizationService)
    private readonly authorization: AuthorizationService,
    @Inject(ProviderService) private readonly providers: ProviderService,
    @Inject(AiUsageService) private readonly usage: AiUsageService,
  ) {}

  private async sources(
    projectId: string,
    accountId: string,
    text: string,
    files: UploadedSource[],
  ) {
    await this.authorization.active(accountId);
    const [row] = await this.database.db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId));
    if (!row) throw notFound();
    // multer는 파일 이름을 latin1로 넘긴다.
    const named = files.map((f) => ({
      ...f,
      originalname: Buffer.from(f.originalname, "latin1").toString("utf8"),
    }));
    if (
      named.reduce((sum, f) => sum + f.buffer.length, 0) >
      MAX_SOURCE_TOTAL_BYTES
    )
      throw new ApiError(
        413,
        "FILE_TOO_LARGE",
        "파일은 한 번에 30MB까지 넣을 수 있습니다.",
      );
    const sources = await readSources(text, named);
    if (
      !sources.sheets.length &&
      !sources.texts.length &&
      !sources.images.length
    )
      throw sources.unread.length
        ? new ApiError(
            422,
            "SOURCE_UNREADABLE",
            "파일을 읽지 못했습니다. XLSX, CSV, 텍스트, PNG, JPG 파일을 넣어 주세요.",
          )
        : new ApiError(400, "VALIDATION_ERROR", "자료를 넣어 주세요.");
    return sources;
  }

  // 일시적인 실패는 정의의 재시도 횟수만큼 조용히 다시 시도한다.
  private async run<T>(
    projectId: string,
    definition: StepDefinition,
    sourceData: unknown,
    images: Sources["images"] = [],
  ): Promise<T> {
    const { model, provider } = this.providers.forStage("structure");
    const target = {
      projectId,
      purpose: definition.version,
      fake: this.providers.config.fake,
    };
    const tracked: AiProvider = {
      generate: (request) => this.usage.generate(target, provider, request),
    };
    const request: AiRequest = {
      definition,
      model,
      schema: definition.schema(NO_CONTEXT),
      context: NO_CONTEXT,
      sourceData,
      images: images.map(({ mediaType, data }) => ({ mediaType, data })),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        return (await validatedOutput(tracked, request)).value as T;
      } catch (error) {
        if (
          error instanceof AiFailure &&
          error.retryable &&
          attempt < definition.retries
        )
          continue;
        throw new ApiError(
          503,
          "AI_UNAVAILABLE",
          "AI 응답을 받지 못했습니다. 잠시 후 다시 시도하세요.",
        );
      }
    }
  }

  private rules(projectId: string) {
    return this.database.db
      .select({
        name: screenIdRules.name,
        separator: screenIdRules.separator,
        parts: screenIdRules.parts,
      })
      .from(screenIdRules)
      .where(eq(screenIdRules.projectId, projectId));
  }

  async ruleDrafts(
    projectId: string,
    accountId: string,
    text: string,
    files: UploadedSource[],
  ): Promise<ScreenIdRuleDraftListDto> {
    const sources = await this.sources(projectId, accountId, text, files);
    const existing = (await this.rules(projectId)).map((r) => r.name);
    const source = rulesSource(sources, existing);
    if (!source.screenIds.length && !sources.images.length) throw notFoundIds();
    const output = await this.run<RulesOutput>(
      projectId,
      screenRules,
      source,
      sources.images,
    );
    const items = cleanRules(
      output,
      source.screenIds.map((s) => s.id),
      existing,
    );
    if (!items.length)
      throw new ApiError(
        422,
        "RULES_NOT_FOUND",
        "규칙을 만들지 못했습니다. 다른 자료를 넣거나 직접 만드세요.",
      );
    return {
      items: items.map((rule) => ({ ...rule, example: example(rule) })),
      unreadFiles: sources.unread,
    };
  }

  async screenDrafts(
    projectId: string,
    accountId: string,
    text: string,
    files: UploadedSource[],
  ): Promise<ScreenDraftListDto> {
    const sources = await this.sources(projectId, accountId, text, files);
    const drafts: ScreenDraft[] = [];
    let skipped = 0;
    if (sources.sheets.length) {
      const plan = await this.run<ColumnsOutput>(
        projectId,
        screenColumns,
        columnsSource(sources.sheets),
      );
      for (const [index, sheet] of sources.sheets.entries()) {
        const sheetPlan = plan.sheets.find((p) => p.sheet === index);
        if (!sheetPlan) continue;
        const parsed = parseSheet(sheet, sheetPlan, `s${index}`);
        drafts.push(...parsed.drafts);
        skipped += parsed.withoutId;
      }
    }
    if (sources.texts.length || sources.images.length) {
      const list = await this.run<ListOutput>(
        projectId,
        screenList,
        { texts: sources.texts },
        sources.images,
      );
      // 글만 넣었으면 글에 실제로 있는 ID만 둔다. 이미지는 대조할 수 없다.
      const body = sources.texts.map((t) => t.body).join("\n");
      const screens = sources.images.length
        ? list.screens
        : list.screens.filter((s) => body.includes(s.screenId.trim()));
      const keyOf = new Map(
        screens.map((s, i) => [s.screenId, `l:${i}`] as const),
      );
      drafts.push(
        ...screens.map((s, i) => ({
          key: `l:${i}`,
          screenId: s.screenId.trim(),
          name: s.name.trim() || s.screenId,
          type: s.type,
          parentKey: s.parentScreenId
            ? (keyOf.get(s.parentScreenId) ?? null)
            : null,
          description: s.description,
          group: "",
        })),
      );
      skipped += list.withoutId;
    }
    // 같은 ID가 여러 행이면 첫 행만 두고, 지운 행을 가리키던 하위 화면은 남은 행에 잇는다.
    const kept = new Map<string, string>();
    const alias = new Map<string, string>();
    const unique: ScreenDraft[] = [];
    for (const draft of drafts) {
      const first = kept.get(draft.screenId);
      if (first) alias.set(draft.key, first);
      else if (draft.screenId && draft.name) {
        kept.set(draft.screenId, draft.key);
        unique.push(draft);
      }
    }
    if (!unique.length) throw notFoundIds();
    if (unique.length > MAX_DRAFTS)
      throw new ApiError(
        422,
        "TOO_MANY_SCREENS",
        `화면이 ${MAX_DRAFTS}개를 넘습니다. 파일을 나눠 넣어 주세요.`,
      );
    const existing = new Set(
      (
        await this.database.db
          .select({ screenId: screenStructureItems.screenId })
          .from(screenStructureItems)
          .where(eq(screenStructureItems.projectId, projectId))
      ).map((r) => r.screenId),
    );
    const rules = await this.rules(projectId);
    const keys = new Set(unique.map((d) => d.key));
    const parentOf = new Map(
      unique.map((d) => {
        const parent = d.parentKey
          ? (alias.get(d.parentKey) ?? d.parentKey)
          : null;
        return [d.key, parent && keys.has(parent) ? parent : null] as const;
      }),
    );
    // AI가 서로를 상위로 가리키면 순환을 끊는다
    for (const key of keys) {
      const seen = new Set([key]);
      let at = parentOf.get(key);
      while (at && !seen.has(at)) {
        seen.add(at);
        at = parentOf.get(at);
      }
      if (at) parentOf.set(key, null);
    }
    return {
      items: unique.map((draft) => {
        return {
          ...draft,
          parentKey: parentOf.get(draft.key) ?? null,
          exists: existing.has(draft.screenId),
          ruleMismatch:
            rules.length > 0 && !rules.some((r) => matches(r, draft.screenId)),
        };
      }),
      skipped,
      unreadFiles: sources.unread,
    };
  }
}
