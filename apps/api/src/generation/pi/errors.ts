/** 저장 실패는 모델의 부분 완료로 처리하지 않고 큐 재시도에 맡긴다. */
export class PiInfrastructureError extends Error {
  constructor(cause: unknown) {
    super("pi 작업 저장에 실패했습니다.", { cause });
  }
}
