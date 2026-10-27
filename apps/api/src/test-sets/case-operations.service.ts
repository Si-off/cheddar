import { Inject, Injectable } from "@nestjs/common";
import { type Actor, type CaseOp, isCellImage } from "@workspace/contracts";
import { isUUID } from "class-validator";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError, notFound } from "../common/errors";
import { optionColors } from "../contracts/option-colors";
import type { CellValue, OpsResultDto } from "../contracts/test-set.dto";
import type { DatabaseTransaction } from "../database/database.service";
import {
  cellImages,
  featureGroups,
  reviewItems,
  testCases,
  testCaseValues,
  testSetColumns,
  viewPreferences,
} from "../database/schema";
import { findPresetColumn, validateSetColumns } from "../projects/template";
import { forbidden, type SetSubject, TestSetsStore } from "./test-sets.store";
import {
  normalizeValues,
  testIdNumber,
  validateCell,
  validateOps,
  validationFailed,
} from "./values";

// HTTP에도 WebSocket에도 의존하지 않는 편집 경계. 권한, 잠금, 한 요청의 원자성을 함께 보장한다.
@Injectable()
export class CaseOperationsService {
  constructor(@Inject(TestSetsStore) private readonly store: TestSetsStore) {}
  async apply(
    id: string,
    accountId: SetSubject,
    input: unknown,
    connectionId: string | null = null,
  ): Promise<OpsResultDto> {
    if (connectionId !== null && !isUUID(connectionId))
      return validationFailed("연결 정보를 확인해주세요.");
    let committed:
      | { testSetId: string; actor: Actor; ops: CaseOp[] }
      | undefined;
    const result = await this.store.database.db.transaction(async (tx) => {
      const resolved = await this.store.visible(id, accountId, tx, true);
      const result = await this.applyInTransaction(
        tx,
        resolved.row.id,
        accountId,
        input,
        (ops) => {
          committed = {
            testSetId: resolved.row.id,
            actor: resolved.actor,
            ops,
          };
        },
      );
      return result;
    });
    if (committed)
      await this.store.events.publish({
        type: "ops",
        ...committed,
        version: result.version,
        connectionId,
      });
    return result;
  }
  // 생성 결과와 확인 필요 처리를 같은 트랜잭션에서 반영하는 진입점.
  async applyInTransaction(
    tx: DatabaseTransaction,
    id: string,
    accountId: SetSubject,
    input: unknown,
    onApplied?: (ops: CaseOp[]) => void,
  ): Promise<OpsResultDto> {
    const { row, access, actor } = await this.store.visible(
      id,
      accountId,
      tx,
      true,
    );
    id = row.id;
    if (!access.canEdit) throw forbidden();
    const ops = validateOps(input);
    // 링크 방문자는 셀·기능 그룹 편집과 케이스 추가·삭제만 한다.
    if (
      actor.kind === "visitor" &&
      ops.some(
        (op) =>
          ![
            "set_cell",
            "set_feature_group",
            "add_case",
            "delete_cases",
          ].includes(op.type),
      )
    )
      throw forbidden();
    const columns = await this.store.columns(id, tx);
    const columnMap = new Map(columns.map((c) => [c.id, c]));
    const testId = columns.find((c) => c.systemKey === "test_id");
    if (!testId) throw notFound();
    const cases = await this.store.cases(id, tx);
    const byId = new Map(cases.map((c) => [c.id, c]));
    const order = cases.map((c) => c.id);
    const changed = new Set<string>(),
      deleted = new Set<string>();
    let counter = BigInt(row.testIdCounter);
    for (const c of cases) {
      const n = testIdNumber(c.values[testId.id]);
      if (n > counter) counter = n;
    }
    const requireCase = (caseId: string) => {
      const c = byId.get(caseId);
      if (!c) throw notFound();
      return c;
    };
    const requireFeatureGroup = async (featureGroupId: string | null) => {
      if (featureGroupId === null) return;
      const [group] = await tx
        .select({ id: featureGroups.id })
        .from(featureGroups)
        .where(
          and(
            eq(featureGroups.id, featureGroupId),
            eq(featureGroups.projectId, row.projectId),
          ),
        )
        .for("key share");
      if (!group) throw notFound();
    };
    const imageIds = new Set(
      (
        await tx
          .select({ id: cellImages.id })
          .from(cellImages)
          .where(eq(cellImages.testSetId, id))
      ).map((image) => image.id),
    );
    const checkedValues = (values: Record<string, CellValue>) =>
      Object.fromEntries(
        Object.entries(normalizeValues(values)).map(([columnId, value]) => {
          const column = columnMap.get(columnId);
          if (!column) throw notFound();
          return [columnId, validateCell(column, value, imageIds)];
        }),
      );
    const place = (caseId: string, after: string | null) => {
      if (after === caseId)
        return validationFailed("이동할 위치를 확인해주세요.");
      if (after !== null) requireCase(after);
      const index = order.indexOf(caseId);
      if (index >= 0) order.splice(index, 1);
      order.splice(after === null ? 0 : order.indexOf(after) + 1, 0, caseId);
    };
    const saveValues = async (
      caseId: string,
      values: Record<string, CellValue>,
    ) => {
      const entries = Object.entries(values);
      if (entries.length)
        await tx
          .insert(testCaseValues)
          .values(
            entries.map(([columnId, value]) => ({
              testSetId: id,
              caseId,
              columnId,
              value,
            })),
          )
          .onConflictDoUpdate({
            target: [testCaseValues.caseId, testCaseValues.columnId],
            set: { value: sql`excluded.value` },
          });
      const n = testIdNumber(values[testId.id]);
      if (n > counter) counter = n;
    };
    const appliedOps: CaseOp[] = [];
    for (const op of ops) {
      appliedOps.push(op);
      if (op.type === "add_case") {
        if (op.afterCaseId === op.caseId)
          return validationFailed("이동할 위치를 확인해주세요.");
        const featureGroupId =
          op.featureGroupId !== undefined
            ? op.featureGroupId
            : op.afterCaseId === null
              ? null
              : requireCase(op.afterCaseId).featureGroupId;
        await requireFeatureGroup(featureGroupId);
        // 전파되는 연산에도 상속 결과를 넣어 클라이언트 상태를 일치시킨다.
        op.featureGroupId = featureGroupId;
        const values = checkedValues(op.values ?? {});
        if (!values[testId.id]) {
          values[testId.id] = `TC-${String(++counter).padStart(3, "0")}`;
          validateCell(testId, values[testId.id]);
        }
        op.values = values;
        // 전역 UUID 충돌을 포함해 같은 ID의 동시 추가는 409로 통일한다.
        const inserted = await tx
          .insert(testCases)
          .values({
            id: op.caseId,
            testSetId: id,
            position: 0,
            featureGroupId,
            createdBy: actor.kind === "account" ? actor.id : null,
            authorName: actor.name,
          })
          .onConflictDoNothing()
          .returning({ id: testCases.id });
        if (!inserted.length)
          throw new ApiError(
            409,
            "DUPLICATE_CASE",
            "이미 있는 테스트 케이스입니다. 목록을 확인해주세요.",
          );
        byId.set(op.caseId, { id: op.caseId, values, featureGroupId });
        place(op.caseId, op.afterCaseId);
        await saveValues(op.caseId, values);
        deleted.delete(op.caseId);
        changed.add(op.caseId);
      } else if (op.type === "set_feature_group") {
        const c = requireCase(op.caseId);
        await requireFeatureGroup(op.featureGroupId);
        c.featureGroupId = op.featureGroupId;
        await tx
          .update(testCases)
          .set({ featureGroupId: op.featureGroupId, updatedAt: new Date() })
          .where(and(eq(testCases.testSetId, id), eq(testCases.id, op.caseId)));
        changed.add(op.caseId);
      } else if (op.type === "set_cell") {
        const c = requireCase(op.caseId);
        const values = checkedValues({ [op.columnId]: op.value });
        op.value = values[op.columnId];
        Object.assign(c.values, values);
        await saveValues(op.caseId, values);
        await tx
          .update(testCases)
          .set({ updatedAt: new Date() })
          .where(and(eq(testCases.testSetId, id), eq(testCases.id, op.caseId)));
        changed.add(op.caseId);
      } else if (op.type === "delete_cases") {
        for (const caseId of op.caseIds) requireCase(caseId);
        if (op.caseIds.length)
          await tx
            .delete(testCases)
            .where(
              and(
                eq(testCases.testSetId, id),
                inArray(testCases.id, op.caseIds),
              ),
            );
        for (const caseId of new Set(op.caseIds)) {
          byId.delete(caseId);
          order.splice(order.indexOf(caseId), 1);
          changed.delete(caseId);
          deleted.add(caseId);
        }
      } else if (op.type === "add_column") {
        if (
          columnMap.has(op.columnId) ||
          (op.column.presetKey !== null &&
            columns.some((c) => c.presetKey === op.column.presetKey))
        )
          throw new ApiError(409, "COLUMN_EXISTS", "이미 있는 열입니다.");
        if (op.afterColumnId === null)
          return validationFailed("테스트 ID 앞에는 열을 추가할 수 없습니다.");
        const after = columns.findIndex((c) => c.id === op.afterColumnId);
        if (after < 0) throw notFound();
        const candidate = {
          ...op.column,
          id: op.columnId,
          systemKey: op.column.presetKey
            ? (findPresetColumn(op.column.presetKey)?.systemKey ?? null)
            : null,
        };
        const next = [...columns];
        next.splice(after + 1, 0, candidate);
        const validated = validateSetColumns({
          revision: 1,
          columns: next.map((c) => ({ ...c, enabled: true })),
        }).columns[after + 1];
        const { enabled: _enabled, ...column } = validated;
        const inserted = await tx
          .insert(testSetColumns)
          .values({ ...column, testSetId: id, position: after + 1 })
          .onConflictDoNothing()
          .returning({ id: testSetColumns.id });
        if (!inserted.length)
          throw new ApiError(409, "COLUMN_EXISTS", "이미 있는 열입니다.");
        columns.splice(after + 1, 0, column);
        columnMap.set(column.id, column);
        op.column = {
          name: column.name,
          type: column.type,
          description: column.description,
          options: column.options,
          colors: column.colors ?? {},
          presetKey: column.presetKey,
        };
      } else if (op.type === "update_column") {
        const column = columnMap.get(op.columnId);
        if (!column) throw notFound();
        if (
          op.columnType !== undefined &&
          (column.presetKey !== null || column.type !== "text")
        )
          return validationFailed(
            "드롭다운은 사용자 텍스트 열에만 만들 수 있습니다.",
          );
        if (op.columnType !== undefined && op.options === undefined)
          return validationFailed("드롭다운의 선택 항목을 지정해주세요.");
        if (column.presetKey !== null)
          throw new ApiError(
            400,
            "COLUMN_NOT_EDITABLE",
            "사전 정의 열은 변경할 수 없습니다.",
          );
        if (columns.some((c) => c.id !== column.id && c.name === op.name))
          return validationFailed("열 이름은 세트 안에서 중복될 수 없습니다.");
        // 항목 규칙은 양식 검사와 같다. 셀 값은 Excel의 목록처럼 그대로 둔다.
        const options =
          op.options === undefined
            ? column.options
            : validateSetColumns({
                revision: 1,
                columns: columns.map((c) => ({
                  ...c,
                  enabled: true,
                  ...(c.id === column.id
                    ? { options: op.options, type: op.columnType ?? c.type }
                    : {}),
                })),
              }).columns[columns.indexOf(column)].options;
        if (op.options !== undefined) op.options = options;
        const colors = optionColors(options, op.colors ?? column.colors);
        if (op.colors !== undefined || op.options !== undefined)
          op.colors = colors;
        const type = op.columnType ?? column.type;
        Object.assign(column, {
          type,
          colors,
          name: op.name,
          description: op.description,
          options,
        });
        await tx
          .update(testSetColumns)
          .set({
            name: op.name,
            description: op.description,
            options,
            colors,
            type,
          })
          .where(
            and(
              eq(testSetColumns.testSetId, id),
              eq(testSetColumns.id, column.id),
            ),
          );
        if (op.columnType !== undefined) {
          for (const c of byId.values()) {
            if (!isCellImage(c.values[column.id])) continue;
            c.values[column.id] = null;
            await saveValues(c.id, { [column.id]: null });
            changed.add(c.id);
            appliedOps.push({
              type: "set_cell",
              caseId: c.id,
              columnId: column.id,
              value: null,
            });
          }
        }
      } else if (op.type === "remove_column") {
        const column = columnMap.get(op.columnId);
        if (!column) throw notFound();
        if (column.systemKey)
          return validationFailed("테스트 ID와 제목은 삭제할 수 없습니다.");
        const prefs = await tx
          .select()
          .from(viewPreferences)
          .where(eq(viewPreferences.testSetId, id));
        for (const pref of prefs) {
          const widths = { ...pref.columnWidths };
          delete widths[column.id];
          await tx
            .update(viewPreferences)
            .set({
              columnWidths: widths,
              groupByColumnId:
                pref.groupByColumnId === column.id
                  ? null
                  : pref.groupByColumnId,
              canvasGroup:
                pref.groupByColumnId === column.id &&
                pref.canvasGroup === "column"
                  ? "feature"
                  : pref.canvasGroup,
            })
            .where(eq(viewPreferences.id, pref.id));
        }
        await tx
          .update(reviewItems)
          .set({
            draft: sql`${reviewItems.draft} - ${column.id}`,
            updatedAt: new Date(),
          })
          .where(eq(reviewItems.testSetId, id));
        // FK cascade가 이 열의 test_case_values도 함께 지운다.
        await tx
          .delete(testSetColumns)
          .where(
            and(
              eq(testSetColumns.testSetId, id),
              eq(testSetColumns.id, column.id),
            ),
          );
        columns.splice(
          columns.findIndex((c) => c.id === column.id),
          1,
        );
        columnMap.delete(column.id);
        for (const c of byId.values()) {
          if (Object.hasOwn(c.values, column.id)) {
            delete c.values[column.id];
            changed.add(c.id);
          }
        }
      } else if (op.type === "reorder_columns") {
        if (
          op.columnIds.length !== columns.length ||
          new Set(op.columnIds).size !== columns.length ||
          op.columnIds.some((id) => !columnMap.has(id))
        )
          throw new ApiError(
            409,
            "STALE_ORDER",
            "열 목록이 변경되었습니다. 다시 확인해주세요.",
          );
        if (op.columnIds[0] !== testId.id)
          return validationFailed("테스트 ID는 맨 앞에 있어야 합니다.");
        columns.splice(
          0,
          columns.length,
          ...op.columnIds.map((id) => {
            const column = columnMap.get(id);
            if (!column) throw notFound();
            return column;
          }),
        );
      } else {
        requireCase(op.caseId);
        place(op.caseId, op.afterCaseId);
        changed.add(op.caseId);
      }
    }
    if (
      ops.some((op) =>
        ["add_column", "remove_column", "reorder_columns"].includes(op.type),
      )
    )
      for (const [position, column] of columns.entries())
        await tx
          .update(testSetColumns)
          .set({ position })
          .where(
            and(
              eq(testSetColumns.testSetId, id),
              eq(testSetColumns.id, column.id),
            ),
          );
    for (const [position, caseId] of order.entries())
      await tx
        .update(testCases)
        .set({ position })
        .where(and(eq(testCases.testSetId, id), eq(testCases.id, caseId)));
    if (deleted.size) {
      const prefs = await tx
        .select()
        .from(viewPreferences)
        .where(eq(viewPreferences.testSetId, id));
      for (const pref of prefs)
        await tx
          .update(viewPreferences)
          .set({
            rowHeights: Object.fromEntries(
              Object.entries(pref.rowHeights).filter(([caseId]) =>
                byId.has(caseId),
              ),
            ),
          })
          .where(eq(viewPreferences.id, pref.id));
    }
    const version = await this.store.bump(id, tx, String(counter));
    onApplied?.(appliedOps);
    return {
      version,
      cases: order.filter((caseId) => changed.has(caseId)).map(requireCase),
      deletedCaseIds: [...deleted],
    };
  }
}
