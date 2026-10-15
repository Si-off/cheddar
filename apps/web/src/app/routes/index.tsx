import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useParams,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { ProjectSettingsPage } from "@/pages/project-settings";
import {
  ProjectUploadDetailPage,
  ProjectUploadsPage,
  type UploadSheetGateway,
} from "@/pages/project-uploads";
import { SharedTestCasesPage } from "@/pages/shared-test-cases";
import { TestCaseEditorPage } from "@/pages/test-case-editor";
import { createSheet, listSheets } from "@/shared/api/generated";

function RootLayout() {
  const { projectId, sheetId } = useParams({ strict: false });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-6 border-b border-border bg-surface px-page py-4">
        <Link to="/" className="text-brand font-heading">
          Cheddar
        </Link>
        {projectId && (
          <nav
            aria-label="프로젝트 메뉴"
            className="flex flex-wrap items-center gap-4"
          >
            <Link
              to="/projects/$projectId/sheets"
              params={{ projectId }}
              activeProps={{ "aria-current": "page" }}
            >
              테스트 시트
            </Link>
            <Link
              to="/projects/$projectId/uploads"
              params={{ projectId }}
              activeProps={{ "aria-current": "page" }}
            >
              업로드
            </Link>
            <Link
              to="/projects/$projectId/settings"
              params={{ projectId }}
              activeProps={{ "aria-current": "page" }}
            >
              프로젝트 설정
            </Link>
          </nav>
        )}
      </header>
      <main className={sheetId ? "p-page" : "mx-auto max-w-content p-page"}>
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
