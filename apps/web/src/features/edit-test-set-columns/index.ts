import { useToast } from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { reviewItemsQuery } from "@/entities/generation";
import { fromTemplateDraft, type TemplateDraft } from "@/entities/project";
import { type TestSet, testSetQuery } from "@/entities/test-set";
import { sdk, toApiFailure } from "@/shared/api";

/**
 * 테스트 세트의 항목 전체를 저장한다. 프로젝트 기본 양식은 바뀌지 않는다.
 * 빠진 항목의 값과 새 형식에 맞지 않는 값은 서버가 지운다.
 */
export function useSaveColumns(testSetId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (draft: TemplateDraft) =>
      sdk.updateTestSetColumns({
        path: { testSetId },
        body: { columns: fromTemplateDraft(draft).columns },
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      queryClient.setQueryData(
        testSetQuery(testSetId).queryKey,
        (current: TestSet | undefined) =>
          current && {
            ...current,
            version: data.version,
            columns: data.columns,
            cases: data.cases,
          },
      );
      // 서버가 확인 필요 초안도 새 양식에 맞게 정리했으니 다시 읽는다
      void queryClient.invalidateQueries({
        queryKey: reviewItemsQuery(testSetId).queryKey,
      });
      toast.show({ message: "저장했습니다", tone: "success" });
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못해 저장됐는지 알 수 없습니다. 새로 고쳐 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
}
