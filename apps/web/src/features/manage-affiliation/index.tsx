import { Button, Dialog, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import type { Affiliation } from "@/entities/affiliation";
import { sdk, toApiFailure } from "@/shared/api";

function useInvalidateAffiliations() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const id = (query.queryKey[0] as { _id?: string } | undefined)?._id;
        return (
          id === "listAffiliations" ||
          id === "listAccounts" ||
          id === "getAccount"
        );
      },
    });
}

export function useAffiliationActions() {
  const toast = useToast();
  const invalidate = useInvalidateAffiliations();
  const onError = (error: unknown) =>
    toast.show({
      message: toApiFailure(error, {
        unknownResult: "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.",
      }).message,
      tone: "danger",
    });
  const create = useMutation({
    mutationFn: (name: string) =>
      sdk.createAffiliation({ body: { name }, throwOnError: true }),
    onSuccess: () => invalidate(),
    onError,
  });
  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      sdk.updateAffiliation({
        path: { affiliationId: id },
        body: { name },
        throwOnError: true,
      }),
    onSuccess: () => invalidate(),
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteAffiliation({
        path: { affiliationId: id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.show({ message: "삭제했습니다", tone: "success" });
      return invalidate();
    },
    onError,
  });
  return { create, rename, remove };
}

/** 새 소속 이름을 넣고 추가한다. */
export function AddAffiliationForm() {
  const { create } = useAffiliationActions();
  const [name, setName] = useState("");
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) create.mutate(trimmed, { onSuccess: () => setName("") });
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <TextField
        size="sm"
        placeholder="소속 이름"
        aria-label="새 소속 이름"
        className="w-60 max-w-full"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        loading={create.isPending}
        disabled={!name.trim()}
      >
        추가
      </Button>
    </form>
  );
}

export interface RenameAffiliationDialogProps {
  affiliation: Affiliation | null;
  onClose: () => void;
}

export function RenameAffiliationDialog({
  affiliation,
  onClose,
}: RenameAffiliationDialogProps) {
  return (
    <Dialog.Root
      open={affiliation !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Content size="sm">
        {affiliation && (
          <RenameForm
            key={affiliation.id}
            affiliation={affiliation}
            onClose={onClose}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function RenameForm({
  affiliation,
  onClose,
}: {
  affiliation: Affiliation;
  onClose: () => void;
}) {
  const { rename } = useAffiliationActions();
  const [name, setName] = useState(affiliation.name);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed)
      rename.mutate(
        { id: affiliation.id, name: trimmed },
        { onSuccess: onClose },
      );
  };
  return (
    <form onSubmit={submit} className="contents">
      <Dialog.Header title="이름 변경" />
      <Dialog.Body>
        <TextField
          label="소속 이름"
          required
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
