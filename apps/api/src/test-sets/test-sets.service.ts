import { randomUUID } from "node:crypto";
import { isCellImage } from "@cheddar/contracts";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import sharp from "sharp";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { notFound } from "../common/errors";
import type { TemplateColumnDto } from "../contracts/project.dto";
import type {
  CreateTestSetDto,
  RecentTemplateDto,
  TestSetDto,
  TestSetListDto,
  TestSetQueryDto,
  TestSetViewDto,
  UpdateTestSetDto,
} from "../contracts/test-set.dto";
import {
  accounts,
  featureGroups,
  projects,
  projectTemplates,
  reviewItems,
  testCases,
  testSetColumns,
  testSets,
  viewPreferences,
} from "../database/schema";
import { validateSetColumns } from "../projects/template";
import { CellImagesService } from "./cell-images.service";
import { forbidden, type SetSubject, TestSetsStore } from "./test-sets.store";
import { cellText, validateView, validationFailed } from "./values";

const defaultView = (): TestSetViewDto => ({
  view: "table",
  canvasGroup: "feature",
  canvasDensity: "brief",
  groupByColumnId: null,
  columnWidths: {},
  rowHeights: {},
});
@Injectable()
export class TestSetsService {
  constructor(
    @Inject(TestSetsStore) private readonly store: TestSetsStore,
    @Inject(CellImagesService) private readonly images: CellImagesService,
  ) {}
  async list(
    accountId: string,
    query: TestSetQueryDto,
  ): Promise<TestSetListDto> {
    const db = this.store.database.db;
    await this.store.authorization.active(accountId);
    const rows = await db
      .select({
        row: testSets,
        owner: { id: accounts.id, name: accounts.name },
        caseCount: sql<number>`(select count(*)::int from ${testCases} where ${testCases.testSetId} = ${testSets.id})`,
        reviewCount: sql<number>`(select count(*)::int from ${reviewItems} where ${reviewItems.testSetId} = ${testSets.id} and ${reviewItems.status} in ('pending','rewriting'))`,
      })
      .from(testSets)
      .innerJoin(accounts, eq(accounts.id, testSets.ownerId))
      .orderBy(desc(testSets.updatedAt), testSets.id);
    return {
      items: rows
        .filter(
          ({ row }) =>
            (query.filter !== "mine" || row.ownerId === accountId) &&
            row.name.toLowerCase().includes(query.search.toLowerCase()),
        )
        .map(({ row, owner, caseCount, reviewCount }) => ({
          id: row.id,
          name: row.name,
          owner,
          isPublic: row.visibility === "public",
          caseCount,
          reviewCount,
          updatedAt: row.updatedAt.toISOString(),
        })),
    };
  }
  async create(accountId: string, dto: CreateTestSetDto): Promise<TestSetDto> {
    return this.store.database.db.transaction(async (tx) => {
      await this.store.authorization.active(accountId, tx);
      // 기본 양식 변경과 같은 프로젝트 잠금을 사용해 완성된 사본만 만든다.
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, dto.projectId))
        .for("update");
      if (!project) throw notFound();
      const [template] = await tx
        .select()
        .from(projectTemplates)
        .where(eq(projectTemplates.projectId, dto.projectId));
      if (!template) throw notFound();
      let source = template.columns;
      if (dto.template?.kind === "custom") source = dto.template.columns;
      if (dto.template?.kind === "recent") {
        source = (
          await this.resolveRecentTemplate(
            dto.projectId,
            accountId,
            template.columns,
            tx,
            true,
          )
        ).columns.map((c) => ({ ...c, enabled: true }));
      }
      const columns = validateSetColumns({ revision: 1, columns: source })
        .columns.filter((c) => c.enabled)
        .map(({ enabled: _enabled, ...c }) => ({ ...c, id: randomUUID() }));
      const [row] = await tx
        .insert(testSets)
        .values({
          projectId: dto.projectId,
          ownerId: accountId,
          name: dto.name,
          memo: dto.memo,
        })
        .returning();
      await tx
        .insert(testSetColumns)
        .values(
          columns.map((c, position) => ({ ...c, testSetId: row.id, position })),
        );
      return this.detail(row.id, accountId, tx);
    });
  }
  async recentTemplate(
    projectId: string,
    accountId: string,
  ): Promise<RecentTemplateDto> {
    return this.store.database.db.transaction(
      async (tx) => {
        await this.store.authorization.active(accountId, tx);
        const [template] = await tx
          .select({ columns: projectTemplates.columns })
          .from(projects)
          .innerJoin(
            projectTemplates,
            eq(projectTemplates.projectId, projects.id),
          )
          .where(eq(projects.id, projectId));
        if (!template) throw notFound();
        return this.resolveRecentTemplate(
          projectId,
          accountId,
          template.columns,
          tx,
        );
      },
      { isolationLevel: "repeatable read", accessMode: "read only" },
    );
  }
  private async resolveRecentTemplate(
    projectId: string,
    accountId: string,
    fallback: TemplateColumnDto[],
    db: IdentityDatabase,
    lock = false,
  ): Promise<RecentTemplateDto> {
    const candidates = await db
      .select({ row: testSets })
      .from(testSets)
      .where(eq(testSets.projectId, projectId))
      .orderBy(desc(testSets.updatedAt), testSets.id);
    for (const { row } of candidates) {
      // 만들기는 열 연산과 삭제가 사본을 읽는 도중 끼어들지 않게 잠근다.
      if (lock) await this.store.visible(row.id, accountId, db, true);
      return {
        testSet: { id: row.id, name: row.name },
        columns: await this.store.columns(row.id, db),
      };
    }
    return {
      testSet: null,
      columns: validateSetColumns({ revision: 1, columns: fallback })
        .columns.filter((c) => c.enabled)
        .map(({ enabled: _enabled, ...c }) => c),
    };
  }
  async detail(
    id: string,
    accountId: SetSubject,
    db: IdentityDatabase = this.store.database.db,
  ): Promise<TestSetDto> {
    // version과 열, 케이스를 같은 스냅샷으로 읽어 공동 편집의 시작 상태를 일치시킨다.
    if (db === this.store.database.db)
      return this.store.database.db.transaction(
        (tx) => this.detail(id, accountId, tx),
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    const { row, access } = await this.store.visible(id, accountId, db);
    id = row.id;
    const [owner] = await db
      .select({ id: accounts.id, name: accounts.name })
      .from(accounts)
      .where(eq(accounts.id, row.ownerId));
    const [project] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, row.projectId));
    return {
      id: row.id,
      name: row.name,
      memo: row.memo,
      owner,
      project,
      isPublic: row.visibility === "public",
      version: row.version,
      access,
      columns: await this.store.columns(id, db),
      cases: await this.store.cases(id, db),
      featureGroups: await db
        .select({ id: featureGroups.id, name: featureGroups.name })
        .from(featureGroups)
        .where(eq(featureGroups.projectId, row.projectId))
        .orderBy(featureGroups.position, featureGroups.id),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
  update(id: string, accountId: string, dto: UpdateTestSetDto) {
    return this.store.mutate(id, accountId, "canRename", async (tx) => {
      if (dto.name !== undefined || dto.memo !== undefined)
        await tx
          .update(testSets)
          .set({
            ...(dto.name === undefined ? {} : { name: dto.name }),
            ...(dto.memo === undefined ? {} : { memo: dto.memo }),
          })
          .where(eq(testSets.id, id));
      await this.store.bump(id, tx);
      return this.detail(id, accountId, tx);
    });
  }
  remove(id: string, accountId: string) {
    return this.store.mutate(id, accountId, "canDelete", async (tx) => {
      // 묶기 열의 RESTRICT FK를 먼저 해제한다.
      await tx.delete(viewPreferences).where(eq(viewPreferences.testSetId, id));
      await tx.delete(testSets).where(eq(testSets.id, id));
    });
  }
  async view(id: string, accountId: SetSubject): Promise<TestSetViewDto> {
    const resolved = await this.store.visible(id, accountId);
    id = resolved.row.id;
    const [pref] = await this.store.database.db
      .select()
      .from(viewPreferences)
      .where(
        and(
          eq(viewPreferences.testSetId, id),
          resolved.actor.kind === "account"
            ? eq(viewPreferences.accountId, resolved.actor.id)
            : eq(viewPreferences.visitorSessionId, resolved.actor.id),
        ),
      );
    return pref
      ? {
          view: pref.view as TestSetViewDto["view"],
          canvasGroup: pref.canvasGroup,
          canvasDensity: pref.canvasDensity,
          groupByColumnId: pref.groupByColumnId,
          columnWidths: pref.columnWidths,
          rowHeights: pref.rowHeights,
        }
      : defaultView();
  }
  saveView(
    id: string,
    accountId: SetSubject,
    input: unknown,
  ): Promise<TestSetViewDto> {
    return this.store.database.db.transaction(async (tx) => {
      const resolved = await this.store.visible(id, accountId, tx, true);
      id = resolved.row.id;
      const dto = validateView(input);
      const columns = await this.store.columns(id, tx);
      if (
        dto.groupByColumnId !== null &&
        !columns.some((c) => c.id === dto.groupByColumnId && c.type !== "text")
      )
        return validationFailed(
          "묶기 기준은 선택, 태그, 체크박스 항목에서 골라주세요.",
        );
      const caseIds = new Set(
        (await this.store.cases(id, tx)).map((c) => c.id),
      );
      if (
        Object.keys(dto.columnWidths).some(
          (key) => !columns.some((c) => c.id === key),
        ) ||
        Object.keys(dto.rowHeights).some((key) => !caseIds.has(key))
      )
        return validationFailed(
          "이 테스트 세트의 항목과 케이스를 선택해주세요.",
        );
      await tx
        .insert(viewPreferences)
        .values({
          ...dto,
          testSetId: id,
          ...(resolved.actor.kind === "account"
            ? { accountId: resolved.actor.id }
            : { visitorSessionId: resolved.actor.id }),
        })
        .onConflictDoUpdate({
          target: [
            viewPreferences.testSetId,
            resolved.actor.kind === "account"
              ? viewPreferences.accountId
              : viewPreferences.visitorSessionId,
          ],
          set: { ...dto, updatedAt: new Date() },
        });
      return dto;
    });
  }
  /** 저장된 전체 케이스를 현재 열 이름과 순서로 내보낸다. 확인 필요 항목은 넣지 않는다. */
  async export(
    id: string,
    accountId: SetSubject,
  ): Promise<{ fileName: string; data: Uint8Array }> {
    const set = await this.detail(id, accountId);
    if (!set.access.canExport) throw forbidden();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("테스트 케이스");
    const groups = [
      { keys: ["qa_result", "qa_owner"], name: "QA 진행" },
      { keys: ["dev_status", "dev_owner"], name: "개발 작업상황" },
    ].flatMap((group) => {
      const indices = group.keys.map((key) =>
        set.columns.findIndex((c) => c.presetKey === key),
      );
      return indices.every((index) => index >= 0) &&
        Math.abs(indices[0] - indices[1]) === 1
        ? [
            {
              start: Math.min(...indices) + 1,
              end: Math.max(...indices) + 1,
              name: group.name,
            },
          ]
        : [];
    });
    const headerRows = groups.length ? 2 : 1;
    if (groups.length) {
      sheet.addRow(set.columns.map(() => ""));
      for (const group of groups) {
        sheet.getCell(1, group.start).value = group.name;
        sheet.mergeCells(1, group.start, 1, group.end);
      }
    }
    sheet.addRow(set.columns.map((c) => c.name));
    for (let row = 1; row <= headerRows; row++)
      sheet.getRow(row).font = { bold: true };
    for (const c of set.cases)
      sheet.addRow(set.columns.map((col) => cellText(c.values[col.id])));
    const mergeKeys = new Set([
      "test_env",
      "test_case",
      "title",
      "screen_id",
      "steps",
    ]);
    // 테스트 환경과 테스트 케이스가 끊기면 뒤쪽 병합 열도 끊긴다. 나머지는 서로의 경계를 넘는다.
    const boundaryKeys = new Set(["test_env", "test_case"]);
    const boundaries = new Set<number>([0, set.cases.length]);
    for (const [index, column] of set.columns.entries()) {
      if (!column.presetKey || !mergeKeys.has(column.presetKey)) continue;
      // 화면과 같이 글자가 같은 값만 묶는다.
      const values = set.cases.map((c) => cellText(c.values[column.id]));
      const own = boundaryKeys.has(column.presetKey)
        ? boundaries
        : new Set(boundaries);
      for (let row = 1; row < values.length; row++)
        if (!values[row] || values[row] !== values[row - 1]) own.add(row);
      let start = 0;
      for (let end = 1; end <= values.length; end++) {
        if (!own.has(end)) continue;
        if (values[start] && end - start > 1)
          sheet.mergeCells(
            start + headerRows + 1,
            index + 1,
            end + headerRows,
            index + 1,
          );
        start = end;
      }
    }
    sheet.columns.forEach((column) => {
      column.width = 24;
      column.alignment = { wrapText: true, vertical: "top" };
    });
    // 선택 열은 시트에서도 드롭다운으로 고르게 한다. 목록은 숨긴 시트에 두어 255자 제한을 피한다.
    // 목록에 없는 기존 값은 Excel처럼 그대로 둔다. 태그는 Excel에 여러 값 고르기가 없어 글자로만 둔다.
    const selects = set.columns.flatMap((column, index) =>
      column.type === "select" && column.options.length
        ? [{ column, index }]
        : [],
    );
    if (selects.length) {
      const lists = workbook.addWorksheet("목록", { state: "veryHidden" });
      for (const [listIndex, { column, index }] of selects.entries()) {
        const letter = lists.getColumn(listIndex + 1).letter;
        column.options.forEach((option, row) => {
          lists.getCell(row + 1, listIndex + 1).value = option;
        });
        const range = `'목록'!$${letter}$1:$${letter}$${column.options.length}`;
        for (let row = 1; row <= set.cases.length; row++)
          sheet.getCell(row + headerRows, index + 1).dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [range],
          };
      }
    }
    const palette = {
      red: ["FFF0F1", "B33745"],
      yellow: ["FFF6DF", "8A5800"],
      green: ["EDF7F0", "216E4E"],
      teal: ["EAF4F2", "265F5B"],
      blue: ["EDF4FF", "255EAB"],
      purple: ["EDEDF8", "454682"],
    } as const;
    let priority = 1;
    if (set.cases.length)
      for (const { column, index } of selects) {
        const letter = sheet.getColumn(index + 1).letter;
        for (const [option, color] of Object.entries(column.colors ?? {})) {
          if (color === "gray" || !column.options.includes(option)) continue;
          const [background, foreground] = palette[color];
          sheet.addConditionalFormatting({
            ref: `${letter}${headerRows + 1}:${letter}${headerRows + set.cases.length}`,
            rules: [
              {
                type: "cellIs",
                operator: "equal",
                priority: priority++,
                formulae: [`"${option.replace(/"/g, '""')}"`],
                style: {
                  fill: {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: `FF${background}` },
                  },
                  font: { color: { argb: `FF${foreground}` } },
                },
              },
            ],
          });
        }
      }
    const imageCache = new Map<
      string,
      { id: number; width: number; height: number }
    >();
    for (const [caseIndex, c] of set.cases.entries()) {
      const row = caseIndex + headerRows + 1;
      const placements: {
        index: number;
        id: number;
        width: number;
        height: number;
      }[] = [];
      for (const [index, col] of set.columns.entries()) {
        const value = c.values[col.id];
        if (!isCellImage(value)) continue;
        let image = imageCache.get(value.image);
        if (!image) {
          const stored = await this.images.read(set.id, accountId, value.image);
          // Excel은 WebP를 지원하지 않아 내보낼 때 첫 프레임을 PNG로 바꾼다.
          // 휴대폰 사진의 EXIF 방향은 PNG에 남지 않으므로 픽셀을 먼저 돌리고, 돌린 크기로 배치한다.
          const { data: bytes, info } = await sharp(stored.bytes)
            .rotate()
            .png()
            .toBuffer({ resolveWithObject: true });
          const imageId = workbook.addImage({
            base64: bytes.toString("base64"),
            extension: "png",
          });
          image = { id: imageId, width: info.width, height: info.height };
          imageCache.set(value.image, image);
        }
        const scale = Math.min(1, 160 / image.width, 96 / image.height);
        placements.push({
          index,
          id: image.id,
          width: image.width * scale,
          height: image.height * scale,
        });
      }
      if (!placements.length) continue;
      sheet.getRow(row).height = Math.max(
        20,
        ...placements.map((p) => (p.height + 8) * 0.75),
      );
      for (const p of placements)
        sheet.addImage(p.id, {
          tl: { col: p.index + 0.02, row: row - 1 + 0.02 },
          ext: { width: p.width, height: p.height },
          editAs: "oneCell",
        });
    }
    const data = new Uint8Array(await workbook.xlsx.writeBuffer());
    return { fileName: `${set.name}.xlsx`, data };
  }
}
