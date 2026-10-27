import { Button, EmptyState } from "@cheddar/ui";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Link,
  Outlet,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { CircleAlert, FileQuestion } from "lucide-react";
import { Suspense } from "react";
import { currentAccountQuery, isAdmin } from "@/entities/account";
import { AdminAccountPage } from "@/pages/admin-account";
import { AdminAccountsPage } from "@/pages/admin-accounts";
import { FigmaTokenGuidePage } from "@/pages/figma-token-guide";
import { LoginPage } from "@/pages/login";
import { NoAccessPage } from "@/pages/no-access";
import { PluginConnectPage } from "@/pages/plugin-connect";
import {
  ProjectFeatureGroupsPage,
  ProjectMemoPage,
  ProjectScreensPage,
  ProjectTemplatePage,
} from "@/pages/project-settings";
import { ProjectsPage } from "@/pages/projects";
import { SharedTestSetPage } from "@/pages/shared-test-set";
import { TestSetPage } from "@/pages/test-set";
import { TestSetGeneratingPage } from "@/pages/test-set-generating";
import { TestSetNewPage } from "@/pages/test-set-new";
import { TestSetsPage } from "@/pages/test-sets";
import { isApiFailure } from "@/shared/api";
import { AdminShell } from "@/widgets/admin-shell";
import { AppHeader } from "@/widgets/app-header";

interface RouterContext {
  queryClient: QueryClient;
}

function RouteError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <main className="flex justify-center px-6 pt-40">
      <EmptyState
        icon={CircleAlert}
        title="화면을 불러오지 못했습니다"
        actions={
          <Button
            onClick={() => {
              reset();
              void router.invalidate();
            }}
          >
            다시 시도
          </Button>
        }
      />
    </main>
  );
}

function NotFound() {
  return (
    <main className="flex justify-center px-6 pt-40">
      <EmptyState
        icon={FileQuestion}
        title="없는 화면입니다"
        actions={
          <Button render={<Link to="/test-sets" />} nativeButton={false}>
            테스트 세트 목록
          </Button>
        }
      />
    </main>
  );
}

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: Outlet,
  errorComponent: RouteError,
  notFoundComponent: NotFound,
});

/** 로그인 후 돌아갈 주소는 같은 출처의 경로만 받는다(//다른사이트 같은 값을 막는다). */
function sameOriginPath(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return undefined;
    return url.pathname + url.search + url.hash;
  } catch {
    return undefined;
  }
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; loginId?: string } => ({
    redirect: sameOriginPath(search.redirect),
    loginId: typeof search.loginId === "string" ? search.loginId : undefined,
  }),
  component: function LoginRoute() {
    const search = loginRoute.useSearch();
    const navigate = useNavigate();
    return (
      <LoginPage
        defaultLoginId={search.loginId}
        onLoggedIn={() =>
          search.redirect
            ? navigate({ href: search.redirect })
            : navigate({ to: "/test-sets" })
        }
      />
    );
  },
});

/** 공개 링크. 로그인하지 않은 방문자도 연다 */
const sharedTestSetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/s/$linkToken",
  component: function SharedTestSetRoute() {
    const { linkToken } = sharedTestSetRoute.useParams();
    return <SharedTestSetPage key={linkToken} linkToken={linkToken} />;
  },
});

/** 로그인한 사람만 들어오는 영역. 세션이 없으면 로그인으로 보낸다. */
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "app",
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.query(currentAccountQuery());
    } catch (error) {
      if (isApiFailure(error, "UNAUTHENTICATED")) {
        throw redirect({ to: "/login", search: { redirect: location.href } });
      }
      throw error;
    }
  },
  component: function AppLayout() {
    return (
      <div className="flex min-h-dvh flex-col bg-canvas">
        <AppHeader />
        <Suspense>
          <Outlet />
        </Suspense>
      </div>
    );
  },
});

async function requireAdmin({ context }: { context: RouterContext }) {
  const account = await context.queryClient.query(currentAccountQuery());
  if (!isAdmin(account)) throw redirect({ to: "/no-access" });
}

const homeRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/test-sets" });
  },
});

const testSetsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/test-sets",
  component: TestSetsPage,
});

/** Figma 플러그인이 올린 프레임 묶음을 주소로 넘긴다 */
const uploadSearch = (
  search: Record<string, unknown>,
): { upload?: string } => ({
  upload:
    typeof search.upload === "string" && /^[0-9a-f-]{36}$/i.test(search.upload)
      ? search.upload
      : undefined,
});

/** 플러그인이 고른 프로젝트도 함께 받는다 */
const newTestSetSearch = (
  search: Record<string, unknown>,
): { upload?: string; project?: string } => ({
  ...uploadSearch(search),
  project:
    typeof search.project === "string" &&
    /^[0-9a-f-]{36}$/i.test(search.project)
      ? search.project
      : undefined,
});

const testSetNewRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/test-sets/new",
  validateSearch: newTestSetSearch,
  component: function TestSetNewRoute() {
    const { upload, project } = testSetNewRoute.useSearch();
    return <TestSetNewPage uploadId={upload} projectId={project} />;
  },
});

const testSetRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/test-sets/$testSetId",
  validateSearch: uploadSearch,
  component: function TestSetRoute() {
    const { testSetId } = testSetRoute.useParams();
    const { upload } = testSetRoute.useSearch();
    return (
      <TestSetPage key={testSetId} testSetId={testSetId} uploadId={upload} />
    );
  },
});

const testSetGeneratingRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/test-sets/$testSetId/generating",
  validateSearch: (search: Record<string, unknown>): { confirm?: boolean } => ({
    confirm: search.confirm === true || search.confirm === "true" || undefined,
  }),
  component: function TestSetGeneratingRoute() {
    const { testSetId } = testSetGeneratingRoute.useParams();
    const { confirm } = testSetGeneratingRoute.useSearch();
    return (
      <TestSetGeneratingPage
        key={testSetId}
        testSetId={testSetId}
        confirmStart={confirm === true}
      />
    );
  },
});

const projectsRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects",
  component: ProjectsPage,
});

const projectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/projects/$projectId",
});

const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/template", params });
  },
});

const projectTemplateRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/template",
  component: function ProjectTemplateRoute() {
    const { projectId } = projectRoute.useParams();
    return <ProjectTemplatePage projectId={projectId} />;
  },
});

const projectFeatureGroupsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/feature-groups",
  component: function ProjectFeatureGroupsRoute() {
    const { projectId } = projectRoute.useParams();
    return <ProjectFeatureGroupsPage projectId={projectId} />;
  },
});

const projectScreensRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/screens",
  component: function ProjectScreensRoute() {
    const { projectId } = projectRoute.useParams();
    return <ProjectScreensPage projectId={projectId} />;
  },
});

const projectMemoRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: "/memo",
  component: function ProjectMemoRoute() {
    const { projectId } = projectRoute.useParams();
    return <ProjectMemoPage projectId={projectId} />;
  },
});

/** Figma 플러그인이 연 연결 확인. 로그인하지 않았으면 로그인 뒤 돌아온다 */
const pluginConnectRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/plugin-connect",
  validateSearch: (search: Record<string, unknown>): { request?: string } => ({
    request:
      typeof search.request === "string" &&
      /^[A-Za-z0-9_-]{43}$/.test(search.request)
        ? search.request
        : undefined,
  }),
  component: function PluginConnectRoute() {
    const { request } = pluginConnectRoute.useSearch();
    return <PluginConnectPage requestToken={request} />;
  },
});

const figmaTokenGuideRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/guides/figma-token",
  component: FigmaTokenGuidePage,
});

const noAccessRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/no-access",
  component: () => <NoAccessPage backLink={<Link to="/test-sets" />} />,
});

const adminRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/admin",
  beforeLoad: requireAdmin,
  component: () => (
    <AdminShell>
      <Outlet />
    </AdminShell>
  ),
});

const adminIndexRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/admin/accounts" });
  },
});

const adminAccountsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/accounts",
  component: AdminAccountsPage,
});

const adminAccountRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: "/accounts/$accountId",
  component: function AdminAccountRoute() {
    const { accountId } = adminAccountRoute.useParams();
    return <AdminAccountPage accountId={accountId} />;
  },
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  sharedTestSetRoute,
  appRoute.addChildren([
    homeRoute,
    testSetsRoute,
    testSetNewRoute,
    testSetRoute,
    testSetGeneratingRoute,
    projectsRoute,
    projectRoute.addChildren([
      projectIndexRoute,
      projectTemplateRoute,
      projectFeatureGroupsRoute,
      projectScreensRoute,
      projectMemoRoute,
    ]),
    pluginConnectRoute,
    figmaTokenGuideRoute,
    noAccessRoute,
    adminRoute.addChildren([
      adminIndexRoute,
      adminAccountsRoute,
      adminAccountRoute,
    ]),
  ]),
]);

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: "intent",
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
