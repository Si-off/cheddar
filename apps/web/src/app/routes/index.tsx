import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from "@tanstack/react-router";
import {
  ProjectUploadDetailPage,
  ProjectUploadsPage,
} from "@/pages/project-uploads";
import { SharedTestCasesPage } from "@/pages/shared-test-cases";
import { TestCaseEditorPage } from "@/pages/test-case-editor";

function RootLayout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface px-page py-4">
        <Link to="/" className="text-brand font-heading">
          Cheddar
        </Link>
      </header>
      <main className="mx-auto max-w-content p-page">
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });
const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: TestCaseEditorPage,
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
        // The sheet gateway and editor route will be connected together after 2B.
        onOpenSheet={(sheetId) =>
          void navigate({
            href: `/projects/${encodeURIComponent(projectId)}/sheets/${encodeURIComponent(sheetId)}`,
          })
        }
      />
    );
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
    sharedRoute,
  ]),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
