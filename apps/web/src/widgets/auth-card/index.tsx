import type { ReactNode } from "react";

/** 로그인 전 화면들(로그인, 비밀번호 설정)이 함께 쓰는 가운데 카드 */
export function AuthCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-4 pt-28 pb-12">
      <section className="flex h-fit w-full max-w-sm flex-col gap-5 rounded-lg border border-line bg-surface p-8 shadow-raised">
        <h1 className="m-0 text-title-lg text-fg">{title}</h1>
        {children}
      </section>
    </main>
  );
}
