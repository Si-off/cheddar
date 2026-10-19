import {
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  Menu,
  SortableList,
  TextArea,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { type FeatureGroup, featureGroupsQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

const unknownResult = "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.";

function useFeatureGroupActions(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = featureGroupsQuery(projectId);
  const onError = (error: unknown) => {
    toast.show({
      message: toApiFailure(error, { unknownResult }).message,
      tone: "danger",
    });
    return queryClient.invalidateQueries({ queryKey });
  };
  const onSuccess = () => queryClient.invalidateQueries({ queryKey });
  const path = { projectId };

  const create = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      sdk.createProjectFeatureGroup({ path, body, throwOnError: true }),
    onSuccess,
    onError,
  });
  const update = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      name: string;
      description: string;
    }) =>
      sdk.updateProjectFeatureGroup({
        path: { ...path, groupId: id },
        body,
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteProjectFeatureGroup({
        path: { ...path, groupId: id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.show({ message: "삭제했습니다", tone: "success" });
      return onSuccess();
    },
    onError,
  });
  // 끌어서 놓는 즉시 순서를 보여주고, 실패하면 서버 순서로 되돌린다
  const reorder = useMutation({
    mutationFn: (groups: FeatureGroup[]) =>
      sdk.reorderProjectFeatureGroups({
        path,
        body: { ids: groups.map((g) => g.id) },
        throwOnError: true,
      }),
    onMutate: (groups) => {
      void queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, groups);
    },
    onSuccess,
    onError,
  });
  return { create, update, remove, reorder };
}

export interface FeatureGroupsEditorProps {
  projectId: string;
  groups: FeatureGroup[];
  readOnly?: boolean;
}

/** 추가 칸과 순서를 바꿀 수 있는 기능 그룹 목록 */
export function FeatureGroupsEditor({
  projectId,
  groups,
  readOnly,
}: FeatureGroupsEditorProps) {
  const actions = useFeatureGroupActions(projectId);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<{
    group: FeatureGroup;
    focus: "name" | "description";
  } | null>(null);
  const [deleting, setDeleting] = useState<FeatureGroup | null>(null);

  const add = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed)
      actions.create.mutate(
        { name: trimmed, description: "" },
        { onSuccess: () => setName("") },
      );
  };

  return (
    <>
      {!readOnly && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <TextField
            size="sm"
            placeholder="그룹 이름"
            aria-label="새 기능 그룹 이름"
            className="w-64 max-w-full"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            icon={Plus}
            loading={actions.create.isPending}
            disabled={!name.trim()}
          >
            추가
          </Button>
        </form>
      )}
      {groups.length > 0 && (
        <section className="max-w-4xl rounded-lg border border-line bg-surface">
          <SortableList
            aria-label="기능 그룹"
            items={groups}
            disabled={readOnly}
            getId={(g) => g.id}
            getHandleLabel={(g) => `${g.name} 순서 이동`}
            onReorder={(next) => actions.reorder.mutate(next)}
            divided
            renderItem={(g, handle) => (
              <div className="flex items-center gap-3 px-4 py-2.5">
                {handle}
                <span className="w-40 shrink-0 font-medium text-body text-fg">
                  {g.name}
                </span>
                <span className="min-w-0 flex-1 text-body-sm text-fg-muted">
                  {g.description}
                </span>
                {!readOnly && (
                  <Menu.Root>
                    <Menu.Trigger
                      render={
                        <IconButton
                          icon={MoreHorizontal}
                          label={`${g.name} 작업`}
                          size="sm"
                        />
                      }
                    />
                    <Menu.Popup align="end">
                      <Menu.Item
                        onClick={() => setEditing({ group: g, focus: "name" })}
                      >
                        이름 변경
                      </Menu.Item>
                      <Menu.Item
                        onClick={() =>
                          setEditing({ group: g, focus: "description" })
                        }
                      >
                        설명 편집
                      </Menu.Item>
                      <Menu.Separator />
                      <Menu.Item
                        icon={Trash2}
                        tone="danger"
                        onClick={() => setDeleting(g)}
                      >
                        삭제
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Root>
                )}
              </div>
            )}
          />
        </section>
      )}
      <Dialog.Root
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <Dialog.Content size="sm">
          {editing && (
            <EditForm
              key={editing.group.id}
              group={editing.group}
              focus={editing.focus}
              pending={actions.update.isPending}
              onSave={(body) =>
                actions.update.mutate(
                  { id: editing.group.id, ...body },
                  { onSuccess: () => setEditing(null) },
                )
              }
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description="이미 만든 테스트 세트의 케이스는 그대로 남습니다."
        confirmLabel="삭제"
        tone="danger"
        pending={actions.remove.isPending}
        onConfirm={() =>
          deleting &&
          actions.remove.mutate(deleting.id, {
            onSettled: () => setDeleting(null),
          })
        }
      />
    </>
  );
}

function EditForm({
  group,
  focus,
  pending,
  onSave,
}: {
  group: FeatureGroup;
  focus: "name" | "description";
  pending: boolean;
  onSave: (body: { name: string; description: string }) => void;
}) {
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (name.trim())
      onSave({ name: name.trim(), description: description.trim() });
  };
  return (
    <form onSubmit={submit} className="contents">
      <Dialog.Header title={focus === "name" ? "이름 변경" : "설명 편집"} />
      <Dialog.Body>
        <TextField
          label="그룹 이름"
          required
          maxLength={100}
          autoFocus={focus === "name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextArea
          label="설명"
          rows={3}
          maxLength={2000}
          autoFocus={focus === "description"}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          type="submit"
          variant="primary"
          loading={pending}
          disabled={!name.trim()}
        >
          저장
        </Button>
      </Dialog.Footer>
    </form>
  );
}
