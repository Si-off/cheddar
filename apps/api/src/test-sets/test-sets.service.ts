import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import type { IdentityDatabase } from "../authorization/authorization.service";
import { ApiError, notFound } from "../common/errors";
import type {
  ColumnsResultDto,
  CreateTestSetDto,
  TestSetDto,
  TestSetListDto,
  TestSetQueryDto,
  TestSetViewDto,
  UpdateTestSetDto,
} from "../contracts/test-set.dto";
import {
  accounts,
  projects,
  projectTemplates,
  reviewItems,
  testCases,
  testCaseValues,
  testSetColumns,
  testSetMembers,
  testSets,
  viewPreferences,
} from "../database/schema";
import { validateSetColumns } from "../projects/template";
import {
  forbidden,
  hasGrant,
  type SetSubject,
  setAccess,
  TestSetsStore,
} from "./test-sets.store";
import {
  cellText,
  normalizeValues,
  reconcileValue,
  testIdNumber,
  validateView,
  validationFailed,
} from "./values";

const defaultView = (): TestSetViewDto => ({
  view: "table",
  groupByColumnId: null,
  columnWidths: {},
  rowHeights: {},
});
@Injectable()
export class TestSetsService {
  constructor(@Inject(TestSetsStore) private readonly store: TestSetsStore) {}
  async denyDetail(id: string): Promise<void> {
    const [owner] = await this.store.database.db
      .select({ ownerName: accounts.name })
      .from(testSets)
      .innerJoin(accounts, eq(accounts.id, testSets.ownerId))
      .where(eq(testSets.id, id));
    if (owner)
      throw new ApiError(
        403,
        "NO_ACCESS",
        "이 테스트 세트를 볼 권한이 없습니다.",
        owner,
      );
  }
  async list(
    accountId: string,
    query: TestSetQueryDto,
  ): Promise<TestSetListDto> {
    const db = this.store.database.db;
    const grants = await this.store.authorization.effective(accountId);
    const rows = await db
      .select({
        row: testSets,
        owner: { id: accounts.id, name: accounts.name },
        member: testSetMembers.access,
        caseCount: sql<number>`(select count(*)::int from ${testCases} where ${testCases.testSetId} = ${testSets.id})`,
        reviewCount: sql<number>`(select count(*)::int from ${reviewItems} where ${reviewItems.testSetId} = ${testSets.id} and ${reviewItems.status} in ('pending','rewriting'))`,
      })
      .from(testSets)
      .innerJoin(accounts, eq(accounts.id, testSets.ownerId))
      .leftJoin(
        testSetMembers,
        and(
          eq(testSetMembers.testSetId, testSets.id),
          eq(testSetMembers.accountId, accountId),
        ),
      )
      .orderBy(desc(testSets.updatedAt), testSets.id);
    return {
      items: rows
        .filter(
          ({ row, member }) =>
            setAccess(row, accountId, member ?? undefined, grants).canView &&
            (query.filter !== "mine" || row.ownerId === accountId) &&
            (query.filter !== "shared" ||
              (!!member && row.ownerId !== accountId)) &&
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
      const grants = await this.store.authorization.effective(accountId, tx);
      if (
        !this.store.authorization.projectAccess(grants, dto.projectId).canView
      )
        throw notFound();
      // 기본 양식 변경과 같은 프로젝트 잠금을 사용해 완성된 사본만 만든다.
      const [project] = await tx
        .select()
        .from(projects)
        .where(eq(projects.id, dto.projectId))
        .for("update");
      if (!project) throw notFound();
      if (!hasGrant(grants, "test_set.create", dto.projectId))
        throw forbidden();
      const [template] = await tx
        .select()
        .from(projectTemplates)
        .where(eq(projectTemplates.projectId, dto.projectId));
      if (!template) throw notFound();
      const columns = validateSetColumns({
        revision: template.revision,
        columns: template.columns,
      })
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
  saveColumns(
    id: string,
    accountId: string,
    input: { columns: unknown },
  ): Promise<ColumnsResultDto> {
    return this.store.mutate(id, accountId, "canEdit", async (tx, row) => {
      // HTTP 전용 DTO에 기대지 않고 기존 기본 양식 검증을 그대로 재사용한다.
      const old = await this.store.columns(id, tx);
      const columns = validateSetColumns({
        revision: 1,
        columns: Array.isArray(input.columns)
          ? input.columns.map((c) => {
              const previous = old.find(
                (column) =>
                  typeof c?.id === "string" && column.id === c.id.toLowerCase(),
              );
              return {
                ...c,
                enabled: true,
                presetKey: previous
                  ? previous.presetKey
                  : (c?.presetKey ?? null),
              };
            })
          : input.columns,
      }).columns.map(({ enabled: _enabled, ...c }) => c);
      const cases = await this.store.cases(id, tx);
      let counter = BigInt(row.testIdCounter);
      const oldTestId = old.find((c) => c.systemKey === "test_id")?.id;
      for (const c of cases) {
        const n = testIdNumber(oldTestId ? c.values[oldTestId] : undefined);
        if (n > counter) counter = n;
      }
      const oldIds = new Set(old.map((c) => c.id));
      const newIds = new Set(columns.map((c) => c.id));
      const removed = old.filter((c) => !newIds.has(c.id)).map((c) => c.id);
      const prefs = await tx
        .select()
        .from(viewPreferences)
        .where(eq(viewPreferences.testSetId, id));
      for (const pref of prefs) {
        const group = columns.find(
          (c) => c.id === pref.groupByColumnId && c.type !== "text",
        );
        await tx
          .update(viewPreferences)
          .set({
            groupByColumnId: group?.id ?? null,
            columnWidths: Object.fromEntries(
              Object.entries(pref.columnWidths).filter(([key]) =>
                newIds.has(key),
              ),
            ),
          })
          .where(eq(viewPreferences.id, pref.id));
      }
      if (removed.length)
        await tx
          .delete(testSetColumns)
          .where(
            and(
              eq(testSetColumns.testSetId, id),
              inArray(testSetColumns.id, removed),
            ),
          );
      // 기존 시스템 열 ID의 교체도 검증 함수가 허용한다. 시스템 키의 유일 제약 충돌을 피한다.
      await tx
        .update(testSetColumns)
        .set({ systemKey: null })
        .where(eq(testSetColumns.testSetId, id));
      for (const [position, c] of columns.entries()) {
        if (oldIds.has(c.id))
          await tx
            .update(testSetColumns)
            .set({ ...c, position })
            .where(
              and(
                eq(testSetColumns.testSetId, id),
                eq(testSetColumns.id, c.id),
              ),
            );
        else {
          const inserted = await tx
            .insert(testSetColumns)
            .values({ ...c, testSetId: id, position })
            .onConflictDoNothing()
            .returning({ id: testSetColumns.id });
          if (!inserted.length)
            return validationFailed(
              "다른 테스트 세트의 항목은 사용할 수 없습니다.",
            );
        }
      }
      const columnMap = new Map(columns.map((c) => [c.id, c]));
      const reviews = await tx
        .select()
        .from(reviewItems)
        .where(eq(reviewItems.testSetId, id));
      for (const item of reviews) {
        const draft = Object.fromEntries(
          Object.entries(normalizeValues(item.draft)).flatMap(
            ([key, value]) => {
              const column = columnMap.get(key);
              const next = column ? reconcileValue(column, value) : undefined;
              return next === undefined ? [] : [[key, next]];
            },
          ),
        );
        await tx
          .update(reviewItems)
          .set({ draft, updatedAt: new Date() })
          .where(eq(reviewItems.id, item.id));
      }
      const testId = columns[0].id;
      for (const c of cases) {
        for (const [columnId, value] of Object.entries(c.values)) {
          const column = columnMap.get(columnId);
          if (!column) {
            delete c.values[columnId];
            continue;
          }
          const next = reconcileValue(column, value);
          if (next === undefined) {
            await tx
              .delete(testCaseValues)
              .where(
                and(
                  eq(testCaseValues.caseId, c.id),
                  eq(testCaseValues.columnId, columnId),
                  eq(testCaseValues.testSetId, id),
                ),
              );
            delete c.values[columnId];
          } else {
            await tx
              .update(testCaseValues)
              .set({ value: next })
              .where(
                and(
                  eq(testCaseValues.caseId, c.id),
                  eq(testCaseValues.columnId, columnId),
                  eq(testCaseValues.testSetId, id),
                ),
              );
            c.values[columnId] = next;
          }
        }
        const n = testIdNumber(c.values[testId]);
        if (n > counter) counter = n;
      }
      return {
        version: await this.store.bump(id, tx, String(counter)),
        columns,
        cases,
      };
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
          view: pref.view as "table" | "card",
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
    sheet.addRow(set.columns.map((c) => c.name));
    sheet.getRow(1).font = { bold: true };
    for (const c of set.cases)
      sheet.addRow(set.columns.map((col) => cellText(c.values[col.id])));
    sheet.columns.forEach((column) => {
      column.width = 24;
      column.alignment = { wrapText: true, vertical: "top" };
    });
    const data = new Uint8Array(await workbook.xlsx.writeBuffer());
    return { fileName: `${set.name}.xlsx`, data };
  }
}
