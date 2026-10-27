import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, TextArea, TextField, useToast } from "@workspace/ui";
import { type SubmitEvent, useState } from "react";
import { projectsQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

export interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (projectId: string) => void;
}

/** 이름과 설명으로 만든다. 기본 양식과 기본 필수 케이스가 함께 만들어진다. */
export function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateProjectDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [touched, setTouched] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      sdk.createProject({
        body: { name: name.trim(), description: description.trim() },
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
      });
      setName("");
      setDescription("");
      setTouched(false);
      onCreated(data.id);
    },
    onError: (error) => {
      // 만들어졌는데 응답만 끊겼을 수 있으니 목록을 다시 읽어 둔다
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
      });
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 창을 닫고 목록에서 만들어졌는지 확인하세요.",
        }).message,
        tone: "danger",
      });
    },
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (name.trim()) create.mutate();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <form onSubmit={submit} noValidate className="contents">
          <Dialog.Header title="프로젝트 만들기" />
          <Dialog.Body>
            <TextField
              label="프로젝트 이름"
              required
              maxLength={100}
              counter={`${name.trim().length}/100`}
              error={
                touched && !name.trim()
                  ? "프로젝트 이름을 입력하세요"
                  : undefined
              }
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <TextArea
              label="설명"
              rows={3}
              maxLength={2000}
              counter={`${description.trim().length}/2000`}
              placeholder="예: 모바일 쇼핑 앱"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={<Button variant="ghost" />}>
              취소
            </Dialog.Close>
            <Button type="submit" variant="primary" loading={create.isPending}>
              만들기
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
