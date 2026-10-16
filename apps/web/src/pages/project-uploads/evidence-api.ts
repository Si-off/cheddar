import type { EvidenceDto } from "@/shared/api/generated";
import { getEvidence, saveEvidence } from "@/shared/api/generated";
export async function readEvidence(projectId: string) {
  return (await getEvidence({ path: { projectId }, throwOnError: true })).data;
}
export async function writeEvidence(projectId: string, body: EvidenceDto) {
  try {
    return (
      await saveEvidence({ path: { projectId }, body, throwOnError: true })
    ).data;
  } catch {
    throw new Error(
      "근거를 저장하지 못했습니다. 입력을 복사한 뒤 최신 자료를 확인해주세요.",
    );
  }
}
