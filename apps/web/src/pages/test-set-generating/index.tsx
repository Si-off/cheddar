import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  buttonVariants,
  Icon,
  LoadError,
  StepList,
  type StepState,
  useToast,
} from "@workspace/ui";
import { CircleAlert, Sparkles } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import {
  currentGenerationQuery,
  type GenerationStage,
  reviewItemsQuery,
  stageLabels,
  subscribeGeneration,
} from "@/entities/generation";
import { testSetQuery } from "@/entities/test-set";

/** 생성이 끝나면 테스트 세트를 열고 결과를 토스트로 알린다. 단계만 보여주고 케이스 목록은 보여주지 않는다. */
/** 시작 응답을 못 받았을 때 작업이 나타나기를 기다리는 시간 */
const CONFIRM_WINDOW = 20_000;

export function TestSetGeneratingPage({
  testSetId,
  confirmStart = false,
}: {
  testSetId: string;
  /** 시작 응답을 받지 못했다. 작업이 아직 없으면 잠시 기다리며 확인한다. */
  confirmStart?: boolean;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  // 토스트 객체는 렌더마다 바뀌지만 진행 구독을 다시 시작할 이유는 아니다.
  const showToast = useEffectEvent(
    (options: Parameters<typeof toast.show>[0]) => toast.show(options),
  );
  const queryClient = useQueryClient();
  const testSet = useQuery(testSetQuery(testSetId));
  const [since] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);
  const current = useQuery({
    ...currentGenerationQuery(testSetId),
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      confirmStart && query.state.data === null && !gaveUp ? 2000 : false,
  });
  const [stage, setStage] = useState<GenerationStage | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // 연결이 완전히 끊기면 이 값을 올려 다시 구독한다
  const [attempt, setAttempt] = useState(0);
  const job = current.data;

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt가 오르면 끊긴 구독을 다시 만든다
  useEffect(() => {
    // 시작 응답을 못 받았으면 작업이 나타나기를 잠시 기다린다
    if (job === null && confirmStart && !gaveUp) {
      const left = CONFIRM_WINDOW - (Date.now() - since);
      if (left > 0) {
        const timer = setTimeout(() => setGaveUp(true), left);
        return () => clearTimeout(timer);
      }
      setGaveUp(true);
      return;
    }
    if (job === null && confirmStart) {
      setFailure(
        "생성이 시작되지 않았습니다. 테스트 세트에서 케이스 추가 생성을 실행하세요.",
      );
      return;
    }
    // 생성 기록이 없거나 확인 필요 항목의 다시 작성이면 테스트 세트에서 본다
    if (
      job === null ||
      job?.kind === "rewrite" ||
      job?.kind === "fill_column"
    ) {
      void navigate({ to: "/test-sets/$testSetId", params: { testSetId } });
      return;
    }
    if (!job) return;
    if (job.status === "failed") {
      setFailure(job.errorMessage ?? "케이스를 만들지 못했습니다.");
      return;
    }
    setStage(job.stage);
    const finish = (added: number, review: number) => {
      void queryClient.invalidateQueries({
        queryKey: testSetQuery(testSetId).queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: reviewItemsQuery(testSetId).queryKey,
      });
      showToast(
        added === 0 && review === 0
          ? { message: "새로 추가할 케이스가 없었습니다", tone: "info" }
          : {
              message:
                review > 0
                  ? `케이스 ${added}개를 추가했습니다. 확인 필요 ${review}건이 있습니다`
                  : `케이스 ${added}개를 추가했습니다`,
              tone: "success",
            },
      );
      void navigate({ to: "/test-sets/$testSetId", params: { testSetId } });
    };
    if (job.status === "succeeded") {
      finish(job.addedCount, job.reviewCount);
      return;
    }
    return subscribeGeneration(
      job.jobId,
      (event) => {
        if (event.type === "progress") setStage(event.stage);
        else if (event.status === "succeeded")
          finish(event.addedCount ?? 0, event.reviewCount ?? 0);
        else setFailure(event.errorMessage ?? "케이스를 만들지 못했습니다.");
      },
      // 연결이 끊기면 현재 상태를 다시 읽고 다시 구독한다
      () => {
        void current.refetch();
        // 서버가 계속 끊으면 잠시 쉬었다가 다시 붙는다
        setTimeout(() => setAttempt((n) => n + 1), 3000);
      },
    );
  }, [
    job,
    attempt,
    confirmStart,
    gaveUp,
    since,
    navigate,
    queryClient,
    testSetId,
    current.refetch,
  ]);

  const index = stage ? stageLabels.findIndex((s) => s.key === stage) : 0;
  const steps = stageLabels.map((s, i) => ({
    key: s.key,
    label: s.label,
    state: (i < index
      ? "done"
      : i === index
        ? "active"
        : "pending") as StepState,
  }));
  const name = testSet.data?.name ?? "";

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-5 px-6 pt-8 pb-12">
      {current.isError ? (
        <LoadError
          title="진행 상황을 불러오지 못했습니다"
          onRetry={() => current.refetch()}
        />
      ) : failure ? (
        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-7">
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
              <Icon icon={CircleAlert} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="m-0 text-title-sm text-fg">
                케이스를 만들지 못했습니다
              </h1>
              <span className="text-body-sm text-fg-muted">{failure}</span>
            </div>
          </div>
          <div className="flex justify-end">
            <Link
              to="/test-sets/$testSetId"
              params={{ testSetId }}
              className={buttonVariants()}
            >
              테스트 세트로 이동
            </Link>
          </div>
        </section>
      ) : (
        <section
          aria-live="polite"
          aria-labelledby="generating-title"
          className="flex flex-col gap-6 rounded-lg border border-line bg-surface p-7"
        >
          <div className="flex items-center gap-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
              <Icon icon={Sparkles} />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 id="generating-title" className="m-0 text-title-sm text-fg">
                {job?.kind === "append"
                  ? "케이스를 만들고 있습니다"
                  : "테스트 세트를 만들고 있습니다"}
              </h1>
              <span className="text-body-sm text-fg-muted">{name}</span>
            </div>
          </div>
          <StepList aria-label="진행 단계" steps={steps} />
        </section>
      )}
    </main>
  );
}
