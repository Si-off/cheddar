import { Breadcrumb, BreadcrumbItem } from "@cheddar/ui";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { currentAccountQuery } from "@/entities/account";
import { CreateTestSetForm } from "@/features/create-test-set";

export function TestSetNewPage({ uploadId }: { uploadId?: string }) {
  const navigate = useNavigate();
  const { data: account } = useSuspenseQuery(currentAccountQuery());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-8 pb-12">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbItem render={<Link to="/test-sets" />}>
            테스트 세트
          </BreadcrumbItem>
          <BreadcrumbItem current>새 테스트 세트</BreadcrumbItem>
        </Breadcrumb>
        <h1 className="m-0 text-title text-fg">새 테스트 세트</h1>
      </div>
      <CreateTestSetForm
        permissions={account.permissions}
        uploadId={uploadId}
        onCreated={(testSetId, generating, confirmStart) =>
          generating
            ? navigate({
                to: "/test-sets/$testSetId/generating",
                params: { testSetId },
                search: { confirm: confirmStart },
              })
            : navigate({ to: "/test-sets/$testSetId", params: { testSetId } })
        }
      />
    </main>
  );
}
