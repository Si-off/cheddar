import { QueryCache, QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { createToaster } from "@workspace/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProviders } from "./app/providers";
import { createAppRouter } from "./app/router";
import { configureApiClient, isApiFailure, toApiFailure } from "./shared/api";
import "./app/styles/global.css";

configureApiClient();
const toaster = createToaster();

const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // 미인증은 로그인으로 보낸다. 세션 조회의 미인증은 라우터 경계가 돌아갈 주소와 함께 처리한다.
      // meta.quietCodes에 있는 오류는 그 화면이 직접 안내한다.
      const key = query.queryKey[0] as { _id?: string } | undefined;
      const quiet = (query.meta?.quietCodes as string[] | undefined) ?? [];
      if (quiet.some((code) => isApiFailure(error, code))) return;
      if (isApiFailure(error, "UNAUTHENTICATED")) {
        if (key?._id === "getMe") return;
        void router.navigate({
          to: "/login",
          search: { redirect: router.state.location.href },
        });
        return;
      }
      toaster.show({ message: toApiFailure(error).message, tone: "danger" });
    },
  }),
  // 조회 실패는 한 번만 다시 시도하고 바로 알린다
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } },
});
const router = createAppRouter(queryClient);

const element = document.getElementById("root");
if (!element) throw new Error("Root element is missing.");

createRoot(element).render(
  <StrictMode>
    <AppProviders queryClient={queryClient} toaster={toaster}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
