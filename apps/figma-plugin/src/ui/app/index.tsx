import { LoadError } from "@cheddar/ui";
import { useEffect, useState } from "react";
import { LoginPage } from "@/pages/login";
import { UploadPage } from "@/pages/upload";
import { type MeDto, sdk, toApiFailure, useAuthToken } from "@/shared/api";
import {
  connectToFigma,
  loadAuthToken,
  saveAuthToken,
  useFigmaConnection,
} from "@/shared/lib/figma-bridge";
import { AppProviders } from "./providers";

type Auth =
  | { state: "loading" }
  | { state: "signed-out" }
  | { state: "error" }
  | { state: "signed-in"; account: MeDto };

function Root() {
  const connected = useFigmaConnection((s) => s.connected);
  const [auth, setAuth] = useState<Auth>({ state: "loading" });

  const signOut = () => {
    useAuthToken.setState({ token: null });
    void saveAuthToken(null);
    setAuth({ state: "signed-out" });
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
      // 토큰이 폐기됐거나 계정이 막혔으면 다시 로그인한다
      if (toApiFailure(error).code === "UNAUTHENTICATED") signOut();
      else setAuth({ state: "error" });
    }
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: Figma와 연결된 뒤 한 번만 복원한다
  useEffect(() => {
    if (connected) void restore();
  }, [connected]);

  if (auth.state === "loading") return null;
  if (auth.state === "error")
    return (
      <div className="flex h-screen items-center justify-center px-4">
        <LoadError
          title="계정을 확인하지 못했습니다"
          onRetry={() => void restore()}
        />
      </div>
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
  return <UploadPage account={auth.account} onSignedOut={signOut} />;
}

export function App() {
  useEffect(connectToFigma, []);
  return (
    <AppProviders>
      <Root />
    </AppProviders>
  );
}
