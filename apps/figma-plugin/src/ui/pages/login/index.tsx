import { Button, EmptyState, useToast } from "@cheddar/ui";
import { ExternalLink, Loader2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type MeDto, sdk, toApiFailure } from "@/shared/api";
import { openConnectInWeb } from "@/shared/lib/figma-bridge";
import { PluginShell } from "@/shared/ui/plugin-shell";

const POLL_MS = 2000;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

/** 브라우저에서 로그인하고 연결을 누를 때까지 기다린다 */
export function LoginPage({
  onSignedIn,
}: {
  onSignedIn: (token: string, account: MeDto) => void;
}) {
  const toast = useToast();
  const [waiting, setWaiting] = useState(false);
  const [starting, setStarting] = useState(false);
  const run = useRef<AbortController | null>(null);
  useEffect(() => () => run.current?.abort(), []);

  const start = async () => {
    const controller = new AbortController();
    run.current = controller;
    setStarting(true);
    try {
      const { data } = await sdk.createPluginConnection({ throwOnError: true });
      await openConnectInWeb(data.requestToken);
      setWaiting(true);
      while (!controller.signal.aborted) {
        await wait(POLL_MS, controller.signal);
        if (controller.signal.aborted) return;
        try {
          const result = await sdk.exchangePluginConnection({
            body: { requestToken: data.requestToken },
            throwOnError: true,
          });
          if (result.response.status === 200 && "token" in result.data) {
            onSignedIn(result.data.token, result.data.account);
            return;
          }
        } catch (error) {
          // 잠깐 끊긴 연결은 다음 확인에서 다시 묻는다
          if (toApiFailure(error).code !== "NETWORK") throw error;
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setWaiting(false);
      const failure = toApiFailure(error);
      toast.show({
        tone: "danger",
        message:
          failure.code === "PLUGIN_CONNECTION_EXPIRED"
            ? "연결 시간이 지났습니다. 다시 로그인하세요."
            : failure.message,
      });
    } finally {
      setStarting(false);
    }
  };
  const cancel = () => {
    run.current?.abort();
    setWaiting(false);
  };

  return (
    <PluginShell
      footer={
        waiting ? (
          <Button variant="secondary" block onClick={cancel}>
            취소
          </Button>
        ) : (
          <Button
            variant="primary"
            block
            icon={ExternalLink}
            loading={starting}
            onClick={() => void start()}
          >
            브라우저에서 로그인
          </Button>
        )
      }
    >
      <div className="flex flex-1 flex-col justify-center">
        {waiting ? (
          <EmptyState
            compact
            icon={Loader2}
            title="연결 대기 중"
            description="브라우저에서 연결을 누르세요."
          />
        ) : (
          <EmptyState
            compact
            icon={UserRound}
            title="로그인"
            description="Cheddar 계정으로 로그인하세요."
          />
        )}
      </div>
    </PluginShell>
  );
}
