import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import {
  Button,
  type SaveState,
  SaveStatus,
  TextArea,
  useToast,
} from "@workspace/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Memo, memoQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

const SAVE_DELAY = 800;
const MAX_LENGTH = 20000;
const unknownResult =
  "응답을 받지 못해 저장됐는지 알 수 없습니다. 다시 저장을 누르세요.";

export interface MemoEditorProps {
  projectId: string;
  /** 서버의 최신 메모 */
  memo: Memo;
  readOnly?: boolean;
}

/** 입력을 멈추면 저장한다. AI에는 보내지 않는 사람끼리의 메모. */
export function MemoEditor({ projectId, memo, readOnly }: MemoEditorProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [body, setBody] = useState(memo.body);
  const [state, setState] = useState<SaveState>("saved");
  // 서버에 있다고 확인한 본문
  const saved = useRef(memo.body);
  // 실패한 본문은 저절로 다시 보내지 않는다. 고치거나 다시 저장을 누르면 보낸다.
  const failed = useRef<string | null>(null);
  const latest = useRef(body);
  latest.current = body;

  const send = useCallback(
    async (next: string) => {
      const { data } = await sdk.updateProjectMemo({
        path: { projectId },
        body: { body: next },
        throwOnError: true,
      });
      saved.current = next;
      failed.current = null;
      queryClient.setQueryData(memoQuery(projectId).queryKey, data);
      return data;
    },
    [projectId, queryClient],
  );
  // 자동 저장과 떠날 때의 저장이 보낸 순서대로 반영되도록 한 줄로 세운다
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = useCallback(
    (next: string) => {
      const run = queue.current.then(() => send(next));
      queue.current = run.catch(() => undefined);
      return run;
    },
    [send],
  );
  const save = useMutation({
    mutationFn: enqueue,
    onError: (error, next) => {
      failed.current = next;
      setState("error");
      toast.show({
        message: toApiFailure(error, { unknownResult }).message,
        tone: "danger",
      });
    },
  });
  const { mutate, isPending } = save;

  useEffect(() => {
    // 실패한 뒤 내용을 바꾸면 다시 자동으로 저장한다
    if (failed.current !== null && body !== failed.current)
      failed.current = null;
    if (body === saved.current) {
      if (!isPending) setState("saved");
      return;
    }
    if (body === failed.current) return;
    setState("dirty");
    if (isPending) return;
    const timer = setTimeout(() => {
      setState("saving");
      mutate(body);
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [body, isPending, mutate]);

  // 다른 사람이 고친 메모는 내가 고치는 중이 아닐 때만 반영한다
  useEffect(() => {
    if (latest.current === saved.current && memo.body !== saved.current) {
      saved.current = memo.body;
      setBody(memo.body);
    }
  }, [memo.body]);

  // 저장을 기다리는 중에 화면을 떠나면 바로 저장한다. 떠날 때 한 번만 실행되도록 최신 함수를 ref로 읽는다.
  const flush = useRef<() => void>(() => {});
  flush.current = () => {
    const pending = latest.current;
    if (pending === saved.current || pending === failed.current) return;
    enqueue(pending).catch((error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult: "응답을 받지 못해 메모가 저장됐는지 알 수 없습니다.",
        }).message,
        tone: "danger",
      }),
    );
  };
  useEffect(() => () => flush.current(), []);

  // 저장하지 못한 메모는 떠나기 전에 묻는다
  useBlocker({
    shouldBlockFn: () =>
      failed.current !== null &&
      latest.current === failed.current &&
      !window.confirm("저장하지 못한 메모가 있습니다. 이 화면을 나갈까요?"),
    enableBeforeUnload: () => latest.current !== saved.current,
  });

  return (
    <section className="flex max-w-4xl flex-col gap-2">
      {!readOnly && (
        <div className="flex items-center justify-end gap-2">
          <SaveStatus state={state} />
          {state === "error" && (
            <Button
              size="sm"
              loading={isPending}
              onClick={() => {
                setState("saving");
                mutate(body);
              }}
            >
              다시 저장
            </Button>
          )}
        </div>
      )}
      <TextArea
        aria-label="프로젝트 메모"
        rows={16}
        readOnly={readOnly}
        maxLength={MAX_LENGTH}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
    </section>
  );
}
