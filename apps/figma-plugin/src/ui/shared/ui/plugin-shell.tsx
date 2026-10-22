import { Avatars, Icon, Menu, useToast } from "@cheddar/ui";
import { ChevronDown, ExternalLink, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { openHomeInWeb } from "@/shared/lib/figma-bridge";

/** 플러그인 창 한 장. 계정 머리글(로그인했을 때만), 내용, 아래 버튼 줄 */
export function PluginShell({
  account,
  onSignOut,
  children,
  footer,
}: {
  /** 로그인한 계정. 있으면 머리글에 계정 메뉴를 둔다 */
  account?: { id: string; name: string; loginId: string };
  onSignOut?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const toast = useToast();
  return (
    <div className="flex h-screen flex-col bg-surface text-body-sm text-fg">
      {account && (
        <header className="flex h-11 shrink-0 items-center justify-end border-line border-b px-2.5">
          <Menu.Root>
            <Menu.Trigger
              aria-label={`${account.name} 계정 메뉴`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md pr-1.5 pl-1 text-caption text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg data-popup-open:bg-subtle data-popup-open:text-fg"
            >
              <span aria-hidden="true" className="inline-flex">
                <Avatars
                  people={[{ id: account.id, name: account.name, color: 2 }]}
                />
              </span>
              {account.name}
              <Icon icon={ChevronDown} size="sm" className="text-fg-muted" />
            </Menu.Trigger>
            <Menu.Popup align="end" className="w-56">
              <div className="flex flex-col gap-0.5 px-2 py-2">
                <span className="text-label text-fg">{account.name}</span>
                <span className="text-caption text-fg-muted">
                  {account.loginId}
                </span>
              </div>
              <Menu.Separator />
              <Menu.Item
                icon={ExternalLink}
                onClick={() =>
                  void openHomeInWeb().catch(() =>
                    toast.show({
                      tone: "danger",
                      message: "브라우저를 열지 못했습니다.",
                    }),
                  )
                }
              >
                Cheddar 열기
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item icon={LogOut} onClick={onSignOut}>
                로그아웃
              </Menu.Item>
            </Menu.Popup>
          </Menu.Root>
        </header>
      )}
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
