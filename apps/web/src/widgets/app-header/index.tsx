import { Icon, Menu, NavTab, NavTabs } from "@cheddar/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useMatchRoute, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Frame, KeyRound, LogOut, Shield } from "lucide-react";
import { useState } from "react";
import {
  accountRoleLabel,
  currentAccountQuery,
  isAdmin,
} from "@/entities/account";
import { ChangePasswordDialog, useLogout } from "@/features/auth";
import { FigmaTokenDialog } from "@/features/figma-token";

/** 상단 바: 주요 메뉴와 계정 메뉴. 관리 진입은 관리자에게만 보인다. */
export function AppHeader() {
  const { data: account } = useSuspenseQuery(currentAccountQuery());
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const logout = useLogout(() => navigate({ to: "/login" }));
  const canManage = isAdmin(account);
  const [changingPassword, setChangingPassword] = useState(false);
  const [figmaToken, setFigmaToken] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-line bg-surface px-6">
      <NavTabs variant="pill" aria-label="주요 메뉴">
        <NavTab
          render={<Link to="/test-sets" />}
          active={Boolean(matchRoute({ to: "/test-sets", fuzzy: true }))}
        >
          테스트 세트
        </NavTab>
        <NavTab
          render={<Link to="/projects" />}
          active={Boolean(matchRoute({ to: "/projects", fuzzy: true }))}
        >
          프로젝트
        </NavTab>
      </NavTabs>
      <span className="flex-1" />
      <Menu.Root>
        <Menu.Trigger
          aria-label="계정 메뉴"
          className="inline-flex h-9 items-center gap-2 rounded-md pr-2 pl-1 text-label text-fg transition-colors duration-fast hover:bg-subtle data-popup-open:bg-subtle"
        >
          <span
            aria-hidden
            className="grid size-7 place-items-center rounded-full bg-accent text-caption font-semibold text-on-accent"
          >
            {account.name.slice(0, 1)}
          </span>
          <span>{account.name}</span>
          <Icon icon={ChevronDown} size="sm" className="text-fg-muted" />
        </Menu.Trigger>
        <Menu.Popup align="end" className="w-64">
          <div className="flex flex-col gap-0.5 px-2 py-2">
            <span className="text-title-sm text-fg">{account.name}</span>
            <span className="text-caption text-fg-muted">
              {account.loginId}, {accountRoleLabel[account.role]}
            </span>
          </div>
          <Menu.Separator />
          {canManage && (
            <Menu.Item icon={Shield} onClick={() => navigate({ to: "/admin" })}>
              관리
            </Menu.Item>
          )}
          <Menu.Item icon={KeyRound} onClick={() => setChangingPassword(true)}>
            비밀번호 바꾸기
          </Menu.Item>
          <Menu.Item icon={Frame} onClick={() => setFigmaToken(true)}>
            Figma 토큰
          </Menu.Item>
          <Menu.Separator />
          <Menu.Item icon={LogOut} onClick={() => logout.mutate()}>
            로그아웃
          </Menu.Item>
        </Menu.Popup>
      </Menu.Root>
      <ChangePasswordDialog
        open={changingPassword}
        onOpenChange={setChangingPassword}
      />
      <FigmaTokenDialog open={figmaToken} onOpenChange={setFigmaToken} />
    </header>
  );
}
