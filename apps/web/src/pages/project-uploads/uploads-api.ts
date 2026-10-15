import { downloadFile } from "@/shared/api/generated/sdk.gen";

export function uploadError(error: unknown, fallback: string) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    typeof error.error === "object" &&
    error.error !== null &&
    "code" in error.error
      ? error.error.code
      : undefined;
  if (code === "NOT_FOUND")
    return "프로젝트나 업로드를 찾을 수 없습니다. 목록에서 다시 선택해주세요.";
  if (code === "VALIDATION_ERROR") return "입력 내용을 확인해주세요.";
  return fallback;
}

export async function frameFile(
  projectId: string,
  fileId: string,
  signal?: AbortSignal,
) {
  const result = await downloadFile({
    path: { projectId, fileId },
    parseAs: "blob",
    signal,
    throwOnError: true,
  });
  if (!(result.data instanceof Blob))
    throw new Error("File response is not a blob.");
  return result.data;
}
