import { Global, Injectable, Module } from "@nestjs/common";
import type { Actor, CaseOp } from "@workspace/contracts";

export type LiveChange =
  | { type: "resync"; testSetId: string; reason?: string; closeLinks?: boolean }
  | {
      type: "ops";
      testSetId: string;
      version: number;
      ops: CaseOp[];
      connectionId: string | null;
      actor: Actor;
    }
  | { type: "identity" };

@Injectable()
export class LiveEvents {
  private readonly listeners = new Set<(change: LiveChange) => Promise<void>>();
  subscribe(listener: (change: LiveChange) => Promise<void>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async publish(change: LiveChange) {
    // 저장 커밋은 전파 실패 때문에 HTTP 실패로 바뀌지 않는다. 클라이언트는 hello로 복구한다.
    await Promise.allSettled(
      [...this.listeners].map((listener) => listener(change)),
    );
  }
}
@Global()
@Module({ providers: [LiveEvents], exports: [LiveEvents] })
export class LiveEventsModule {}
