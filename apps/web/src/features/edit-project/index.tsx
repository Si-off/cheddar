import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, TextArea, TextField, useToast } from "@workspace/ui";
import { type SubmitEvent, useState } from "react";
import { type Project, projectQuery, projectsQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

export interface EditProjectDialogProps {
  project: Project;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 프로젝트 이름과 설명을 바꾼다. */
export function EditProjectDialog({
  project,
  open,
  onOpenChange,
}: EditProjectDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        {open && (
          <EditForm project={project} onDone={() => onOpenChange(false)} />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function EditForm({
  project,
  onDone,
}: {
  project: Project;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [touched, setTouched] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      sdk.updateProject({
        path: { projectId: project.id },
        body: { name: name.trim(), description: description.trim() },
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      queryClient.setQueryData(projectQuery(project.id).queryKey, data);
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
      });
      toast.show({ message: "저장했습니다", tone: "success" });
      onDone();
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 새로 고쳐 바뀌었는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (name.trim()) save.mutate();
  };
  return (
    <form onSubmit={submit} noValidate className="contents">
      <Dialog.Header title="프로젝트 정보" />
      <Dialog.Body>
        <TextField
          label="프로젝트 이름"
          required
          maxLength={100}
          counter={`${name.trim().length}/100`}
          error={
            touched && !name.trim() ? "프로젝트 이름을 입력하세요" : undefined
          }
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <TextArea
          label="설명"
          rows={3}
          maxLength={2000}
          counter={`${description.trim().length}/2000`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button type="submit" variant="primary" loading={save.isPending}>
          저장
        </Button>
      </Dialog.Footer>
    </form>
  );
}
