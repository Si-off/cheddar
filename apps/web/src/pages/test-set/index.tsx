import {
  Avatars,
  Banner,
  Button,
  buttonVariants,
  EmptyState,
  IconButton,
  LoadError,
  Menu,
  SaveStatus,
  Tabs,
  TextField,
  Toolbar,
  ToolbarMenu,
  ToolbarSeparator,
  useToast,
} from "@cheddar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlignLeft,
  CircleHelp,
  Columns3,
  Download,
  FileQuestion,
  Link2,
  MoreHorizontal,
  Search,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  currentGenerationQuery,
  reviewItemsQuery,
  tempUploadQuery,
} from "@/entities/generation";
import { templateQuery } from "@/entities/project";
import {
  type CaseOp,
  CellImageContext,
  type CellValue,
  cellText,
  groupable,
  type TestSet,
  testSetImages,
  testSetQuery,
} from "@/entities/test-set";
import {
  liveConnectionHeader,
  useLiveTestSet,
} from "@/features/collaborate-test-set";
import { useCaseHistory, useCaseOps } from "@/features/edit-cases";
import { useExportXlsx } from "@/features/export-xlsx";
import { GenerateSheet } from "@/features/generate-cases";
import {
  DeleteTestSetDialog,
  RenameTestSetDialog,
} from "@/features/manage-test-set";
import { useReviewActions, useRewriteWatch } from "@/features/resolve-review";
import { sharingQuery } from "@/features/share-test-set";
import { testSetViewSource, useTestSetView } from "@/features/test-set-view";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";
import { CaseCanvas } from "@/widgets/case-canvas";
import { CaseDialog } from "@/widgets/case-dialog";
import { CaseTable, CellToolbar } from "@/widgets/case-table";
import { NoAccessNotice } from "@/widgets/no-access-notice";
import { ReviewPanel } from "@/widgets/review-panel";
import { ShareDialog } from "@/widgets/share-dialog";

export function TestSetPage({
  testSetId,
  uploadId,
}: {
  testSetId: string;
  /** 플러그인에서 올린 프레임 묶음(케이스 추가 생성에 쓴다) */
  uploadId?: string;
}) {
  const testSet = useQuery({
    ...testSetQuery(testSetId),
    meta: { quietCodes: ["NOT_FOUND"] },
  });
  if (testSet.isError)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        {isApiFailure(testSet.error, "NOT_FOUND") ? (
          <EmptyState
            icon={FileQuestion}
            title="테스트 세트를 찾을 수 없습니다"
            description="삭제됐거나 볼 권한이 없습니다."
            actions={
              <Link to="/test-sets" className={buttonVariants()}>
                테스트 세트 목록
              </Link>
            }
          />
        ) : (
          <LoadError
            title="테스트 세트를 불러오지 못했습니다"
            onRetry={() => testSet.refetch()}
          />
        )}
      </main>
    );
  if (!testSet.data) return null;
  return <TestSetScreen testSet={testSet.data} uploadId={uploadId} />;
}

function TestSetScreen({
  testSet,
  uploadId,
}: {
  testSet: TestSet;
  uploadId?: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { queryKey } = testSetQuery(testSet.id);
  const connection = useRef<() => string | null>(() => null);
  const { apply, state, applyRemote, resync, refresh, settled } = useCaseOps({
    queryKey,
    fetch: () =>
      queryClient.fetchQuery({ ...testSetQuery(testSet.id), staleTime: 0 }),
    send: (ops) => {
      const id = connection.current();
      return sdk.applyTestSetOps({
        path: { testSetId: testSet.id },
        body: { ops },
        headers: id ? { [liveConnectionHeader]: id } : undefined,
        throwOnError: true,
      });
    },
  });
  const live = useLiveTestSet(`test-sets/${testSet.id}`, {
    version: () => queryClient.getQueryData<TestSet>(queryKey)?.version ?? 0,
    onOps: applyRemote,
    onResync: (version) => {
      resync(version);
      // 확인 필요와 생성 상태는 따로 읽으므로 함께 새로 읽는다
      void queryClient.invalidateQueries({
        queryKey: reviewItemsQuery(testSet.id).queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: currentGenerationQuery(testSet.id).queryKey,
      });
      void queryClient.invalidateQueries({
        queryKey: sharingQuery(testSet.id).queryKey,
      });
    },
    onAccess: (access) => {
      const current = queryClient.getQueryData<TestSet>(queryKey);
      if (
        !current ||
        (Object.keys(access) as (keyof typeof access)[]).every(
          (key) => current.access[key] === access[key],
        )
      )
        return;
      // 권한이 바뀌면 소유자가 바뀌었을 수 있어 테스트 세트와 공유 설정을 다시 읽는다
      queryClient.setQueryData(queryKey, {
        ...current,
        access: { ...current.access, ...access },
      });
      refresh();
      void queryClient.invalidateQueries({
        queryKey: sharingQuery(testSet.id).queryKey,
      });
    },
  });
  connection.current = live.connectionId;
  // 내가 한 편집만 되돌린다
  const history = useCaseHistory({ queryKey, apply });
  // 로그인이 끝나 연결이 닫히면 로그인 뒤 이 화면으로 돌아온다
  useEffect(() => {
    if (live.closed === "session-expired")
      void navigate({
        to: "/login",
        search: {
          redirect: window.location.pathname + window.location.search,
        },
      });
  }, [live.closed, navigate]);
  const [view, setView] = useTestSetView(testSetViewSource(testSet.id), {
    columnIds: testSet.columns.map((c) => c.id),
    groupableColumnIds: testSet.columns
      .filter((c) => groupable(c.type))
      .map((c) => c.id),
    caseIds: testSet.cases.map((c) => c.id),
  });
  const exportXlsx = useExportXlsx(testSet.id, testSet.name);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    "rename" | "delete" | "generate" | "share" | null
  >(null);
  const readOnly = !testSet.access.canEdit;
  const images = useMemo(
    () => testSetImages(testSet.id, !readOnly),
    [testSet.id, readOnly],
  );
  const generation = useQuery(currentGenerationQuery(testSet.id)).data;
  const active =
    generation?.status === "queued" || generation?.status === "running";
  // 다시 작성은 확인 필요 패널에서, 열 채우기는 표에서 보여주므로 케이스 생성만 진행 중으로 본다
  const running =
    active &&
    generation?.kind !== "rewrite" &&
    generation?.kind !== "fill_column";
  const filling = active && generation?.kind === "fill_column";
  const reviewItems = useQuery(reviewItemsQuery(testSet.id)).data ?? [];
  const reviewCount = reviewItems.filter(
    (i) => i.status === "pending" || i.status === "rewriting",
  ).length;
  // 제외한 항목을 되돌릴 수 있도록 처리하지 않은 항목이 남아 있으면 버튼을 둔다
  const hasReview = reviewItems.some((i) => i.status !== "resolved");
  const [reviewOpen, setReviewOpen] = useState(false);
  // 표의 셀 도구를 그려 넣을 도구 상자 안 자리
  const [cellTools, setCellTools] = useState<HTMLElement | null>(null);
  const review = useReviewActions(testSet.id);
  // 다시 작성 중에 새로 고쳤으면 그 작업이 끝날 때를 다시 기다린다
  useRewriteWatch(
    testSet.id,
    active && generation?.kind === "rewrite" ? generation.jobId : null,
  );
  const upload = useQuery({
    ...tempUploadQuery(uploadId ?? ""),
    enabled: Boolean(uploadId) && !readOnly,
    meta: { quietCodes: ["NOT_FOUND"] },
  }).data;
  // 열 추가에서 고를 프로젝트 양식의 열. 프로젝트를 볼 수 없으면 직접 정의만 된다.
  const presetColumns = useQuery({
    ...templateQuery(testSet.project.id),
    enabled: !readOnly,
    meta: { quietCodes: ["NOT_FOUND", "FORBIDDEN"] },
  }).data?.columns;

  const canvas = view.view === "canvas";
  const groupColumn =
    testSet.columns.find(
      (c) => c.id === view.groupByColumnId && groupable(c.type),
    ) ?? null;
  // 캔버스를 나눌 기준. 열을 골랐는데 그 열이 없어졌으면 기능 그룹으로 나눈다.
  const canvasGroup =
    view.canvasGroup === "column" && !groupColumn
      ? "feature"
      : view.canvasGroup;
  const cases = query
    ? testSet.cases.filter((c) =>
        testSet.columns.some((col) =>
          cellText(col, c.values[col.id]).toLowerCase().includes(query),
        ),
      )
    : testSet.cases;
  // 지운 케이스가 고른 목록에 남지 않게 한다
  const selectedIds = new Set(
    [...selected].filter((id) => testSet.cases.some((c) => c.id === id)),
  );

  const addCase = (
    values: Record<string, CellValue> = {},
    afterCaseId: string | null = testSet.cases.at(-1)?.id ?? null,
  ) => {
    const caseId = crypto.randomUUID();
    history.record([{ type: "add_case", caseId, afterCaseId, values }]);
    return caseId;
  };
  const removeSelected = () => {
    history.record([{ type: "delete_cases", caseIds: [...selectedIds] }]);
    setSelected(new Set());
  };
  const onOps = (ops: CaseOp[]) => history.record(ops);
  // 열 추가 연산이 저장된 뒤에 채우기를 시작한다
  const fillColumn = (columnId: string) =>
    settled()
      .then(() =>
        sdk.fillTestSetColumn({
          path: { testSetId: testSet.id, columnId },
          throwOnError: true,
        }),
      )
      .then(() =>
        queryClient.invalidateQueries({
          queryKey: currentGenerationQuery(testSet.id).queryKey,
        }),
      )
      .catch((error) =>
        toast.show({
          message: toApiFailure(error, {
            unknownResult:
              "응답을 받지 못했습니다. 새로 고쳐 채우기가 시작됐는지 확인하세요.",
          }).message,
          tone: "danger",
        }),
      );

  const tableProps = {
    columns: testSet.columns,
    readOnly,
    onOps,
    selectedIds: readOnly ? undefined : selectedIds,
    onSelectedIdsChange: setSelected,
    columnWidths: view.columnWidths,
    rowHeights: view.rowHeights,
    onColumnWidthsChange: (columnWidths: Record<string, number>) =>
      setView({ columnWidths }),
    onRowHeightsChange: (rowHeights: Record<string, number>) =>
      setView({ rowHeights }),
    presence: live.presence,
    onActiveCellChange: live.select,
    presetColumns,
    allCases: testSet.cases,
    onFillColumn: running ? undefined : fillColumn,
  };

  if (live.closed === "session-expired") return null;
  if (live.closed)
    return live.closed === "deleted" ? (
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <EmptyState
          icon={FileQuestion}
          title="테스트 세트가 삭제되었습니다"
          actions={
            <Link to="/test-sets" className={buttonVariants()}>
              테스트 세트 목록
            </Link>
          }
        />
      </main>
    ) : (
      <NoAccessNotice backLink={<Link to="/test-sets" />} />
    );

  return (
    // 표와 캔버스는 화면 높이를 채우고 안에서 스크롤한다
    <CellImageContext value={images}>
      <main className="flex min-h-0 w-full flex-1 flex-col gap-4 px-8 pt-6 pb-8">
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <h1 className="m-0 text-title text-fg">{testSet.name}</h1>
          {!readOnly && <SaveStatus state={state} />}
          <span className="flex-1" />
          {live.people.length > 0 && (
            <Avatars
              people={live.people.map((p) => ({
                id: p.connectionId,
                name: p.connectionId === live.me?.connectionId ? "나" : p.name,
                color: p.color,
                guest: p.kind === "visitor",
              }))}
            />
          )}
          <Button icon={Link2} onClick={() => setDialog("share")}>
            공유
          </Button>
          {(testSet.access.canRename || testSet.access.canDelete) && (
            <Menu.Root>
              <Menu.Trigger
                render={
                  <IconButton
                    icon={MoreHorizontal}
                    label="테스트 세트 작업"
                    variant="solid"
                  />
                }
              />
              <Menu.Popup align="end">
                {testSet.access.canRename && (
                  <Menu.Item onClick={() => setDialog("rename")}>
                    이름 변경
                  </Menu.Item>
                )}
                {testSet.access.canDelete && (
                  <>
                    <Menu.Separator />
                    <Menu.Item
                      icon={Trash2}
                      tone="danger"
                      onClick={() => setDialog("delete")}
                    >
                      삭제
                    </Menu.Item>
                  </>
                )}
              </Menu.Popup>
            </Menu.Root>
          )}
        </div>

        <Toolbar aria-label="테스트 세트 도구">
          <Tabs.Root
            value={view.view}
            onValueChange={(v) => setView({ view: v as "table" | "canvas" })}
          >
            <Tabs.List variant="pill" aria-label="보기">
              <Tabs.Tab value="table" icon={Table2}>
                표
              </Tabs.Tab>
              <Tabs.Tab value="canvas" icon={Columns3}>
                캔버스
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>
          {view.view === "table" && testSet.cases.length > 0 && (
            <>
              <ToolbarSeparator />
              <span ref={setCellTools} className="contents" />
            </>
          )}
          {view.view === "table" && testSet.cases.length === 0 && !readOnly && (
            // 마지막 행을 지운 뒤에도 바로 되살릴 수 있게 실행취소는 남긴다
            <>
              <ToolbarSeparator />
              <CellToolbar
                actions={{
                  undo: history.canUndo ? history.undo : null,
                  redo: history.canRedo ? history.redo : null,
                }}
              />
            </>
          )}
          {canvas && (
            <>
              <ToolbarSeparator />
              {!readOnly && (
                <CellToolbar
                  actions={{
                    undo: history.canUndo ? history.undo : null,
                    redo: history.canRedo ? history.redo : null,
                  }}
                />
              )}
              <ToolbarMenu icon={Columns3} label="그룹화">
                {[
                  { key: "feature", label: "기능 그룹" },
                  ...testSet.columns
                    .filter((c) => groupable(c.type))
                    .map((c) => ({ key: c.id, label: c.name })),
                  { key: "none", label: "없음" },
                ].map((option) => {
                  const checked =
                    option.key === "feature" || option.key === "none"
                      ? canvasGroup === option.key
                      : canvasGroup === "column" &&
                        groupColumn?.id === option.key;
                  return (
                    <Menu.CheckboxItem
                      key={option.key}
                      closeOnClick
                      checked={checked}
                      onCheckedChange={() =>
                        setView(
                          option.key === "feature" || option.key === "none"
                            ? { canvasGroup: option.key }
                            : {
                                canvasGroup: "column",
                                groupByColumnId: option.key,
                              },
                        )
                      }
                    >
                      {option.label}
                    </Menu.CheckboxItem>
                  );
                })}
              </ToolbarMenu>
              <ToolbarMenu icon={AlignLeft} label="표시">
                {(
                  [
                    { key: "brief", label: "간략" },
                    { key: "detail", label: "상세" },
                  ] as const
                ).map((option) => (
                  <Menu.CheckboxItem
                    key={option.key}
                    closeOnClick
                    checked={view.canvasDensity === option.key}
                    onCheckedChange={() =>
                      setView({ canvasDensity: option.key })
                    }
                  >
                    {option.label}
                  </Menu.CheckboxItem>
                ))}
              </ToolbarMenu>
            </>
          )}
          {(!readOnly || testSet.access.canExport) && <ToolbarSeparator />}
          {!readOnly && (
            <Button
              size="sm"
              variant="ai"
              icon={Sparkles}
              disabled={running}
              onClick={() => setDialog("generate")}
            >
              케이스 추가 생성
            </Button>
          )}
          {testSet.access.canExport && (
            <Button
              size="sm"
              variant="ghost"
              icon={Download}
              loading={exportXlsx.isPending}
              onClick={() => exportXlsx.mutate()}
            >
              XLSX 내보내기
            </Button>
          )}
          {view.view === "table" && selectedIds.size > 0 && (
            <>
              <ToolbarSeparator />
              <span className="text-caption text-fg-muted">
                {selectedIds.size}개 선택
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={Trash2}
                onClick={removeSelected}
              >
                삭제
              </Button>
            </>
          )}
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
          {(hasReview || reviewOpen) && (
            <Button
              size="sm"
              icon={CircleHelp}
              aria-pressed={reviewOpen}
              onClick={() => setReviewOpen(!reviewOpen)}
              className="border-warning text-warning"
            >
              확인 필요
              <span className="tabular-nums">{reviewCount}</span>
            </Button>
          )}
        </Toolbar>

        {filling && <Banner tone="info" title="열을 채우고 있습니다" />}
        {running && generation && (
          <Banner
            tone="info"
            title="케이스를 만들고 있습니다"
            actions={
              <Link
                to="/test-sets/$testSetId/generating"
                params={{ testSetId: testSet.id }}
                className={buttonVariants({ size: "sm" })}
              >
                진행 보기
              </Link>
            }
          />
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
          <div className="flex min-w-0 flex-1 flex-col">
            {canvas ? (
              <CaseCanvas
                columns={testSet.columns}
                cases={cases}
                allCases={testSet.cases}
                featureGroups={testSet.featureGroups ?? []}
                group={canvasGroup}
                groupColumnId={groupColumn?.id ?? null}
                density={view.canvasDensity}
                readOnly={readOnly}
                onOps={onOps}
                onOpenCase={setOpenCaseId}
              />
            ) : testSet.cases.length === 0 ? (
              <EmptyState
                icon={Table2}
                title="케이스가 없습니다"
                actions={
                  !readOnly && (
                    <Button onClick={() => addCase()}>케이스 추가</Button>
                  )
                }
              />
            ) : (
              <div className="relative min-h-96 flex-1">
                <div className="absolute inset-0 flex flex-col">
                  <CaseTable
                    aria-label="케이스"
                    cases={cases}
                    onAddCase={() => addCase()}
                    onInsertCase={(after) => addCase({}, after)}
                    toolsTarget={cellTools}
                    onUndo={history.undo}
                    onRedo={history.redo}
                    canUndo={history.canUndo}
                    canRedo={history.canRedo}
                    {...tableProps}
                  />
                </div>
              </div>
            )}
          </div>
          <ReviewPanel
            columns={testSet.columns}
            items={reviewItems}
            readOnly={readOnly}
            onAnswer={(item, answer) => review.update.mutate({ item, answer })}
            onDraft={(item, columnId, value) =>
              review.update.mutate({
                item,
                draft: { ...item.draft, [columnId]: value },
              })
            }
            onExclude={(item) =>
              review.update.mutate({ item, status: "excluded" })
            }
            onRestore={(item) =>
              review.update.mutate({ item, status: "pending" })
            }
            onAccept={(item) => review.accept.mutate(item)}
            onRewrite={(item, answer) =>
              review.rewrite.mutate({ item, answer })
            }
            open={reviewOpen}
            onOpenChange={setReviewOpen}
          />
        </div>

        <GenerateSheet
          testSetId={testSet.id}
          upload={
            upload && upload.frames.length > 0
              ? { id: upload.id, frameCount: upload.frames.length }
              : null
          }
          open={dialog === "generate"}
          onOpenChange={(open) => setDialog(open ? "generate" : null)}
          onStarted={() =>
            navigate({
              to: "/test-sets/$testSetId/generating",
              params: { testSetId: testSet.id },
            })
          }
        />
        <CaseDialog
          columns={testSet.columns}
          testCase={testSet.cases.find((c) => c.id === openCaseId) ?? null}
          readOnly={readOnly}
          onOps={onOps}
          onClose={() => setOpenCaseId(null)}
        />
        <RenameTestSetDialog
          testSet={testSet}
          open={dialog === "rename"}
          onOpenChange={(open) => setDialog(open ? "rename" : null)}
        />
        <ShareDialog
          testSetId={testSet.id}
          open={dialog === "share"}
          onOpenChange={(open) => setDialog(open ? "share" : null)}
        />
        <DeleteTestSetDialog
          testSet={testSet}
          open={dialog === "delete"}
          onOpenChange={(open) => setDialog(open ? "delete" : null)}
          onDeleted={() => navigate({ to: "/test-sets" })}
        />
      </main>
    </CellImageContext>
  );
}
