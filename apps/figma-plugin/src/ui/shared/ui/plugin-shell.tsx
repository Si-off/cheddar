import { Avatars } from "@cheddar/ui";
import type { ReactNode } from "react";

/** 플러그인 창 한 장. 머리글, 내용, 아래 버튼 줄 */
export function PluginShell({
  account,
  children,
  footer,
}: {
  /** 로그인한 계정 */
  account?: { id: string; name: string };
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col bg-surface text-body-sm text-fg">
      <header className="flex h-11 shrink-0 items-center gap-2 border-line border-b px-4">
        <span className="font-bold text-title-sm">Cheddar</span>
        <span className="flex-1" />
        {account && (
          <span className="flex items-center gap-1.5 text-caption text-fg-muted">
            <Avatars
              people={[{ id: account.id, name: account.name, color: 2 }]}
              aria-label="로그인한 계정"
            />
            {account.name}
          </span>
        )}
      </header>
      <main className="flex min-h-0 flex-1 flex-col overflow-auto px-4 py-3.5">
        {children}
      </main>
      {footer && (
        <footer className="flex shrink-0 flex-col gap-2 border-line border-t px-4 py-3">
          {footer}
        </footer>
      )}
    </div>
  );
}
