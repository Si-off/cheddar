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
  type UploadTestScenarioGateway,
} from "@/pages/project-uploads";
import { SharedTestCasesPage } from "@/pages/shared-test-cases";
import { TestCaseEditorPage } from "@/pages/test-case-editor";
import {
  createTestScenario,
  getProject,
  listTestScenarios,
} from "@/shared/api/generated";

function RootLayout() {
  const { projectId, testScenarioId, shareId } = useParams({ strict: false });
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
              to="/projects/$projectId/test-scenarios"
              params={{ projectId }}
              onClick={() => setMenuOpen(false)}
            >
              {project.data?.name ?? "프로젝트"}
            </Link>
          </>
        )}
        {testScenarioId && (
          <>
            <WorkspaceIcon name="chevron" />
            <span className="workspace-crumb">테스트 시나리오</span>
          </>
        )}
        {shareId && <span className="workspace-crumb">공유 시나리오</span>}
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
                  to="/projects/$projectId/test-scenarios"
                  params={{ projectId }}
                  onClick={() => setMenuOpen(false)}
                >
                  <WorkspaceIcon name="file" />
                  테스트 시나리오
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
      <main
        className={
          testScenarioId ? "workspace-main is-editor" : "workspace-main"
        }
      >
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
            to: "/projects/$projectId/test-scenarios",
            params: { projectId },
          })
        }
        onOpenTestScenario={(params) =>
          void navigate({
            to: "/projects/$projectId/test-scenarios/$testScenarioId",
            params,
          })
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
    const testScenarioGateway = useMemo<UploadTestScenarioGateway>(
      () => ({
        list: async (cursor) =>
          (
            await listTestScenarios({
              path: { projectId },
              query: { uploadId, cursor, limit: 50 },
              signal: AbortSignal.timeout(30000),
              throwOnError: true,
            })
          ).data,
        create: async (input) =>
          (
            await createTestScenario({
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
        testScenarioGateway={testScenarioGateway}
        onOpenTestScenario={(testScenarioId) =>
          void navigate({
            to: "/projects/$projectId/test-scenarios/$testScenarioId",
            params: { projectId, testScenarioId },
          })
        }
      />
    );
  },
});
const testScenariosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/test-scenarios",
  component: function TestScenariosRoute() {
    const { projectId } = testScenariosRoute.useParams();
    const navigate = testScenariosRoute.useNavigate();
    return (
      <TestCaseEditorPage
        key={projectId}
        projectId={projectId}
        onOpenTestScenario={(params) =>
          void navigate({
            to: "/projects/$projectId/test-scenarios/$testScenarioId",
            params,
          })
        }
      />
    );
  },
});
const testScenarioRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/test-scenarios/$testScenarioId",
  component: function TestScenarioRoute() {
    const { projectId, testScenarioId } = testScenarioRoute.useParams();
    const navigate = testScenarioRoute.useNavigate();
    return (
      <TestCaseEditorPage
        key={`${projectId}/${testScenarioId}`}
        projectId={projectId}
        testScenarioId={testScenarioId}
        onOpenTestScenario={(params) =>
          void navigate({
            to: "/projects/$projectId/test-scenarios/$testScenarioId",
            params,
          })
        }
        onBack={() =>
          void navigate({
            to: "/projects/$projectId/test-scenarios",
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
    testScenariosRoute,
    testScenarioRoute,
    sharedRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
