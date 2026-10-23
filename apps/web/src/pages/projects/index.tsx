import { Button, EmptyState, LoadError } from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FolderKanban, Plus } from "lucide-react";
import { useState } from "react";
import { projectsQuery } from "@/entities/project";
import { CreateProjectDialog } from "@/features/create-project";

export function ProjectsPage() {
  const navigate = useNavigate();
  const projects = useQuery(projectsQuery());
  const [creating, setCreating] = useState(false);
  const create = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      프로젝트 만들기
    </Button>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-title-lg text-fg">프로젝트</h1>
        {projects.data && projects.data.length > 0 && create}
      </div>
      {projects.isError ? (
        <LoadError
          title="프로젝트를 불러오지 못했습니다"
          onRetry={() => projects.refetch()}
        />
      ) : projects.data?.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="프로젝트가 없습니다"
          actions={create || undefined}
        />
      ) : (
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {projects.data?.map((p) => (
            <li key={p.id}>
              <Link
                to="/projects/$projectId/template"
                params={{ projectId: p.id }}
                className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface p-5 text-fg no-underline transition-colors duration-fast hover:border-line-strong focus-visible:border-accent"
              >
                <span className="flex flex-1 flex-col gap-1">
                  <span className="font-semibold text-body">{p.name}</span>
                  <span className="text-body-sm text-fg-muted">
                    {p.description}
                  </span>
                </span>
                <span className="flex flex-wrap gap-4 border-line border-t pt-3 text-caption text-fg-muted tabular-nums">
                  <span>양식 항목 {p.columnCount}</span>
                  <span>화면 {p.screenCount}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateProjectDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(projectId) => {
          setCreating(false);
          void navigate({
            to: "/projects/$projectId/template",
            params: { projectId },
          });
        }}
      />
    </main>
  );
}
