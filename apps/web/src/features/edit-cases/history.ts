import { useToast } from "@cheddar/ui";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  type CaseOp,
  cellText,
  invertOps,
  type Reversal,
  type SheetState,
  type TestSet,
} from "@/entities/test-set";

/** 되돌릴 수 있는 작업 수 */
const LIMIT = 100;

/**
 * 실행취소와 재실행. 스프레드시트처럼 내가 한 작업만 기록하고 되돌린다.
 * 되돌릴 셀을 그 사이 다른 사람이 바꿨으면 그 셀은 건너뛰고 알린다.
 */
export function useCaseHistory({
  queryKey,
  apply,
}: {
  queryKey: QueryKey;
  apply: (ops: CaseOp[]) => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const undoStack = useRef<Reversal[]>([]);
  const redoStack = useRef<Reversal[]>([]);
  const [, setVersion] = useState(0);

  const current = useCallback((): SheetState | null => {
    const data = queryClient.getQueryData<TestSet>(queryKey);
    return data ? { columns: data.columns, cases: data.cases } : null;
  }, [queryClient, queryKey]);

  /** 내 편집. 되돌릴 수 있게 기록한 뒤 보낸다 */
  const record = useCallback(
    (ops: CaseOp[]) => {
      const state = current();
      if (state) {
        const reversal = invertOps(state, ops);
        if (reversal.ops.length > 0) {
          undoStack.current = [...undoStack.current, reversal].slice(-LIMIT);
          redoStack.current = [];
          setVersion((v) => v + 1);
        }
      }
      apply(ops);
    },
    [apply, current],
  );

  const step = useCallback(
    (from: { current: Reversal[] }, to: { current: Reversal[] }) => {
      const entry = from.current.at(-1);
      const state = current();
      if (!entry || !state) return;
      from.current = from.current.slice(0, -1);
      const { ops, skipped } = guard(state, entry);
      if (ops.length > 0) {
        to.current = [...to.current, invertOps(state, ops)].slice(-LIMIT);
        apply(ops);
      }
      if (skipped)
        toast.show({
          message: "다른 사람이 바꾼 셀은 되돌리지 않았습니다",
          tone: "info",
        });
      setVersion((v) => v + 1);
    },
    [apply, current, toast],
  );

  return {
    record,
    undo: () => step(undoStack, redoStack),
    redo: () => step(redoStack, undoStack),
    canUndo: undoStack.current.length > 0,
    canRedo: redoStack.current.length > 0,
  };
}

/** 지금 상태에서 할 수 있는 되돌리기 연산만 남긴다 */
function guard(state: SheetState, entry: Reversal) {
  const exists = new Set(state.cases.map((c) => c.id));
  const columnOf = (id: string) => state.columns.find((c) => c.id === id);
  let skipped = false;
  const ops: CaseOp[] = [];
  for (const op of entry.ops) {
    if (op.type === "set_cell") {
      const column = columnOf(op.columnId);
      const target = state.cases.find((c) => c.id === op.caseId);
      const expected = entry.expect.find(
        (e) => e.caseId === op.caseId && e.columnId === op.columnId,
      );
      if (!column || !target) {
        skipped = true;
        continue;
      }
      if (
        expected &&
        cellText(column, target.values[op.columnId]) !==
          cellText(column, expected.value)
      ) {
        skipped = true;
        continue;
      }
      ops.push(op);
    } else if (op.type === "add_case") {
      if (exists.has(op.caseId)) continue;
      // 그 사이 지운 열의 값은 서버가 받지 않으므로 뺀다
      const columnIds = new Set(state.columns.map((c) => c.id));
      ops.push({
        ...op,
        afterCaseId:
          op.afterCaseId && exists.has(op.afterCaseId) ? op.afterCaseId : null,
        values: Object.fromEntries(
          Object.entries(op.values ?? {}).filter(([id]) => columnIds.has(id)),
        ),
      });
      exists.add(op.caseId);
    } else if (op.type === "delete_cases") {
      const ids = op.caseIds.filter((id) => exists.has(id));
      if (ids.length === 0) continue;
      ops.push({ type: "delete_cases", caseIds: ids });
      for (const id of ids) exists.delete(id);
    } else if (op.type === "move_case") {
      if (!exists.has(op.caseId)) continue;
      ops.push({
        ...op,
        afterCaseId:
          op.afterCaseId && exists.has(op.afterCaseId) ? op.afterCaseId : null,
      });
    }
  }
  return { ops, skipped };
}
