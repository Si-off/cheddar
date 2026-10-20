import { Button, EmptyState } from "@cheddar/ui";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CloudOff, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { LoginPage } from "@/pages/login";
import { UploadPage } from "@/pages/upload";
import { type MeDto, sdk, toApiFailure, useAuthToken } from "@/shared/api";
import {
  connectToFigma,
  isMainOutdated,
  loadAuthToken,
  saveAuthToken,
  useFigmaConnection,
} from "@/shared/lib/figma-bridge";
import { PluginShell } from "@/shared/ui/plugin-shell";
import { AppProviders } from "./providers";

type Auth =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "error"; offline: boolean }
  | { state: "signed-in"; account: MeDto };

function Root() {
  const queryClient = useQueryClient();
  const connected = useFigmaConnection((s) => s.connected);
  const outdated = useFigmaConnection(isMainOutdated);
  const [auth, setAuth] = useState<Auth>({ state: "loading" });

  const clearAccount = () => {
    useAuthToken.setState({ token: null });
    void saveAuthToken(null);
    queryClient.clear();
    setAuth({ state: "signed-out" });
  };
  // 서버 토큰을 먼저 폐기한다. 서버가 늦거나 닿지 않아도 이 기기에서는 로그아웃한다.
  const signOut = async () => {
    await sdk
      .revokePluginConnection({ signal: AbortSignal.timeout(5000) })
      .catch(() => undefined);
    clearAccount();
  };
  const restore = async () => {
    setAuth({ state: "loading" });
    try {
      const token = await loadAuthToken();
      if (!token) return setAuth({ state: "signed-out" });
      useAuthToken.setState({ token });
      const { data } = await sdk.getMe({ throwOnError: true });
      setAuth({ state: "signed-in", account: data });
    } catch (error) {
      const { code } = toApiFailure(error);
      // 토큰이 폐기됐거나 계정이 막혔으면 다시 로그인한다
      if (code === "UNAUTHENTICATED") clearAccount();
      else setAuth({ state: "error", offline: code === "NETWORK" });
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Figma와 연결된 뒤 한 번만 복원한다
  useEffect(() => {
    if (connected && !outdated) void restore();
  }, [connected]);

  // 원격 UI가 새 main 기능을 쓰는데 Figma에 받은 플러그인이 아직 이전 버전이다
  if (outdated)
    return (
      <PluginShell>
        <div className="flex flex-1 flex-col justify-center">
          <EmptyState
            compact
            icon={CircleAlert}
            title="플러그인 업데이트가 필요합니다"
            description="Figma에서 Cheddar를 닫았다가 다시 실행하세요."
          />
        </div>
      </PluginShell>
    );
  if (auth.state === "loading") return null;
  if (auth.state === "error")
    return (
      <PluginShell
        footer={
          <Button
            variant="primary"
            block
            icon={RotateCcw}
            onClick={() => void restore()}
          >
            다시 시도
          </Button>
        }
      >
        <div className="flex flex-1 flex-col justify-center">
          {auth.offline ? (
            <EmptyState
              compact
              icon={CloudOff}
              title="서버에 연결하지 못했습니다"
              description="잠시 후 다시 시도하세요."
            />
          ) : (
            <EmptyState
              compact
              icon={CircleAlert}
              title="계정을 확인하지 못했습니다"
            />
          )}
        </div>
      </PluginShell>
    );
  if (auth.state === "signed-out")
    return (
      <LoginPage
        onSignedIn={(token, account) => {
          useAuthToken.setState({ token });
          void saveAuthToken(token);
          setAuth({ state: "signed-in", account });
        }}
      />
    );
  return (
    <UploadPage
      account={auth.account}
      onSignOut={() => void signOut()}
      onSignedOut={clearAccount}
    />
  );
}

export function App() {
  useEffect(connectToFigma, []);
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
