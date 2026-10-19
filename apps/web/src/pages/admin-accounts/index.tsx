import {
  Badge,
  Button,
  DataGrid,
  type DataGridColumn,
  EmptyState,
  LoadError,
  Select,
  TextField,
} from "@cheddar/ui";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Search, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  ACCOUNTS_PAGE_SIZE,
  type Account,
  type AccountStatus,
  accountStatusInfo,
  accountsQuery,
} from "@/entities/account";
import { affiliationsQuery } from "@/entities/affiliation";
import { type Role, rolesQuery } from "@/entities/role";
import {
  CreateAccountDialog,
  type IssuedLink,
  IssuedLinkDialog,
} from "@/features/manage-account";

const ALL = "";

function roleSummary(account: Account, roles: readonly Role[]) {
  return account.assignments
    .map((a) => {
      const name = roles.find((r) => r.id === a.roleId)?.name ?? "";
      return a.scope === "projects"
        ? `${name}(프로젝트 ${a.projectIds.length}개)`
        : name;
    })
    .filter(Boolean)
    .join(", ");
}

export function AdminAccountsPage() {
  const [search, setSearch] = useState("");
  const [roleId, setRoleId] = useState(ALL);
  const [affiliationId, setAffiliationId] = useState(ALL);
  const [status, setStatus] = useState<AccountStatus | typeof ALL>(ALL);
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const roles = useQuery(rolesQuery()).data ?? [];
  const affiliations = useQuery(affiliationsQuery()).data ?? [];
  // 페이지를 넘기는 동안 이전 목록을 그대로 보여준다
  const accounts = useQuery({
    ...accountsQuery(
      {
        search: deferredSearch || undefined,
        roleId: roleId || undefined,
        affiliationId: affiliationId || undefined,
        status: status || undefined,
      },
      page,
    ),
    placeholderData: keepPreviousData,
  });
  const total = accounts.data?.total ?? 0;
  // 범위 표시와 이동 버튼은 지금 보이는 목록의 페이지를 기준으로 한다
  const shownPage = accounts.data?.page ?? 0;
  const pageStart = shownPage * ACCOUNTS_PAGE_SIZE;
  const lastPage = Math.max(0, Math.ceil(total / ACCOUNTS_PAGE_SIZE) - 1);
  const moving = accounts.isPlaceholderData;
  // 계정이 줄어 보던 페이지가 범위를 벗어나면 마지막 페이지로 옮긴다
  if (accounts.data && !moving && page > lastPage) setPage(lastPage);
  // 조건이 바뀌면 첫 페이지부터 다시 본다
  const filterBy =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(0);
    };

  const columns: DataGridColumn<Account>[] = [
    {
      id: "name",
      header: "이름",
      width: 280,
      cell: (a) => (
        <span className="flex flex-col">
          <Link
            to="/admin/accounts/$accountId"
            params={{ accountId: a.id }}
            className="font-medium text-fg no-underline hover:text-accent-text hover:underline"
          >
            {a.name}
          </Link>
          <span className="text-caption text-fg-muted">{a.email}</span>
        </span>
      ),
    },
    {
      id: "affiliation",
      header: "소속",
      width: 120,
      cell: (a) => a.affiliation.name,
    },
    {
      id: "roles",
      header: "역할",
      width: 260,
      cell: (a) => roleSummary(a, roles),
    },
    {
      id: "status",
      header: "상태",
      width: 96,
      cell: (a) => (
        <Badge tone={accountStatusInfo[a.status].tone} dot>
          {accountStatusInfo[a.status].label}
        </Badge>
      ),
    },
    {
      id: "expires",
      header: "만료일",
      width: 120,
      mono: true,
      cell: (a) => a.expiresOn ?? "",
    },
  ];

  const filtering = Boolean(
    deferredSearch || roleId || affiliationId || status,
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TextField
          size="sm"
          icon={Search}
          placeholder="이름 또는 이메일"
          aria-label="계정 검색"
          className="w-60 max-w-full"
          value={search}
          onChange={(e) => filterBy(setSearch)(e.target.value)}
        />
        <Select
          size="sm"
          aria-label="역할"
          className="w-36"
          value={roleId}
          items={[
            { value: ALL, label: "모든 역할" },
            ...roles
              .filter((r) => !r.fixed)
              .map((r) => ({ value: r.id, label: r.name })),
          ]}
          onValueChange={(v) => filterBy(setRoleId)(v ?? ALL)}
        />
        <Select
          size="sm"
          aria-label="소속"
          className="w-36"
          value={affiliationId}
          items={[
            { value: ALL, label: "모든 소속" },
            ...affiliations.map((a) => ({ value: a.id, label: a.name })),
          ]}
          onValueChange={(v) => filterBy(setAffiliationId)(v ?? ALL)}
        />
        <Select
          size="sm"
          aria-label="상태"
          className="w-32"
          value={status}
          items={[
            { value: ALL, label: "모든 상태" },
            ...(Object.keys(accountStatusInfo) as AccountStatus[]).map((s) => ({
              value: s,
              label: accountStatusInfo[s].label,
            })),
          ]}
          onValueChange={(v) =>
            filterBy(setStatus)((v ?? ALL) as AccountStatus | typeof ALL)
          }
        />
        <span className="flex-1" />
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => setCreateOpen(true)}
        >
          계정 만들기
        </Button>
      </div>

      {accounts.isError ? (
        <LoadError
          title="계정을 불러오지 못했습니다"
          onRetry={() => accounts.refetch()}
        />
      ) : accounts.data?.total === 0 ? (
        <EmptyState
          icon={Users}
          title={filtering ? "조건에 맞는 계정이 없습니다" : "계정이 없습니다"}
        />
      ) : (
        <>
          <DataGrid
            aria-label="계정 목록"
            selection="none"
            columns={columns}
            rows={accounts.data?.items ?? []}
            getRowId={(a) => a.id}
          />
          {/* 범위를 벗어난 응답은 마지막 페이지로 옮기는 동안 범위를 보여주지 않는다 */}
          {total > ACCOUNTS_PAGE_SIZE && pageStart < total && (
            <nav
              aria-label="계정 목록 페이지"
              className="flex items-center justify-end gap-2"
            >
              <span className="text-body-sm text-fg-muted">
                전체 {total}명 중 {pageStart + 1}–
                {Math.min(pageStart + ACCOUNTS_PAGE_SIZE, total)}
              </span>
              <Button
                size="sm"
                disabled={moving || shownPage === 0}
                onClick={() => setPage(shownPage - 1)}
              >
                이전
              </Button>
              <Button
                size="sm"
                disabled={moving || shownPage >= lastPage}
                onClick={() => setPage(shownPage + 1)}
              >
                다음
              </Button>
            </nav>
          )}
        </>
      )}

      <CreateAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={setIssued}
      />
      <IssuedLinkDialog link={issued} onClose={() => setIssued(null)} />
    </>
  );
}
