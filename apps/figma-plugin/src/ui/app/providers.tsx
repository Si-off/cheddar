import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import type { PropsWithChildren } from "react";

import { configureApiClient } from "@/shared/api/configure";

configureApiClient();
const queryClient = new QueryClient({
  defaultOptions: { mutations: { retry: false } },
});

export function AppProviders({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </QueryClientProvider>
  );
}
