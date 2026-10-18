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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Plus, Search, Users } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
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
  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const deferredSearch = useDeferredValue(search.trim());

  const roles = useQuery(rolesQuery()).data ?? [];
  const affiliations = useQuery(affiliationsQuery()).data ?? [];
  const accounts = useQuery(
    accountsQuery({
      search: deferredSearch || undefined,
      roleId: roleId || undefined,
      affiliationId: affiliationId || undefined,
      status: status || undefined,
    }),
  );

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
          onChange={(e) => setSearch(e.target.value)}
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
          onValueChange={(v) => setRoleId(v ?? ALL)}
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
          onValueChange={(v) => setAffiliationId(v ?? ALL)}
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
            setStatus((v ?? ALL) as AccountStatus | typeof ALL)
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
      ) : accounts.data && accounts.data.items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={filtering ? "조건에 맞는 계정이 없습니다" : "계정이 없습니다"}
        />
      ) : (
        <DataGrid
          aria-label="계정 목록"
          selection="none"
          columns={columns}
          rows={accounts.data?.items ?? []}
          getRowId={(a) => a.id}
        />
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
