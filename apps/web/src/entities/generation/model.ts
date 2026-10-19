import type { CellValue } from "@/entities/test-set";
import { env } from "@/shared/config/env";

export type GenerationStage = "screens" | "flows" | "cases" | "finish";
export type GenerationStatus = "queued" | "running" | "succeeded" | "failed";

/** 사용자에게 보여주는 단계. 내부 처리와 모델은 보이지 않는다. */
export const stageLabels: { key: GenerationStage; label: string }[] = [
  { key: "screens", label: "화면 살펴보기" },
  { key: "flows", label: "사용 흐름 이해하기" },
  { key: "cases", label: "테스트 케이스 작성하기" },
  { key: "finish", label: "마무리하기" },
];

export interface Generation {
  jobId: string;
  kind: "initial" | "append" | "rewrite";
  status: GenerationStatus;
  stage: GenerationStage | null;
  addedCount: number;
  reviewCount: number;
  errorMessage: string | null;
}

export type GenerationEvent =
  | { type: "progress"; stage: GenerationStage; status: GenerationStatus }
  | {
      type: "done";
      status: "succeeded" | "failed";
      addedCount?: number;
      reviewCount?: number;
      errorMessage?: string;
    };

/**
 * 생성 진행을 받는다. 서버가 끝을 알리면 연결을 닫는다.
 * 돌려준 함수를 부르면 구독을 멈춘다.
 */
export function subscribeGeneration(
  jobId: string,
  onEvent: (event: GenerationEvent) => void,
  onConnectionError: () => void,
) {
  const source = new EventSource(
    `${env.apiBaseUrl}/api/v1/generations/${jobId}/events`,
    { withCredentials: true },
  );
  let finished = false;
  source.addEventListener("progress", (message) => {
    const data = JSON.parse((message as MessageEvent<string>).data);
    onEvent({ type: "progress", stage: data.stage, status: data.status });
  });
  source.addEventListener("done", (message) => {
    finished = true;
    source.close();
    onEvent({
      type: "done",
      ...JSON.parse((message as MessageEvent<string>).data),
    });
  });
  // 브라우저가 다시 연결을 시도하다가 완전히 닫히면 알린다
  source.onerror = () => {
    if (!finished && source.readyState === EventSource.CLOSED)
      onConnectionError();
  };
  return () => {
    finished = true;
    source.close();
  };
}

export type ReviewStatus = "pending" | "rewriting" | "excluded" | "resolved";

export interface ReviewItem {
  id: string;
  reason: string;
  question: string | null;
  answer: string;
  draft: Record<string, CellValue>;
  status: ReviewStatus;
}
