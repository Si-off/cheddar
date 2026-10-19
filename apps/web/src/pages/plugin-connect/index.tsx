import { Button, buttonVariants, EmptyState, LoadError } from "@cheddar/ui";
import { useMutation, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Frame, TimerOff } from "lucide-react";
import { currentAccountQuery } from "@/entities/account";
import { sdk, toApiFailure } from "@/shared/api";

/** Figma 플러그인이 연 브라우저에서 로그인한 계정으로 플러그인을 연결한다 */
export function PluginConnectPage({ requestToken }: { requestToken?: string }) {
  const { data: account } = useSuspenseQuery(currentAccountQuery());
  const request = useQuery({
    queryKey: ["plugin-connection", requestToken],
    enabled: Boolean(requestToken),
    queryFn: async () =>
      (
        await sdk.getPluginConnectionRequest({
          path: { requestToken: requestToken ?? "" },
          throwOnError: true,
        })
      ).data,
    retry: false,
    meta: { quietCodes: ["NOT_FOUND", "PLUGIN_CONNECTION_EXPIRED"] },
  });
  const approve = useMutation({
    mutationFn: () =>
      sdk.approvePluginConnection({
        path: { requestToken: requestToken ?? "" },
        throwOnError: true,
      }),
  });

  const approveCode = approve.isError ? toApiFailure(approve.error).code : null;
  // 이미 승인된 요청은 그 결과를 보여준다
  const status =
    approve.isSuccess || approveCode === "PLUGIN_CONNECTION_ALREADY_APPROVED"
      ? "approved"
      : request.data?.status;
  const expired =
    !requestToken ||
    status === "expired" ||
    approveCode === "PLUGIN_CONNECTION_EXPIRED" ||
    (request.isError &&
      ["NOT_FOUND", "PLUGIN_CONNECTION_EXPIRED"].includes(
        toApiFailure(request.error).code,
      ));

  return (
    <main className="flex justify-center px-4 pt-28 pb-12">
      <section className="flex w-full max-w-md flex-col gap-5 rounded-lg border border-line bg-surface p-8 shadow-raised">
        {expired ? (
          <EmptyState
            icon={TimerOff}
            title="연결 요청이 만료되었습니다"
            description="플러그인에서 다시 로그인하세요."
          />
        ) : request.isError ? (
          <LoadError
            title="연결 요청을 확인하지 못했습니다"
            onRetry={() => request.refetch()}
          />
        ) : status === "approved" ? (
          <EmptyState
            icon={Frame}
            title="플러그인을 연결했습니다"
            description="Figma로 돌아가세요."
          />
        ) : (
          <>
            <span className="grid size-10 place-items-center rounded-full bg-subtle text-fg-muted">
              <Frame aria-hidden size={20} />
            </span>
            <div className="flex flex-col gap-2">
              <h1 className="m-0 text-title-lg">Figma 플러그인 연결</h1>
              <p className="m-0 text-fg-muted">
                {account.name}({account.email}) 계정으로 플러그인에
                로그인합니다.
              </p>
            </div>
            {approve.isError && (
              <p className="m-0 text-body-sm text-danger" role="alert">
                {toApiFailure(approve.error).message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Link
                to="/test-sets"
                className={buttonVariants({ variant: "secondary" })}
              >
                취소
              </Link>
              <Button
                variant="primary"
                loading={approve.isPending}
                disabled={!request.data}
                onClick={() => approve.mutate()}
              >
                연결
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
