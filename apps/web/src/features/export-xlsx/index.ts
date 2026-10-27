import { useMutation } from "@tanstack/react-query";
import { useToast } from "@workspace/ui";
import { sdk, toApiFailure } from "@/shared/api";

/** 저장된 케이스 전체를 XLSX로 받는다. 확인 필요 항목은 넣지 않는다. */
export function useExportXlsx(testSetId: string, fileName: string) {
  return useDownloadXlsx(
    fileName,
    async () =>
      (
        await sdk.exportTestSet({
          path: { testSetId },
          parseAs: "blob",
          throwOnError: true,
        })
      ).data as Blob,
  );
}

/** 공개 링크로 연 테스트 세트를 XLSX로 받는다 */
export function useExportSharedXlsx(linkToken: string, fileName: string) {
  return useDownloadXlsx(
    fileName,
    async () =>
      (
        await sdk.exportSharedTestSet({
          path: { linkToken },
          parseAs: "blob",
          throwOnError: true,
        })
      ).data as Blob,
  );
}

function useDownloadXlsx(fileName: string, download: () => Promise<Blob>) {
  const toast = useToast();
  return useMutation({
    mutationFn: download,
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
