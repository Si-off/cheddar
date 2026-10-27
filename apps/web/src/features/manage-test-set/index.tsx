import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  ConfirmDialog,
  Dialog,
  TextField,
  useToast,
} from "@workspace/ui";
import { type SubmitEvent, useState } from "react";
import { type TestSet, testSetQuery } from "@/entities/test-set";
import { sdk, toApiFailure } from "@/shared/api";

const isListQuery = (q: { queryKey: readonly unknown[] }) =>
  (q.queryKey[0] as { _id?: string } | undefined)?._id === "listTestSets";

export interface RenameTestSetDialogProps {
  testSet: TestSet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameTestSetDialog({
  testSet,
  open,
  onOpenChange,
}: RenameTestSetDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        {open && (
          <RenameForm testSet={testSet} onDone={() => onOpenChange(false)} />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function RenameForm({
  testSet,
  onDone,
}: {
  testSet: TestSet;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(testSet.name);
  const rename = useMutation({
    mutationFn: () =>
      sdk.updateTestSet({
        path: { testSetId: testSet.id },
        body: { name: name.trim() },
        throwOnError: true,
      }),
    onSuccess: () => {
      queryClient.setQueryData(
        testSetQuery(testSet.id).queryKey,
        (current: TestSet | undefined) =>
          current && { ...current, name: name.trim() },
      );
      void queryClient.invalidateQueries({ predicate: isListQuery });
      onDone();
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 새로 고쳐 이름이 바뀌었는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim()) rename.mutate();
  };
  return (
    <form onSubmit={submit} className="contents">
      <Dialog.Header title="이름 변경" />
      <Dialog.Body>
        <TextField
          label="테스트 세트 이름"
          required
          maxLength={100}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          type="submit"
          variant="primary"
          loading={rename.isPending}
          disabled={!name.trim()}
        >
          저장
        </Button>
      </Dialog.Footer>
    </form>
  );
}

export interface DeleteTestSetDialogProps {
  testSet: TestSet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}

export function DeleteTestSetDialog({
  testSet,
  open,
  onOpenChange,
  onDeleted,
}: DeleteTestSetDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      sdk.deleteTestSet({
        path: { testSetId: testSet.id },
        throwOnError: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: isListQuery });
      toast.show({ message: "삭제했습니다", tone: "success" });
      onDeleted();
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 테스트 세트 목록에서 삭제됐는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${testSet.name} 삭제`}
      description={`케이스 ${testSet.cases.length}개가 함께 삭제되며 되돌릴 수 없습니다.`}
      confirmLabel="삭제"
      tone="danger"
      pending={remove.isPending}
      onConfirm={() => remove.mutate()}
    />
  );
}
