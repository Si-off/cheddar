import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createToaster, ToastProvider } from "@workspace/ui";
import { MotionConfig } from "motion/react";
import type { PropsWithChildren } from "react";
import { configureApiClient } from "@/shared/api";

configureApiClient();
const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
});
const toaster = createToaster();

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider toaster={toaster}>{children}</ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
