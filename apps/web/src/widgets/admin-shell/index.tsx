import type { ReactNode } from "react";

/** 관리 화면의 제목. 관리할 대상은 계정 하나다. */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <h1 className="m-0 text-title-lg text-fg">계정</h1>
      {children}
    </main>
  );
}
