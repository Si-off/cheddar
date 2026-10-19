import { type SaveState, useToast } from "@cheddar/ui";
import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import {
  applyOps,
  type CaseOp,
  mergeCases,
  type TestCase,
  type TestSet,
} from "@/entities/test-set";
import { isApiFailure, type OpsResultDto, toApiFailure } from "@/shared/api";

/** 서버가 한 요청에서 받는 연산 수 */
const MAX_OPS = 500;
/** 다시 읽은 내용이 알려진 순번보다 오래됐을 때 더 읽는 횟수 */
const MAX_RELOADS = 3;

/** 연산을 보낼 곳. 로그인한 테스트 세트와 공개 링크가 같은 흐름을 쓴다. */
export interface CaseOpsSource {
  queryKey: QueryKey;
  fetch: () => Promise<TestSet>;
  send: (ops: CaseOp[]) => Promise<{ data: OpsResultDto }>;
}

type Remote = { version: number; ops: CaseOp[] };

/**
 * 셀 편집 연산을 화면에 먼저 반영하고 보낸 순서대로 저장한다.
 *
 * 서버가 확정한 내용(순번과 케이스)을 따로 두고, 화면은 그 위에 아직 저장되지 않은
 * 내 연산을 얹어 그린다. 다른 사람의 연산은 순번대로만 확정 내용에 더하고, 순번이
 * 건너뛰거나 다시 읽는 중이면 보관했다가 다시 읽은 내용 위에 이어 붙인다.
 * 그래서 늦게 온 저장 응답이 더 최신인 다른 사람의 값을 덮지 않는다.
 */
export function useCaseOps(source: CaseOpsSource) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = source;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  // 보냈지만 아직 응답을 받지 않은 연산(보낸 순서)
  const unsent = useRef<{ id: number; ops: CaseOp[] }[]>([]);
  const nextId = useRef(0);
  // 서버가 확정한 내용
  const base = useRef<{ version: number; cases: TestCase[] } | null>(null);
  // 다시 읽는 동안 받은 연산과 지금까지 알려진 가장 큰 순번
  const buffered = useRef<Remote[]>([]);
  const target = useRef(0);
  const reloading = useRef<Promise<void> | null>(null);
  // 응답을 받지 못한 저장이 한 번이라도 있으면 새로 고칠 때까지 확인 필요로 둔다
  const uncertain = useRef(false);
  // 저장됐는지 모르는 연산. 서버 내용을 다시 읽을 때까지 입력을 화면에 남긴다
  const unknownOps = useRef<CaseOp[][]>([]);
  const [state, setState] = useState<SaveState>("saved");

  /** 확정 내용. 캐시가 더 새로운 서버 내용으로 바뀌었으면(양식 저장 등) 그쪽을 따른다 */
  const confirmed = useCallback(() => {
    const current = queryClient.getQueryData<TestSet>(queryKey);
    if (current && (!base.current || current.version > base.current.version))
      base.current = { version: current.version, cases: current.cases };
    return base.current;
  }, [queryClient, queryKey]);

  /** 확정 내용 위에 아직 저장되지 않은 내 연산을 얹어 화면에 둔다 */
  const render = useCallback(() => {
    const b = base.current;
    if (!b) return;
    queryClient.setQueryData(
      queryKey,
      (current: TestSet | undefined) =>
        current && {
          ...current,
          version: b.version,
          cases: [
            ...unknownOps.current,
            ...unsent.current.map((e) => e.ops),
          ].reduce((all, ops) => applyOps(all, ops), b.cases),
        },
    );
  }, [queryClient, queryKey]);

  /** 순번이 이어지는 보관 연산을 확정 내용에 더한다 */
  const drain = useCallback(() => {
    const b = base.current;
    if (!b) return;
    buffered.current.sort((x, y) => x.version - y.version);
    for (const message of buffered.current)
      if (message.version === b.version + 1) {
        b.cases = applyOps(b.cases, message.ops);
        b.version = message.version;
      }
    buffered.current = buffered.current.filter((m) => m.version > b.version);
  }, []);

  /** 서버 내용을 다시 읽는다. 알려진 순번에 닿을 때까지 몇 번 더 읽는다 */
  const reload = useCallback(() => {
    if (reloading.current) return reloading.current;
    reloading.current = (async () => {
      try {
        for (let i = 0; i < MAX_RELOADS; i++) {
          const fresh = await sourceRef.current.fetch();
          // 다시 읽은 서버 내용이 기준이 되므로 결과를 모르던 연산은 더 얹지 않는다
          unknownOps.current = [];
          queryClient.setQueryData(queryKey, fresh);
          base.current = { version: fresh.version, cases: fresh.cases };
          drain();
          if (base.current.version >= target.current) break;
        }
      } catch {
        // 다음 변경이나 새로 고침에서 다시 읽는다
      } finally {
        reloading.current = null;
        render();
      }
    })();
    return reloading.current;
  }, [drain, queryClient, queryKey, render]);

  const send = useCallback(
    (ops: CaseOp[]) => {
      const entry = { id: nextId.current++, ops };
      unsent.current.push(entry);
      setState("saving");
      const run = queue.current.then(() => sourceRef.current.send(ops));
      queue.current = run.catch(() => undefined);
      run
        .then(({ data }) => {
          unsent.current = unsent.current.filter((e) => e.id !== entry.id);
          target.current = Math.max(target.current, data.version);
          const b = confirmed();
          if (b && !reloading.current) {
            if (data.version === b.version + 1) {
              // 사이에 다른 연산이 없으니 응답이 곧 최신 내용이다
              b.cases = mergeCases(
                applyOps(b.cases, ops),
                data.cases,
                data.deletedCaseIds,
              );
              b.version = data.version;
              drain();
            } else if (data.version === b.version) {
              // 내 연산은 실시간 연결로 먼저 반영됐다. 서버가 정한 값(테스트 ID 등)만 맞춘다
              b.cases = mergeCases(b.cases, data.cases, data.deletedCaseIds);
            } else if (
              data.version > b.version ||
              ops.some((op) => op.type === "add_case")
            ) {
              // 사이에 빠진 연산이 있거나, 새 케이스에 서버가 정한 값을 받아야 한다
              void reload();
            }
            // 응답보다 최신 연산이 이미 반영됐으면 응답으로 덮지 않는다
          }
          render();
          if (unsent.current.length === 0)
            setState(uncertain.current ? "unknown" : "saved");
        })
        .catch((error) => {
          unsent.current = unsent.current.filter((e) => e.id !== entry.id);
          const unknown = isApiFailure(error, "NETWORK");
          if (unknown) {
            uncertain.current = true;
            unknownOps.current.push(ops);
          }
          setState(unknown ? "unknown" : "error");
          toast.show({
            message: toApiFailure(error, {
              unknownResult:
                "응답을 받지 못해 저장됐는지 알 수 없습니다. 새로 고쳐 확인하세요.",
            }).message,
            tone: "danger",
          });
          // 결과를 모를 때는 화면을 그대로 두고, 거절됐으면 서버 내용으로 되돌린다
          if (unknown) render();
          else void reload();
        });
    },
    [confirmed, drain, reload, render, toast],
  );

  const apply = useCallback(
    (ops: CaseOp[]) => {
      if (ops.length === 0) return;
      confirmed();
      // 많은 셀을 붙여넣으면 서버 한도에 맞춰 나눠 보낸다
      for (let i = 0; i < ops.length; i += MAX_OPS)
        send(ops.slice(i, i + MAX_OPS));
      render();
    },
    [confirmed, render, send],
  );

  /**
   * 서버가 확정한 연산 묶음(내 연산 포함). 순번대로 확정 내용에 더하고,
   * 다시 읽는 중이거나 순번이 건너뛰면 보관했다가 이어 붙인다.
   */
  const applyRemote = useCallback(
    (message: Remote) => {
      const b = confirmed();
      if (!b) return;
      target.current = Math.max(target.current, message.version);
      if (message.version <= b.version) return;
      if (reloading.current || message.version !== b.version + 1) {
        buffered.current.push(message);
        void reload();
        return;
      }
      b.cases = applyOps(b.cases, message.ops);
      b.version = message.version;
      drain();
      render();
    },
    [confirmed, drain, reload, render],
  );

  /** 연산 밖의 변경(양식, 이름, 생성 결과 등). 이미 반영한 순번이면 건너뛴다 */
  const resync = useCallback(
    (version: number) => {
      target.current = Math.max(target.current, version);
      const b = confirmed();
      if (!b || version > b.version) void reload();
    },
    [confirmed, reload],
  );

  return { apply, state, applyRemote, resync };
}
