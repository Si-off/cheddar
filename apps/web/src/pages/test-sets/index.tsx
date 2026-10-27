import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Badge,
  buttonVariants,
  DataGrid,
  type DataGridColumn,
  EmptyState,
  Icon,
  LoadError,
  Tabs,
  TextField,
} from "@workspace/ui";
import { Globe, ListChecks, Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  type TestSetFilter,
  type TestSetSummary,
  testSetsQuery,
} from "@/entities/test-set";

const filters: { value: TestSetFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "mine", label: "내가 만든 테스트 세트" },
];

const dateFormat = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
});

/** 최근이면 "방금", "N분 전"처럼, 오래됐으면 날짜로 */
function updatedLabel(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 60 * 48) return "어제";
  return dateFormat.format(new Date(iso));
}

export function TestSetsPage() {
  const [filter, setFilter] = useState<TestSetFilter>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim());
  const sets = useQuery({
    ...testSetsQuery(filter, query),
    placeholderData: keepPreviousData,
  });

  const columns: DataGridColumn<TestSetSummary>[] = [
    {
      id: "name",
      header: "이름",
      width: 420,
      cell: (s) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link
            to="/test-sets/$testSetId"
            params={{ testSetId: s.id }}
            className="font-medium text-fg no-underline hover:text-accent-text hover:underline"
          >
            {s.name}
          </Link>
          {s.isPublic && (
            <Badge tone="info" icon={Globe}>
              공개
            </Badge>
          )}
        </span>
      ),
    },
    { id: "owner", header: "만든 사람", width: 120, cell: (s) => s.owner.name },
    {
      id: "cases",
      header: "케이스",
      width: 88,
      cell: (s) => <span className="tabular-nums">{s.caseCount}</span>,
    },
    {
      id: "review",
      header: "상태",
      width: 120,
      cell: (s) =>
        s.reviewCount > 0 && (
          <Badge tone="warning" dot>
            확인 필요 {s.reviewCount}
          </Badge>
        ),
    },
    {
      id: "updated",
      header: "수정",
      width: 140,
      cell: (s) => (
        <span className="text-fg-muted">{updatedLabel(s.updatedAt)}</span>
      ),
    },
  ];

  // 다른 화면으로 가는 것이므로 버튼 모양의 링크로 둔다
  const create = (
    <Link
      to="/test-sets/new"
      className={buttonVariants({ variant: "primary" })}
    >
      <Icon icon={Plus} />새 테스트 세트
    </Link>
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-6 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 text-title-lg text-fg">테스트 세트</h1>
        <TextField
          icon={Search}
          placeholder="테스트 세트 검색"
          aria-label="테스트 세트 검색"
          className="w-64 max-w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {sets.data && sets.data.length > 0 && create}
      </div>
      <Tabs.Root
        value={filter}
        onValueChange={(v) => setFilter(v as TestSetFilter)}
      >
        <Tabs.List
          variant="pill"
          aria-label="테스트 세트 범위"
          className="w-fit"
        >
          {filters.map((f) => (
            <Tabs.Tab key={f.value} value={f.value}>
              {f.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.Root>
      {sets.isError ? (
        <LoadError
          title="테스트 세트를 불러오지 못했습니다"
          onRetry={() => sets.refetch()}
        />
      ) : sets.data?.length === 0 ? (
        <EmptyState
          icon={query ? Search : ListChecks}
          title={
            query ? "찾는 테스트 세트가 없습니다" : "테스트 세트가 없습니다"
          }
          actions={query ? undefined : create}
        />
      ) : (
        <DataGrid
          aria-label="테스트 세트 목록"
          selection="none"
          columns={columns}
          rows={sets.data ?? []}
          getRowId={(s) => s.id}
        />
      )}
    </main>
  );
}
