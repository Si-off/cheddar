import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type Toaster, ToastProvider } from "@workspace/ui";
import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function AppProviders({
  queryClient,
  toaster,
  children,
}: {
  queryClient: QueryClient;
  toaster: Toaster;
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider toaster={toaster}>{children}</ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
