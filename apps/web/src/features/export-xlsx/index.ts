import { useToast } from "@cheddar/ui";
import { useMutation } from "@tanstack/react-query";
import { sdk, toApiFailure } from "@/shared/api";

/** 저장된 케이스 전체를 XLSX로 받는다. 확인 필요 항목은 넣지 않는다. */
export function useExportXlsx(testSetId: string, fileName: string) {
  const toast = useToast();
  return useMutation({
    mutationFn: async () =>
      (
        await sdk.exportTestSet({
          path: { testSetId },
          parseAs: "blob",
          throwOnError: true,
        })
      ).data as Blob,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${fileName}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error).message,
        tone: "danger",
      }),
  });
}
