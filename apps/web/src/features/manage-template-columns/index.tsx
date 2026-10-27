import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@workspace/ui";
import {
  fromTemplateDraft,
  projectsQuery,
  type Template,
  type TemplateDraft,
  templateQuery,
} from "@/entities/project";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";

export interface SaveTemplateCallbacks {
  /** 저장된 양식. 캐시보다 먼저 알려 편집 상태가 새 revision을 기준으로 삼게 한다. */
  onSaved: (template: Template) => void;
  /** 다른 저장이 먼저 있었다. 입력은 지우지 않는다. */
  onConflict: () => void;
}

/** 기본 양식 전체를 저장한다. 서버는 편집을 시작한 revision이 최신일 때만 받는다. */
export function useSaveTemplate(
  projectId: string,
  { onSaved, onConflict }: SaveTemplateCallbacks,
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TemplateDraft) =>
      sdk.updateProjectTemplate({
        path: { projectId },
        body: fromTemplateDraft(draft),
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      onSaved(data);
      queryClient.setQueryData(templateQuery(projectId).queryKey, data);
      toast.show({ message: "저장했습니다", tone: "success" });
      void queryClient.invalidateQueries({
        queryKey: projectsQuery().queryKey,
      });
    },
    onError: (error) => {
      if (isApiFailure(error, "TEMPLATE_CONFLICT")) return onConflict();
      // 이미 저장됐다면 다시 저장할 때 양식이 바뀌었다고 알려 준다
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못해 저장됐는지 알 수 없습니다. 다시 저장하세요.",
        }).message,
        tone: "danger",
      });
    },
  });
}
