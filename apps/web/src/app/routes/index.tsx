import {
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
  WorkspaceIcon,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useParams,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ProjectSettingsPage } from "@/pages/project-settings";
import {
  ProjectUploadDetailPage,
  ProjectUploadsPage,
  type UploadSheetGateway,
} from "@/pages/project-uploads";
import { SharedTestCasesPage } from "@/pages/shared-test-cases";
import { TestCaseEditorPage } from "@/pages/test-case-editor";
import { createSheet, getProject, listSheets } from "@/shared/api/generated";

function RootLayout() {
  const { projectId, sheetId, shareId } = useParams({ strict: false });
  const [menuOpen, setMenuOpen] = useState(false);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: async () =>
      (
        await getProject({
          path: { projectId: projectId as string },
          throwOnError: true,
        })
      ).data,
    enabled: !!projectId,
  });
  return (
    <div className="workspace-root">
      <header className="workspace-header">
        <Link to="/" aria-label="프로젝트 목록" className="workspace-home">
          <WorkspaceIcon name="projects" />
        </Link>
        {projectId && (
          <>
            <WorkspaceIcon name="chevron" />
            <Link
              to="/projects/$projectId/sheets"
              params={{ projectId }}
              onClick={() => setMenuOpen(false)}
            >
              {project.data?.name ?? "프로젝트"}
            </Link>
          </>
        )}
        {sheetId && (
          <>
            <WorkspaceIcon name="chevron" />
            <span className="workspace-crumb">테스트 시트</span>
          </>
        )}
        {shareId && <span className="workspace-crumb">공유 시트</span>}
        {projectId && (
          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="workspace-header-menu"
                  aria-label="프로젝트 메뉴"
                />
              }
            >
              <WorkspaceIcon name="more" />
            </PopoverTrigger>
            <PopoverContent aria-label="프로젝트 메뉴">
              <nav className="workspace-nav">
                <Link
                  to="/projects/$projectId/sheets"
                  params={{ projectId }}
                  onClick={() => setMenuOpen(false)}
                >
                  <WorkspaceIcon name="file" />
                  테스트 시트
                </Link>
                <Link
                  to="/projects/$projectId/uploads"
                  params={{ projectId }}
                  onClick={() => setMenuOpen(false)}
                >
                  <WorkspaceIcon name="image" />
                  화면 자료
                </Link>
                <Link to="/projects/$projectId/settings" params={{ projectId }}>
                  <WorkspaceIcon name="settings" />
                  프로젝트 설정
                </Link>
              </nav>
            </PopoverContent>
          </Popover>
        )}
      </header>
      <main className={sheetId ? "workspace-main is-editor" : "workspace-main"}>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: function HomeRoute() {
    const navigate = editorRoute.useNavigate();
    return (
      <TestCaseEditorPage
        onOpenProject={(projectId) =>
          void navigate({
            to: "/projects/$projectId/sheets",
            params: { projectId },
          })
        }
        onOpenSheet={(params) =>
          void navigate({ to: "/projects/$projectId/sheets/$sheetId", params })
        }
      />
    );
  },
});
const uploadsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/uploads",
  component: function UploadsRoute() {
    const { projectId } = uploadsRoute.useParams();
    const navigate = uploadsRoute.useNavigate();
    return (
      <ProjectUploadsPage
        projectId={projectId}
        onOpenUpload={(uploadId) =>
          void navigate({
            to: "/projects/$projectId/uploads/$uploadId",
            params: { projectId, uploadId },
          })
        }
      />
    );
  },
});
const uploadDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/uploads/$uploadId",
  component: function UploadDetailRoute() {
    const { projectId, uploadId } = uploadDetailRoute.useParams();
    const navigate = uploadDetailRoute.useNavigate();
    const sheetGateway = useMemo<UploadSheetGateway>(
      () => ({
        list: async (cursor) =>
          (
            await listSheets({
              path: { projectId },
              query: { uploadId, cursor, limit: 50 },
              signal: AbortSignal.timeout(30000),
              throwOnError: true,
            })
          ).data,
        create: async (input) =>
          (
            await createSheet({
              path: { projectId },
              body: { ...input, uploadId },
              signal: AbortSignal.timeout(30000),
              throwOnError: true,
            })
          ).data,
      }),
      [projectId, uploadId],
    );
    return (
      <ProjectUploadDetailPage
        key={`${projectId}/${uploadId}`}
        projectId={projectId}
        uploadId={uploadId}
        onBack={() =>
          void navigate({
            to: "/projects/$projectId/uploads",
            params: { projectId },
          })
        }
        sheetGateway={sheetGateway}
        onOpenSheet={(sheetId) =>
          void navigate({
            to: "/projects/$projectId/sheets/$sheetId",
            params: { projectId, sheetId },
          })
        }
      />
    );
  },
});
const sheetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/sheets",
  component: function SheetsRoute() {
    const { projectId } = sheetsRoute.useParams();
    const navigate = sheetsRoute.useNavigate();
    return (
      <TestCaseEditorPage
        key={projectId}
        projectId={projectId}
        onOpenSheet={(params) =>
          void navigate({ to: "/projects/$projectId/sheets/$sheetId", params })
        }
      />
    );
  },
});
const sheetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/sheets/$sheetId",
  component: function SheetRoute() {
    const { projectId, sheetId } = sheetRoute.useParams();
    const navigate = sheetRoute.useNavigate();
    return (
      <TestCaseEditorPage
        key={`${projectId}/${sheetId}`}
        projectId={projectId}
        sheetId={sheetId}
        onOpenSheet={(params) =>
          void navigate({ to: "/projects/$projectId/sheets/$sheetId", params })
        }
        onBack={() =>
          void navigate({
            to: "/projects/$projectId/sheets",
            params: { projectId },
          })
        }
      />
    );
  },
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/settings",
  component: function SettingsRoute() {
    const { projectId } = settingsRoute.useParams();
    return <ProjectSettingsPage key={projectId} projectId={projectId} />;
  },
});
const sharedRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/share/$shareId",
  component: SharedTestCasesPage,
});

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    editorRoute,
    uploadsRoute,
    uploadDetailRoute,
    settingsRoute,
    sheetsRoute,
    sheetRoute,
    sharedRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
