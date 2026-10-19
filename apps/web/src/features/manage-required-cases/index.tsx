import { Button, IconButton, Switch, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { type RequiredCase, requiredCasesQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

function useRequiredCaseActions(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = requiredCasesQuery(projectId);
  const onSuccess = () => queryClient.invalidateQueries({ queryKey });
  const onError = (error: unknown) => {
    toast.show({
      message: toApiFailure(error, {
        unknownResult: "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.",
      }).message,
      tone: "danger",
    });
    return onSuccess();
  };
  const path = { projectId };

  const create = useMutation({
    mutationFn: (description: string) =>
      sdk.createProjectRequiredCase({
        path,
        body: { description },
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  // 스위치는 누르는 즉시 바뀐 상태를 보여준다. 저장이 끝날 때까지 같은 스위치는 잠가 순서가 뒤바뀌지 않게 한다.
  const [toggling, setToggling] = useState<ReadonlySet<string>>(new Set());
  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      sdk.updateProjectRequiredCase({
        path: { ...path, caseId: id },
        body: { enabled },
        throwOnError: true,
      }),
    onMutate: ({ id, enabled }) => {
      setToggling((ids) => new Set(ids).add(id));
      void queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, (cases) =>
        cases?.map((c) => (c.id === id ? { ...c, enabled } : c)),
      );
    },
    onSuccess,
    onError,
    onSettled: (_data, _error, { id }) =>
      setToggling((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      }),
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteProjectRequiredCase({
        path: { ...path, caseId: id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.show({ message: "삭제했습니다", tone: "success" });
      return onSuccess();
    },
    onError,
  });
  return { create, toggle, toggling, remove };
}

export interface RequiredCasesEditorProps {
  projectId: string;
  cases: RequiredCase[];
  readOnly?: boolean;
}

/** 켜진 필수 케이스는 생성할 때 빠지지 않게 한다. 기본 케이스는 끌 수만 있다. */
export function RequiredCasesEditor({
  projectId,
  cases,
  readOnly,
}: RequiredCasesEditorProps) {
  const actions = useRequiredCaseActions(projectId);
  const [description, setDescription] = useState("");
  const add = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = description.trim();
    if (trimmed)
      actions.create.mutate(trimmed, { onSuccess: () => setDescription("") });
  };

  return (
    <section
      aria-label="필수 케이스"
      className="flex max-w-4xl flex-col divide-y divide-line rounded-lg border border-line bg-surface"
    >
      {cases.map((c) => (
        <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
          <Switch
            className="min-w-0 flex-1"
            label={c.description}
            checked={c.enabled}
            disabled={readOnly || actions.toggling.has(c.id)}
            onCheckedChange={(enabled) =>
              actions.toggle.mutate({ id: c.id, enabled })
            }
          />
          {!readOnly && !c.isDefault && (
            <IconButton
              icon={Trash2}
              size="sm"
              label={`${c.description} 삭제`}
              disabled={actions.remove.isPending}
              onClick={() => actions.remove.mutate(c.id)}
            />
          )}
        </div>
      ))}
      {!readOnly && (
        <form onSubmit={add} className="flex items-center gap-2 px-4 py-2.5">
          <TextField
            size="sm"
            placeholder="필수 케이스 직접 추가"
            aria-label="필수 케이스 직접 추가"
            className="min-w-0 flex-1"
            maxLength={300}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            icon={Plus}
            loading={actions.create.isPending}
            disabled={!description.trim()}
          >
            추가
          </Button>
        </form>
      )}
    </section>
  );
}
