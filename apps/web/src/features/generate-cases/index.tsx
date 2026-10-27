import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  Dialog,
  Icon,
  RadioGroup,
  TextArea,
  useToast,
} from "@workspace/ui";
import { Sparkles } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { currentGenerationQuery } from "@/entities/generation";
import { sdk, toApiFailure } from "@/shared/api";

const MAX_MEMO = 10000;

export interface StartGenerationInput {
  kind: "initial" | "append";
  uploadId?: string;
  memo?: string;
}

/** 생성 작업을 큐에 넣는다. 진행은 생성 진행 화면이 받는다. */
export function useStartGeneration(testSetId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StartGenerationInput) =>
      sdk.createGeneration({
        path: { testSetId },
        body: input,
        throwOnError: true,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: currentGenerationQuery(testSetId).queryKey,
      }),
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 새로 고쳐 생성이 시작됐는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
}

export interface GenerateSheetProps {
  testSetId: string;
  /** 플러그인에서 올린 프레임. 없으면 설명만으로 만든다. */
  upload: { id: string; frameCount: number } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: () => void;
}

/** 이미 있는 케이스와 겹치지 않게 케이스를 더 만든다. */
export function GenerateSheet({
  testSetId,
  upload,
  open,
  onOpenChange,
  onStarted,
}: GenerateSheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content placement="side" size="md">
        {open && (
          <GenerateForm
            testSetId={testSetId}
            upload={upload}
            onStarted={onStarted}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function GenerateForm({
  testSetId,
  upload,
  onStarted,
}: Omit<GenerateSheetProps, "open" | "onOpenChange">) {
  const start = useStartGeneration(testSetId);
  const [source, setSource] = useState(upload ? "frames" : "memo");
  const [memo, setMemo] = useState("");
  const useFrames = upload !== null && source === "frames";
  const canStart = useFrames || memo.trim().length > 0;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canStart) return;
    start.mutate(
      {
        kind: "append",
        uploadId: useFrames ? upload?.id : undefined,
        memo: memo.trim(),
      },
      { onSuccess: onStarted },
    );
  };
  return (
    <form onSubmit={submit} className="flex h-full flex-col">
      <Dialog.Header
        title={
          <span className="inline-flex items-center gap-3">
            <span className="grid size-7 place-items-center rounded-md bg-accent-soft text-accent-text">
              <Icon icon={Sparkles} size="sm" />
            </span>
            케이스 추가 생성
          </span>
        }
      />
      <Dialog.Body className="flex-1 overflow-auto">
        {upload && (
          <div className="flex flex-col gap-2">
            <span className="text-label text-fg">프레임</span>
            <RadioGroup
              aria-label="프레임"
              value={source}
              onValueChange={setSource}
              options={[
                {
                  value: "frames",
                  label: `Figma 프레임 ${upload.frameCount}개`,
                },
                { value: "memo", label: "설명만 사용" },
              ]}
            />
          </div>
        )}
        <TextArea
          label="설명"
          rows={5}
          maxLength={MAX_MEMO}
          counter={`${memo.trim().length}/${MAX_MEMO}`}
          placeholder="더 만들 범위, 빠진 부분, 꼭 확인할 점"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          type="submit"
          variant="ai"
          icon={Sparkles}
          disabled={!canStart}
          loading={start.isPending}
        >
          생성 시작
        </Button>
      </Dialog.Footer>
    </form>
  );
}
