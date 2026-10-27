import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Avatars,
  Badge,
  Button,
  buttonVariants,
  EmptyState,
  LoadError,
  SaveStatus,
  TextField,
  Toolbar,
} from "@workspace/ui";
import { Download, Eye, FileX, Link2Off, Search } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  CellImageContext,
  cellText,
  groupable,
  type SharedTestSet,
  sharedImages,
  sharedTestSetQuery,
  type TestSet,
} from "@/entities/test-set";
import {
  liveConnectionHeader,
  useLiveTestSet,
} from "@/features/collaborate-test-set";
import { useCaseHistory, useCaseOps } from "@/features/edit-cases";
import { useExportSharedXlsx } from "@/features/export-xlsx";
import { sharedViewSource, useTestSetView } from "@/features/test-set-view";
import { isApiFailure, sdk } from "@/shared/api";
import { CaseTable } from "@/widgets/case-table";

function Unavailable() {
  return (
    <main className="flex min-h-dvh justify-center bg-canvas px-6 pt-40 pb-12">
      <EmptyState
        icon={Link2Off}
        title="열 수 없는 링크입니다"
        description="공유한 사람에게 새 링크를 받으세요."
        actions={
          <Link to="/login" className={buttonVariants()}>
            로그인
          </Link>
        }
      />
    </main>
  );
}

/** 공개 링크로 연 테스트 세트. 로그인하지 않아도 자동 이름으로 참여한다. */
export function SharedTestSetPage({ linkToken }: { linkToken: string }) {
  const testSet = useQuery({
    ...sharedTestSetQuery(linkToken),
    meta: { quietCodes: ["LINK_NOT_FOUND"] },
  });
  if (testSet.isError)
    return isApiFailure(testSet.error, "LINK_NOT_FOUND") ? (
      <Unavailable />
    ) : (
      <main className="flex min-h-dvh justify-center bg-canvas px-6 pt-40">
        <LoadError
          title="테스트 세트를 불러오지 못했습니다"
          onRetry={() => testSet.refetch()}
        />
      </main>
    );
  if (!testSet.data) return null;
  return <SharedScreen linkToken={linkToken} testSet={testSet.data} />;
}

function SharedScreen({
  linkToken,
  testSet,
}: {
  linkToken: string;
  testSet: SharedTestSet;
}) {
  const queryClient = useQueryClient();
  const { queryKey } = sharedTestSetQuery(linkToken);
  const connection = useRef<() => string | null>(() => null);
  const { apply, state, applyRemote, resync } = useCaseOps({
    queryKey,
    fetch: () =>
      queryClient.fetchQuery({
        ...sharedTestSetQuery(linkToken),
        staleTime: 0,
      }) as unknown as Promise<TestSet>,
    send: (ops) => {
      const id = connection.current();
      return sdk.applySharedTestSetOps({
        path: { linkToken },
        body: { ops },
        headers: id ? { [liveConnectionHeader]: id } : undefined,
        throwOnError: true,
      });
    },
  });
  // 내가 한 편집만 되돌린다
  const history = useCaseHistory({ queryKey, apply });
  const live = useLiveTestSet(`shared/${encodeURIComponent(linkToken)}`, {
    version: () =>
      queryClient.getQueryData<SharedTestSet>(queryKey)?.version ?? 0,
    onOps: applyRemote,
    onResync: resync,
    onAccess: (access) =>
      queryClient.setQueryData(
        queryKey,
        (current: SharedTestSet | undefined) =>
          current && { ...current, access: { ...current.access, ...access } },
      ),
  });
  connection.current = live.connectionId;
  // 로그인이 끝났으면 방문자로 다시 연다
  useEffect(() => {
    if (live.closed === "session-expired") window.location.reload();
  }, [live.closed]);
  const exportXlsx = useExportSharedXlsx(linkToken, testSet.name);
  // 방문자도 열 너비와 행 높이를 사람마다 따로 기억한다
  const [view, setView] = useTestSetView(sharedViewSource(linkToken), {
    columnIds: testSet.columns.map((c) => c.id),
    // 묶기 화면은 없지만 같은 계정의 보기 설정을 함께 쓰므로 묶기 기준을 지우지 않게 한다
    groupableColumnIds: testSet.columns
      .filter((c) => groupable(c.type))
      .map((c) => c.id),
    caseIds: testSet.cases.map((c) => c.id),
  });
  const [search, setSearch] = useState("");
  // 셀 도구를 그려 넣을 도구 상자 안 자리
  const [cellTools, setCellTools] = useState<HTMLElement | null>(null);
  const query = useDeferredValue(search.trim().toLowerCase());
  const canEdit = testSet.access.canEdit;
  const images = useMemo(
    () => sharedImages(linkToken, canEdit),
    [linkToken, canEdit],
  );

  if (live.closed === "session-expired") return null;
  if (live.closed === "deleted")
    return (
      <main className="flex min-h-dvh justify-center bg-canvas px-6 pt-40 pb-12">
        <EmptyState icon={FileX} title="테스트 세트가 삭제되었습니다" />
      </main>
    );
  if (live.closed) return <Unavailable />;

  const readOnly = !testSet.access.canEdit;
  const visitor = testSet.me.kind === "visitor";
  const cases = query
    ? testSet.cases.filter((c) =>
        testSet.columns.some((col) =>
          cellText(col, c.values[col.id]).toLowerCase().includes(query),
        ),
      )
    : testSet.cases;
  const others = live.people.filter(
    (p) => p.connectionId !== live.me?.connectionId,
  );
  const addCase = (
    afterCaseId: string | null = testSet.cases.at(-1)?.id ?? null,
  ) => {
    const caseId = crypto.randomUUID();
    history.record([{ type: "add_case", caseId, afterCaseId, values: {} }]);
    return caseId;
  };

  return (
    <CellImageContext value={images}>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <header className="flex min-h-14 flex-wrap items-center gap-3 border-line border-b bg-surface px-6 py-2">
          <h1 className="m-0 text-title text-fg">{testSet.name}</h1>
          {readOnly ? (
            <Badge tone="info" icon={Eye}>
              보기 전용
            </Badge>
          ) : (
            <SaveStatus state={state} />
          )}
          <span className="flex-1" />
          {others.length > 0 && (
            <Avatars
              people={others.map((p) => ({
                id: p.connectionId,
                name: p.name,
                color: p.color,
                guest: p.kind === "visitor",
              }))}
            />
          )}
          <span className="flex items-center gap-2 text-body-sm text-fg-muted">
            <Avatars
              aria-label="나"
              people={[
                {
                  id: testSet.me.id,
                  name: testSet.me.name,
                  color: live.me?.color ?? 1,
                  guest: visitor,
                },
              ]}
            />
            {testSet.me.name}
          </span>
          {testSet.access.canExport && (
            <Button
              size="sm"
              icon={Download}
              loading={exportXlsx.isPending}
              onClick={() => exportXlsx.mutate()}
            >
              XLSX 내보내기
            </Button>
          )}
          {visitor && (
            <Link
              to="/login"
              search={{ redirect: `/s/${linkToken}` }}
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              로그인
            </Link>
          )}
        </header>
        <main className="flex flex-col gap-3 px-8 pt-5 pb-8">
          <Toolbar aria-label="테스트 세트 도구">
            {!readOnly && <span ref={setCellTools} className="contents" />}
            <span className="flex-1" />
            <TextField
              size="sm"
              icon={Search}
              placeholder="케이스 검색"
              aria-label="케이스 검색"
              className="w-60 max-w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Toolbar>
          <CaseTable
            aria-label="테스트 케이스"
            columns={testSet.columns}
            cases={cases}
            readOnly={readOnly}
            canEditColumns={!readOnly && !visitor}
            onOps={history.record}
            onAddCase={() => addCase()}
            onInsertCase={addCase}
            presence={live.presence}
            onActiveCellChange={live.select}
            columnWidths={view.columnWidths}
            rowHeights={view.rowHeights}
            onColumnWidthsChange={(columnWidths) => setView({ columnWidths })}
            onRowHeightsChange={(rowHeights) => setView({ rowHeights })}
            toolsTarget={cellTools}
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
          />
        </main>
      </div>
    </CellImageContext>
  );
}
