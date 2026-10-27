import { Link, useMatchRoute } from "@tanstack/react-router";
import { IconButton, Menu, NavTab, NavTabs } from "@workspace/ui";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Project } from "@/entities/project";
import { EditProjectDialog } from "@/features/edit-project";

/** 경로 타입을 지키려고 탭마다 링크를 따로 만든다 */
function tabsFor(projectId: string) {
  const params = { projectId };
  return [
    {
      label: "양식",
      to: "/projects/$projectId/template",
      link: <Link to="/projects/$projectId/template" params={params} />,
    },
    {
      label: "기능 그룹",
      to: "/projects/$projectId/feature-groups",
      link: <Link to="/projects/$projectId/feature-groups" params={params} />,
    },
    {
      label: "화면 구조",
      to: "/projects/$projectId/screens",
      link: <Link to="/projects/$projectId/screens" params={params} />,
    },
    {
      label: "메모",
      to: "/projects/$projectId/memo",
      link: <Link to="/projects/$projectId/memo" params={params} />,
    },
  ] as const;
}

export interface ProjectShellProps {
  project: Project;
  /** 제목 줄 오른쪽(예: 저장 상태와 저장 버튼) */
  actions?: ReactNode;
  children: ReactNode;
}

/** 프로젝트 설정 화면의 위치, 제목, 설정 탭 */
export function ProjectShell({
  project,
  actions,
  children,
}: ProjectShellProps) {
  const matchRoute = useMatchRoute();
  const [editing, setEditing] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-8 pt-6 pb-12">
      <div className="flex flex-col gap-2">
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <h1 className="m-0 min-w-60 flex-1 text-title text-fg">
            {project.name}
          </h1>
          {actions}
          {project.canManage && (
            <Menu.Root>
              <Menu.Trigger
                render={
                  <IconButton
                    icon={MoreHorizontal}
                    label="프로젝트 작업"
                    variant="solid"
                  />
                }
              />
              <Menu.Popup align="end">
                <Menu.Item onClick={() => setEditing(true)}>
                  프로젝트 정보
                </Menu.Item>
              </Menu.Popup>
            </Menu.Root>
          )}
        </div>
      </div>
      <NavTabs aria-label="프로젝트 설정">
        {tabsFor(project.id).map((tab) => (
          <NavTab
            key={tab.to}
            render={tab.link}
            active={Boolean(matchRoute({ to: tab.to }))}
          >
            {tab.label}
          </NavTab>
        ))}
      </NavTabs>
      {children}
      <EditProjectDialog
        project={project}
        open={editing}
        onOpenChange={setEditing}
      />
    </main>
  );
}
