import { useToast } from "@cheddar/ui";
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { type SharingDto, sdk, toApiFailure } from "@/shared/api";

export type Sharing = SharingDto;
export type ShareAccess = "view" | "edit";

export const sharingQuery = (testSetId: string) =>
  queryOptions({
    queryKey: ["test-set-sharing", testSetId],
    queryFn: async () =>
      (
        await sdk.getTestSetSharing({
          path: { testSetId },
          throwOnError: true,
        })
      ).data,
  });

/** 공유 설정을 바꾸는 요청. 응답은 갱신된 공유 설정 전체다. */
export function useSharingChange<T>(
  testSetId: string,
  request: (input: T) => Promise<{ data: Sharing }>,
  options: { success?: string } = {},
) {
  const toast = useToast();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: ({ data }) => {
      queryClient.setQueryData(sharingQuery(testSetId).queryKey, data);
      if (options.success)
        toast.show({ message: options.success, tone: "success" });
    },
    onError: (error) => {
      void queryClient.invalidateQueries({
        queryKey: sharingQuery(testSetId).queryKey,
      });
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 공유 창을 다시 열어 바뀌었는지 확인하세요.",
        }).message,
        tone: "danger",
      });
    },
  });
}

export function useSharingActions(testSetId: string) {
  const path = { testSetId };
  return {
    update: useSharingChange(
      testSetId,
      (body: {
        visibility?: "private" | "public";
        linkPermission?: ShareAccess;
      }) => sdk.updateTestSetSharing({ path, body, throwOnError: true }),
    ),
    replaceLink: useSharingChange(
      testSetId,
      () => sdk.replaceTestSetLink({ path, throwOnError: true }),
      { success: "새 링크를 만들었습니다" },
    ),
  };
}
