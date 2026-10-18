import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import { useQuery } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useRouterState,
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
  const { projectId, testScenarioId, shareId } = useRouterState({
    select: (state) =>
      (state.matches.at(-1)?.params ?? {}) as {
        projectId?: string;
        testScenarioId?: string;
        shareId?: string;
      },
  });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
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
  const navigation = (
    <nav className="workspace-nav" aria-label="프로젝트 탐색">
      <Link
        to="/"
        activeOptions={{ exact: true }}
        onClick={() => setMobileOpen(false)}
        aria-label="프로젝트 목록"
      >
        <WorkspaceIcon name="projects" />
        <span>프로젝트 목록</span>
      </Link>
      {projectId && (
        <>
          <div className="workspace-project-name">
            {project.data?.name ?? "프로젝트"}
          </div>
          <Link
            to="/projects/$projectId/test-scenarios"
            params={{ projectId }}
            onClick={() => setMobileOpen(false)}
            aria-label="테스트 시나리오"
          >
            <WorkspaceIcon name="file" />
            <span>테스트 시나리오</span>
          </Link>
          <Link
            to="/projects/$projectId/uploads"
            params={{ projectId }}
            onClick={() => setMobileOpen(false)}
            aria-label="Figma 자료"
          >
            <WorkspaceIcon name="image" />
            <span>Figma 자료</span>
          </Link>
          <Link
            to="/projects/$projectId/settings"
            params={{ projectId }}
            onClick={() => setMobileOpen(false)}
            aria-label="프로젝트 설정"
          >
            <WorkspaceIcon name="settings" />
            <span>프로젝트 설정</span>
          </Link>
        </>
      )}
    </nav>
  );
  return (
    <div className={`workspace-root${collapsed ? " is-nav-collapsed" : ""}`}>
      <aside className="workspace-sidebar" aria-label="주 메뉴">
        <Link
          to="/"
          className="workspace-brand"
          aria-label="Cheddar 프로젝트 목록"
        >
          <span className="workspace-brand-mark">C</span>
          <span>Cheddar</span>
        </Link>
        {navigation}
        <Button
          variant="ghost"
          className="workspace-sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "메뉴 펼치기" : "메뉴 접기"}
          aria-expanded={!collapsed}
        >
          <WorkspaceIcon name={collapsed ? "arrow" : "back"} />
          <span>{collapsed ? "메뉴 펼치기" : "메뉴 접기"}</span>
        </Button>
      </aside>
      <header className="workspace-header">
        <Button
          variant="ghost"
          size="icon"
          className="workspace-mobile-menu"
          aria-label="프로젝트 메뉴"
          onClick={() => setMobileOpen(true)}
        >
          <WorkspaceIcon name="projects" />
        </Button>
        <Link to="/" className="workspace-breadcrumb">
          프로젝트
        </Link>
        {projectId && (
          <>
            <WorkspaceIcon name="chevron" />
            <Link
              to="/projects/$projectId/test-scenarios"
              params={{ projectId }}
              className="workspace-breadcrumb"
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
        {shareId && <span className="workspace-crumb">시나리오 미리보기</span>}
      </header>
      <main
        className={
          testScenarioId ? "workspace-main is-editor" : "workspace-main"
        }
      >
        <Outlet />
      </main>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          className="workspace-mobile-nav"
          aria-describedby={undefined}
        >
          <DialogTitle>프로젝트 메뉴</DialogTitle>
          {navigation}
        </DialogContent>
      </Dialog>
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
