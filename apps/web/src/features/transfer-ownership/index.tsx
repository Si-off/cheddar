import {
  Button,
  Dialog,
  LoadError,
  Tag,
  TextField,
  useToast,
} from "@cheddar/ui";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { accountsQuery } from "@/entities/account";
import { sdk, toApiFailure } from "@/shared/api";

type OwnedSet = { id: string; name: string; projectName: string };

const ownedQuery = (accountId: string) =>
  queryOptions({
    queryKey: ["owned-test-sets", accountId],
    queryFn: async () =>
      (
        await sdk.listOwnedTestSets({
          path: { accountId },
          throwOnError: true,
        })
      ).data.items,
  });

/**
 * 계정이 소유한 테스트 세트. 비활성 계정이면 세트마다 다른 활성 계정에게 소유자를 넘긴다.
 */
export function OwnedTestSets({
  accountId,
  canTransfer,
}: {
  accountId: string;
  /** 비활성 계정일 때만 넘길 수 있다 */
  canTransfer: boolean;
}) {
  const owned = useQuery(ownedQuery(accountId));
  const [target, setTarget] = useState<OwnedSet | null>(null);
  if (owned.isError)
    return (
      <LoadError
        compact
        title="소유 테스트 세트를 불러오지 못했습니다"
        onRetry={() => owned.refetch()}
      />
    );
  if (!owned.data?.length) return null;
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-5">
      <h3 className="m-0 text-title-sm">소유 테스트 세트</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {owned.data.map((set) => (
          <li key={set.id} className="flex items-center gap-3">
            {/* 관리자가 이 세트를 볼 권한은 없을 수 있어 링크로 두지 않는다 */}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-fg">{set.name}</span>
              <span className="truncate text-caption text-fg-muted">
                {set.projectName}
              </span>
            </span>
            {canTransfer && (
              <Button size="sm" onClick={() => setTarget(set)}>
                소유자 넘기기
              </Button>
            )}
          </li>
        ))}
      </ul>
      <TransferDialog
        accountId={accountId}
        testSet={target}
        onClose={() => setTarget(null)}
      />
    </section>
  );
}

function TransferDialog({
  accountId,
  testSet,
  onClose,
}: {
  accountId: string;
  testSet: OwnedSet | null;
  onClose: () => void;
}) {
  return (
    <Dialog.Root open={testSet !== null} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Content size="sm">
        {testSet && (
          <TransferForm
            accountId={accountId}
            testSet={testSet}
            onDone={onClose}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function TransferForm({
  accountId,
  testSet,
  onDone,
}: {
  accountId: string;
  testSet: OwnedSet;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const query = useDeferredValue(search.trim());
  const candidates = useQuery({
    ...accountsQuery({ status: "active", search: query }),
    enabled: query.length > 0 && !picked,
  });
  const transfer = useMutation({
    mutationFn: (newOwnerId: string) =>
      sdk.transferTestSetOwner({
        path: { accountId, testSetId: testSet.id },
        body: { accountId: newOwnerId },
        throwOnError: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ownedQuery(accountId).queryKey,
      });
      toast.show({ message: "소유자를 넘겼습니다", tone: "success" });
      onDone();
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 목록을 새로 고쳐 넘어갔는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  const others = (candidates.data?.items ?? []).filter(
    (a) => a.id !== accountId,
  );
  return (
    <>
      <Dialog.Header title="소유자 넘기기" />
      <Dialog.Body className="gap-3">
        <p className="m-0 flex flex-col text-body-sm">
          <span className="font-medium">{testSet.name}</span>
          <span className="text-caption text-fg-muted">
            {testSet.projectName}
          </span>
        </p>
        <TextField
          icon={Search}
          label="새 소유자"
          placeholder="이름 또는 이메일"
          value={picked ? picked.name : search}
          onChange={(e) => {
            setPicked(null);
            setSearch(e.target.value);
          }}
        />
        {!picked && query && candidates.isError && (
          <LoadError
            compact
            title="계정을 불러오지 못했습니다"
            onRetry={() => candidates.refetch()}
          />
        )}
        {!picked && query && candidates.data && (
          <ul
            aria-label="찾은 계정"
            className="m-0 flex list-none flex-col rounded-md border border-line p-1"
          >
            {others.length === 0 ? (
              <li className="px-2 py-1.5 text-body-sm text-fg-muted">
                찾은 계정이 없습니다
              </li>
            ) : (
              others.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-subtle focus-visible:bg-subtle"
                    onClick={() => setPicked({ id: a.id, name: a.name })}
                  >
                    <span className="flex items-center gap-1.5 text-body-sm">
                      {a.name}
                      {a.affiliation && <Tag>{a.affiliation.name}</Tag>}
                    </span>
                    <span className="text-caption text-fg-muted">
                      {a.email}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          variant="primary"
          disabled={!picked}
          loading={transfer.isPending}
          onClick={() => picked && transfer.mutate(picked.id)}
        >
          넘기기
        </Button>
      </Dialog.Footer>
    </>
  );
}
