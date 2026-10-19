import { Button, Select, TextArea, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import type { PermissionGrant } from "@/entities/permission";
import { can } from "@/entities/permission";
import { projectsQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

export interface CreateTestSetFormProps {
  /** 내 권한. 테스트 세트를 만들 수 있는 프로젝트만 고르게 한다. */
  permissions: readonly PermissionGrant[];
  onCreated: (testSetId: string) => void;
}

/** 이름, 프로젝트, 메모로 테스트 세트를 만든다. 프로젝트는 만든 뒤 바꿀 수 없다. */
export function CreateTestSetForm({
  permissions,
  onCreated,
}: CreateTestSetFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const projects = (useQuery(projectsQuery()).data ?? []).filter((p) =>
    can(permissions, "test_set.create", p.id),
  );
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [touched, setTouched] = useState(false);
  const chosen = projectId ?? (projects.length === 1 ? projects[0]?.id : null);

  const create = useMutation({
    mutationFn: () =>
      sdk.createTestSet({
        body: {
          name: name.trim(),
          projectId: chosen ?? "",
          memo: memo.trim(),
        },
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({
        predicate: (q) =>
          (q.queryKey[0] as { _id?: string } | undefined)?._id ===
          "listTestSets",
      });
      onCreated(data.id);
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 테스트 세트 목록에서 만들어졌는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });

  const errors = {
    name: name.trim() ? undefined : "테스트 세트 이름을 입력하세요",
    project: chosen ? undefined : "프로젝트를 고르세요",
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!errors.name && !errors.project) create.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <TextField
          label="테스트 세트 이름"
          required
          maxLength={100}
          counter={`${name.trim().length}/100`}
          error={touched ? errors.name : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="프로젝트"
          required
          placeholder="프로젝트 선택"
          description="만든 뒤에는 바꿀 수 없습니다"
          error={touched ? errors.project : undefined}
          value={chosen ?? null}
          items={projects.map((p) => ({ value: p.id, label: p.name }))}
          onValueChange={setProjectId}
        />
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <TextArea
          label="메모"
          rows={4}
          maxLength={5000}
          placeholder="이번 배포에서 바뀐 점, 꼭 확인할 부분"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </section>
      <div className="flex justify-end gap-2">
        <Button type="submit" loading={create.isPending}>
          직접 작성
        </Button>
      </div>
    </form>
  );
}
