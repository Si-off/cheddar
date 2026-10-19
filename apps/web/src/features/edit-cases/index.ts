import { type SaveState, useToast } from "@cheddar/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  applyOps,
  type CaseOp,
  mergeCases,
  type TestSet,
  testSetQuery,
} from "@/entities/test-set";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";

/** 서버가 한 요청에서 받는 연산 수 */
const MAX_OPS = 500;

/**
 * 셀 편집 연산을 화면에 먼저 반영하고 보낸 순서대로 저장한다.
 * 서버 응답으로 덮을 때는 아직 저장되지 않은 연산을 다시 얹어 입력이 되돌아가지 않게 한다.
 * 실패하면 서버의 테스트 세트를 다시 읽어 화면을 되돌린다.
 */
export function useCaseOps(testSetId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // 보냈지만 아직 응답을 받지 않은 연산(보낸 순서)
  const unsent = useRef<{ id: number; ops: CaseOp[] }[]>([]);
  const nextId = useRef(0);
  // 응답을 받지 못한 저장이 한 번이라도 있으면 새로 고칠 때까지 확인 필요로 둔다
  const uncertain = useRef(false);
  const [state, setState] = useState<SaveState>("saved");

  const send = useCallback(
    (ops: CaseOp[]) => {
      const { queryKey } = testSetQuery(testSetId);
      const entry = { id: nextId.current++, ops };
      unsent.current.push(entry);
      setState("saving");
      const run = queue.current.then(() =>
        sdk.applyTestSetOps({
          path: { testSetId },
          body: { ops },
          throwOnError: true,
        }),
      );
      queue.current = run.catch(() => undefined);
      run
        .then(({ data }) => {
          unsent.current = unsent.current.filter((e) => e.id !== entry.id);
          queryClient.setQueryData(queryKey, (current: TestSet | undefined) =>
            current
              ? {
                  ...current,
                  version: data.version,
                  cases: unsent.current.reduce(
                    (cases, e) => applyOps(cases, e.ops),
                    mergeCases(current.cases, data.cases, data.deletedCaseIds),
                  ),
                }
              : current,
          );
          if (unsent.current.length === 0)
            setState(uncertain.current ? "unknown" : "saved");
        })
        .catch((error) => {
          unsent.current = unsent.current.filter((e) => e.id !== entry.id);
          const unknown = isApiFailure(error, "NETWORK");
          if (unknown) uncertain.current = true;
          setState(unknown ? "unknown" : "error");
          toast.show({
            message: toApiFailure(error, {
              unknownResult:
                "응답을 받지 못해 저장됐는지 알 수 없습니다. 새로 고쳐 확인하세요.",
            }).message,
            tone: "danger",
          });
          // 결과를 모를 때는 화면을 그대로 두고, 거절됐으면 서버 내용으로 되돌리되
          // 아직 저장 중인 연산은 다시 얹는다
          if (!unknown)
            void queryClient
              .fetchQuery({ ...testSetQuery(testSetId), staleTime: 0 })
              .then((fresh) =>
                queryClient.setQueryData(queryKey, {
                  ...fresh,
                  cases: unsent.current.reduce(
                    (cases, e) => applyOps(cases, e.ops),
                    fresh.cases,
                  ),
                }),
              )
              .catch(() => undefined);
        });
    },
    [queryClient, testSetId, toast],
  );

  const apply = useCallback(
    (ops: CaseOp[]) => {
      if (ops.length === 0) return;
      queryClient.setQueryData(
        testSetQuery(testSetId).queryKey,
        (current: TestSet | undefined) =>
          current && { ...current, cases: applyOps(current.cases, ops) },
      );
      // 많은 셀을 붙여넣으면 서버 한도에 맞춰 나눠 보낸다
      for (let i = 0; i < ops.length; i += MAX_OPS)
        send(ops.slice(i, i + MAX_OPS));
    },
    [queryClient, send, testSetId],
  );

  return { apply, state };
}
