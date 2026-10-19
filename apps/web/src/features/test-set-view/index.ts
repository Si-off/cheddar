import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import {
  defaultView,
  testSetViewQuery,
  type ViewPreference,
} from "@/entities/test-set";
import { sdk } from "@/shared/api";

const SAVE_DELAY = 500;

/**
 * 사람마다 따로 기억하는 보기 설정. 바꾸면 바로 화면에 쓰고 잠시 뒤 저장한다.
 * 저장에 실패해도 화면은 그대로 두고 알리지 않는다(다음 방문 때 이전 설정이 보일 뿐이다).
 */
export interface ViewTargets {
  columnIds: readonly string[];
  /** 묶기 기준으로 쓸 수 있는 항목 */
  groupableColumnIds: readonly string[];
  caseIds: readonly string[];
}

const pick = (record: Record<string, number>, ids: readonly string[]) =>
  Object.fromEntries(Object.entries(record).filter(([id]) => ids.includes(id)));

/** 지운 항목과 케이스, 묶을 수 없게 바뀐 항목은 서버가 받지 않으므로 뺀다 */
function clean(view: ViewPreference, targets: ViewTargets): ViewPreference {
  return {
    ...view,
    groupByColumnId:
      view.groupByColumnId &&
      targets.groupableColumnIds.includes(view.groupByColumnId)
        ? view.groupByColumnId
        : null,
    columnWidths: pick(view.columnWidths, targets.columnIds),
    rowHeights: pick(view.rowHeights, targets.caseIds),
  };
}

export function useTestSetView(testSetId: string, targets: ViewTargets) {
  const current = useRef(targets);
  current.current = targets;
  const queryClient = useQueryClient();
  const { queryKey } = testSetViewQuery(testSetId);
  const view = useQuery(testSetViewQuery(testSetId)).data;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<ViewPreference | null>(null);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const next = latest.current;
    latest.current = null;
    if (next)
      void sdk
        // 기다리는 동안 지워진 항목이 있을 수 있어 보내는 시점에 다시 정리한다
        .updateTestSetView({
          path: { testSetId },
          body: clean(next, current.current),
        })
        .catch(() => undefined);
  }, [testSetId]);

  const update = useCallback(
    (patch: Partial<ViewPreference>) => {
      const merged = {
        ...(queryClient.getQueryData<ViewPreference>(queryKey) ?? defaultView),
        ...patch,
      };
      const next = clean(merged, current.current);
      queryClient.setQueryData(queryKey, next);
      latest.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY);
    },
    [flush, queryClient, queryKey],
  );

  // 떠날 때 남은 변경을 저장한다
  useEffect(() => flush, [flush]);

  return [view ?? defaultView, update] as const;
}
