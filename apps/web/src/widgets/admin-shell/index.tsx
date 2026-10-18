import { NavTab, NavTabs } from "@cheddar/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import { Building2, Shield, Users } from "lucide-react";
import type { ReactNode } from "react";
import { currentAccountQuery } from "@/entities/account";
import { can } from "@/entities/permission";

/** 관리 화면의 제목과 탭. 권한이 있는 탭만 보인다. */
export function AdminShell({ children }: { children: ReactNode }) {
  const { data: account } = useSuspenseQuery(currentAccountQuery());
  const matchRoute = useMatchRoute();
  const tabs = [
    {
      to: "/admin/accounts",
      label: "계정",
      icon: Users,
      allowed: can(account.permissions, "account.manage"),
    },
    {
      to: "/admin/roles",
      label: "역할",
      icon: Shield,
      allowed: can(account.permissions, "role.manage"),
    },
    {
      to: "/admin/affiliations",
      label: "소속",
      icon: Building2,
      allowed: can(account.permissions, "role.manage"),
    },
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-col gap-3">
        <h1 className="m-0 text-title-lg text-fg">관리</h1>
        <NavTabs aria-label="관리">
          {tabs
            .filter((tab) => tab.allowed)
            .map((tab) => (
              <NavTab
                key={tab.to}
                icon={tab.icon}
                render={<Link to={tab.to} />}
                active={Boolean(matchRoute({ to: tab.to, fuzzy: true }))}
              >
                {tab.label}
              </NavTab>
            ))}
        </NavTabs>
      </div>
      {children}
    </main>
  );
}
