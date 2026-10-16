import type { AnalysisDto } from "@/shared/api/generated";
import { getAnalysis, saveAnalysis } from "@/shared/api/generated";
export async function readAnalysis(projectId: string) {
  return (await getAnalysis({ path: { projectId }, throwOnError: true })).data;
}
export async function writeAnalysis(projectId: string, body: AnalysisDto) {
  try {
    return (
      await saveAnalysis({ path: { projectId }, body, throwOnError: true })
    ).data;
  } catch {
    throw new Error(
      "분석 결과의 저장 여부를 확인하지 못했습니다. 변경 내용은 이 화면에 남아 있습니다.",
    );
  }
}
