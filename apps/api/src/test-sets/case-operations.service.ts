import { Inject, Injectable } from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ApiError, notFound } from "../common/errors";
import type { CellValue, OpsResultDto } from "../contracts/test-set.dto";
import {
  accounts,
  testCases,
  testCaseValues,
  viewPreferences,
} from "../database/schema";
import { TestSetsStore } from "./test-sets.store";
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
    accountId: string,
    input: unknown,
  ): Promise<OpsResultDto> {
    return this.store.mutate(id, accountId, "canEdit", async (tx, row) => {
      const ops = validateOps(input);
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
      const [author] = await tx
        .select({ name: accounts.name })
        .from(accounts)
        .where(eq(accounts.id, accountId));
      if (!author) throw notFound();
      const requireCase = (caseId: string) => {
        const c = byId.get(caseId);
        if (!c) throw notFound();
        return c;
      };
      const checkedValues = (values: Record<string, CellValue>) =>
        Object.fromEntries(
          Object.entries(normalizeValues(values)).map(([columnId, value]) => {
            const column = columnMap.get(columnId);
            if (!column) throw notFound();
            return [columnId, validateCell(column, value)];
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
      for (const op of ops) {
        if (op.type === "add_case") {
          const values = checkedValues(op.values ?? {});
          if (!values[testId.id]) {
            values[testId.id] = `TC-${String(++counter).padStart(3, "0")}`;
            validateCell(testId, values[testId.id]);
          }
          // 전역 UUID 충돌을 포함해 같은 ID의 동시 추가는 409로 통일한다.
          const inserted = await tx
            .insert(testCases)
            .values({
              id: op.caseId,
              testSetId: id,
              position: 0,
              createdBy: accountId,
              authorName: author.name,
            })
            .onConflictDoNothing()
            .returning({ id: testCases.id });
          if (!inserted.length)
            throw new ApiError(
              409,
              "DUPLICATE_CASE",
              "이미 있는 테스트 케이스입니다. 목록을 확인해주세요.",
            );
          byId.set(op.caseId, { id: op.caseId, values });
          place(op.caseId, op.afterCaseId);
          await saveValues(op.caseId, values);
          deleted.delete(op.caseId);
          changed.add(op.caseId);
        } else if (op.type === "set_cell") {
          const c = requireCase(op.caseId);
          const values = checkedValues({ [op.columnId]: op.value });
          Object.assign(c.values, values);
          await saveValues(op.caseId, values);
          await tx
            .update(testCases)
            .set({ updatedAt: new Date() })
            .where(
              and(eq(testCases.testSetId, id), eq(testCases.id, op.caseId)),
            );
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
        } else {
          requireCase(op.caseId);
          place(op.caseId, op.afterCaseId);
          changed.add(op.caseId);
        }
      }
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
      return {
        version,
        cases: order.filter((caseId) => changed.has(caseId)).map(requireCase),
        deletedCaseIds: [...deleted],
      };
    });
  }
}
