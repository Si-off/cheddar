import { useToast } from "@cheddar/ui";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  currentGenerationQuery,
  type ReviewItem,
  reviewItemsQuery,
  subscribeGeneration,
} from "@/entities/generation";
import {
  type CellValue,
  type TestSet,
  testSetQuery,
} from "@/entities/test-set";
import { sdk, toApiFailure } from "@/shared/api";

const unknownResult =
  "응답을 받지 못했습니다. 새로 고쳐 처리됐는지 확인하세요.";

type ReviewPatch = {
  answer?: string;
  draft?: Record<string, CellValue>;
  status?: "pending" | "excluded";
};

/** 다시 작성 작업이 끝나면 항목과 진행 상태를 새로 읽는다. 돌려준 함수로 기다림을 멈춘다. */
function watchRewrite(
  queryClient: QueryClient,
  testSetId: string,
  jobId: string,
  onFailed: (message: string) => void,
) {
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: reviewItemsQuery(testSetId).queryKey,
    });
    void queryClient.invalidateQueries({
      queryKey: currentGenerationQuery(testSetId).queryKey,
    });
  };
  let stopped = false;
  let stop = () => {};
  let retry: ReturnType<typeof setTimeout> | undefined;
  const listen = () => {
    stop = subscribeGeneration(
      jobId,
      (event) => {
        if (event.type !== "done") return;
        stopped = true;
        stop();
        if (event.status === "failed")
          onFailed(event.errorMessage ?? "다시 작성하지 못했습니다.");
        refresh();
      },
      // 연결이 완전히 끊기면 상태를 새로 읽고 잠시 뒤 다시 기다린다
      () => {
        refresh();
        if (!stopped) retry = setTimeout(listen, 3000);
      },
    );
  };
  listen();
  return () => {
    stopped = true;
    clearTimeout(retry);
    stop();
  };
}

/** 새로 고친 뒤에도 진행 중인 다시 작성을 이어서 기다린다. */
export function useRewriteWatch(testSetId: string, jobId: string | null) {
  const toast = useToast();
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!jobId) return;
    return watchRewrite(queryClient, testSetId, jobId, (message) =>
      toast.show({ message, tone: "danger" }),
    );
  }, [jobId, queryClient, testSetId, toast]);
}

/** 확인 필요 항목을 고치고, 추가하고, 제외하고, 답변으로 다시 작성한다. */
export function useReviewActions(testSetId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = reviewItemsQuery(testSetId);
  // 같은 항목의 저장은 보낸 순서대로 처리하고, 마지막 저장의 응답만 화면에 반영한다
  const queues = useRef(
    new Map<string, { tail: Promise<unknown>; pending: number }>(),
  );
  const replace = (item: ReviewItem) =>
    queryClient.setQueryData(queryKey, (items: ReviewItem[] | undefined) =>
      items?.map((i) => (i.id === item.id ? item : i)),
    );
  const onError = (error: unknown) => {
    toast.show({
      message: toApiFailure(error, { unknownResult }).message,
      tone: "danger",
    });
    return queryClient.invalidateQueries({ queryKey });
  };

  // 저장, 추가, 다시 작성 모두 같은 항목이면 보낸 순서대로 처리한다
  const enqueue = <T>(itemId: string, send: () => Promise<T>) => {
    const queue = queues.current.get(itemId) ?? {
      tail: Promise.resolve(),
      pending: 0,
    };
    queue.pending += 1;
    const run = queue.tail.then(send);
    queue.tail = run.catch(() => undefined);
    queues.current.set(itemId, queue);
    return run.finally(() => {
      queue.pending -= 1;
    });
  };

  const update = useMutation({
    mutationFn: ({ item, patch }: { item: ReviewItem; patch: ReviewPatch }) =>
      enqueue(item.id, () =>
        sdk.updateReviewItem({
          path: { itemId: item.id },
          body: patch,
          throwOnError: true,
        }),
      ),
    // 고른 값과 상태는 바로 보여준다
    onMutate: ({ item, patch }) => replace({ ...item, ...patch }),
    onSuccess: ({ data }, { item }) => {
      if ((queues.current.get(item.id)?.pending ?? 0) === 0)
        replace(data as ReviewItem);
    },
    onError,
  });

  const accept = useMutation({
    mutationFn: (item: ReviewItem) =>
      enqueue(item.id, () =>
        sdk.acceptReviewItem({
          path: { itemId: item.id },
          body: { draft: item.draft },
          throwOnError: true,
        }),
      ),
    onSuccess: ({ data }) => {
      replace(data.item as ReviewItem);
      queryClient.setQueryData(
        testSetQuery(testSetId).queryKey,
        (current: TestSet | undefined) =>
          current && {
            ...current,
            version: Math.max(current.version, data.version),
            // 실시간 재동기화가 먼저 가져왔으면 그 뒤 편집이 있을 수 있어 그대로 둔다
            cases: current.cases.some((c) => c.id === data.case.id)
              ? current.cases
              : [...current.cases, data.case],
          },
      );
      toast.show({ message: "테스트 세트에 추가했습니다", tone: "success" });
    },
    onError,
  });

  const rewrite = useMutation({
    mutationFn: ({ item, answer }: { item: ReviewItem; answer: string }) =>
      enqueue(item.id, () =>
        sdk.rewriteReviewItem({
          path: { itemId: item.id },
          body: { answer },
          throwOnError: true,
        }),
      ),
    onMutate: ({ item, answer }) =>
      replace({ ...item, answer, status: "rewriting" }),
    onSuccess: ({ data }) => {
      watchRewrite(queryClient, testSetId, data.jobId, (message) =>
        toast.show({ message, tone: "danger" }),
      );
    },
    onError,
  });

  return {
    /** 항목 하나를 바꾼다. 초안은 지금 화면의 초안에 바뀐 칸만 얹어 보낸다. */
    update: {
      ...update,
      mutate: (args: { item: ReviewItem } & ReviewPatch) => {
        const { item, ...patch } = args;
        update.mutate({ item, patch });
      },
    },
    accept,
    rewrite,
  };
}
