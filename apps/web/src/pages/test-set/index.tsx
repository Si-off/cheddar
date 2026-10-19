import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  buttonVariants,
  Dialog,
  EmptyState,
  IconButton,
  LoadError,
  Menu,
  SaveStatus,
  Select,
  Tabs,
  TextField,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Columns3,
  Download,
  FileQuestion,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Table2,
  Trash2,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  type ColumnErrors,
  fromTemplateDraft,
  type TemplateDraft,
  toTemplateDraft,
  validateTemplateDraft,
} from "@/entities/project";
import {
  type CaseOp,
  type CellValue,
  cellText,
  groupable,
  groupCases,
  readCell,
  type TestSet,
  testSetQuery,
} from "@/entities/test-set";
import { useCaseOps } from "@/features/edit-cases";
import { useSaveColumns } from "@/features/edit-test-set-columns";
import { useExportXlsx } from "@/features/export-xlsx";
import {
  DeleteTestSetDialog,
  RenameTestSetDialog,
} from "@/features/manage-test-set";
import { useTestSetView } from "@/features/test-set-view";
import { isApiFailure } from "@/shared/api";
import { CaseBoard } from "@/widgets/case-board";
import { CaseDialog } from "@/widgets/case-dialog";
import { CaseTable } from "@/widgets/case-table";
import { ColumnsEditor } from "@/widgets/columns-editor";

export function TestSetPage({ testSetId }: { testSetId: string }) {
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
  return <TestSetScreen testSet={testSet.data} />;
}

function TestSetScreen({ testSet }: { testSet: TestSet }) {
  const navigate = useNavigate();
  const { apply, state } = useCaseOps(testSet.id);
  const [view, setView] = useTestSetView(testSet.id, {
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
  const [dialog, setDialog] = useState<"columns" | "rename" | "delete" | null>(
    null,
  );
  const readOnly = !testSet.access.canEdit;

  const groupColumn =
    testSet.columns.find(
      (c) => c.id === view.groupByColumnId && groupable(c.type),
    ) ?? null;
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

  const addCase = (values: Record<string, CellValue> = {}) => {
    const caseId = crypto.randomUUID();
    const last = testSet.cases[testSet.cases.length - 1];
    apply([
      { type: "add_case", caseId, afterCaseId: last?.id ?? null, values },
    ]);
    return caseId;
  };
  const removeSelected = () => {
    apply([{ type: "delete_cases", caseIds: [...selectedIds] }]);
    setSelected(new Set());
  };
  const onOps = (ops: CaseOp[]) => apply(ops);

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
  };

  return (
    <main className="flex w-full flex-col gap-4 px-8 pt-6 pb-8">
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbItem render={<Link to="/test-sets" />}>
            테스트 세트
          </BreadcrumbItem>
          <BreadcrumbItem current>{testSet.name}</BreadcrumbItem>
        </Breadcrumb>
        <div className="flex min-h-9 flex-wrap items-center gap-3">
          <h1 className="m-0 text-title text-fg">{testSet.name}</h1>
          {!readOnly && <SaveStatus state={state} />}
          <span className="flex-1" />
          {testSet.access.canExport && (
            <Button
              icon={Download}
              loading={exportXlsx.isPending}
              onClick={() => exportXlsx.mutate()}
            >
              XLSX 내보내기
            </Button>
          )}
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
      </div>

      <div className="flex flex-wrap items-center gap-2 border-line border-t pt-1">
        <Tabs.Root
          value={view.view}
          onValueChange={(v) => setView({ view: v as "table" | "card" })}
        >
          <Tabs.List variant="pill" aria-label="보기">
            <Tabs.Tab value="table" icon={Table2}>
              표
            </Tabs.Tab>
            <Tabs.Tab value="card" icon={Columns3}>
              카드
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.Root>
        <TextField
          size="sm"
          icon={Search}
          placeholder="케이스 검색"
          aria-label="케이스 검색"
          className="w-60 max-w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          size="sm"
          aria-label="묶기 기준"
          className="w-40"
          value={groupColumn?.id ?? ""}
          items={[
            { value: "", label: "묶지 않음" },
            ...testSet.columns
              .filter((c) => groupable(c.type))
              .map((c) => ({ value: c.id, label: c.name })),
          ]}
          onValueChange={(id) => setView({ groupByColumnId: id || null })}
        />
        {view.view === "table" && selectedIds.size > 0 && (
          <>
            <span className="mx-1 h-5 w-px bg-line" />
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
        {!readOnly && (
          <Button
            size="sm"
            icon={SlidersHorizontal}
            onClick={() => setDialog("columns")}
          >
            양식 편집
          </Button>
        )}
      </div>

      {view.view === "card" ? (
        <CaseBoard
          columns={testSet.columns}
          cases={cases}
          groupColumnId={groupColumn?.id ?? null}
          readOnly={readOnly}
          onOps={onOps}
          onOpenCase={setOpenCaseId}
          onAddCase={(values) => setOpenCaseId(addCase(values))}
        />
      ) : testSet.cases.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="케이스가 없습니다"
          actions={
            !readOnly && <Button onClick={() => addCase()}>케이스 추가</Button>
          }
        />
      ) : groupColumn ? (
        <div className="flex flex-col gap-6">
          {groupCases(groupColumn, cases).map((group) => (
            <section
              key={group.key}
              aria-label={group.label}
              className="flex flex-col gap-2"
            >
              <h2 className="m-0 text-title-sm text-fg">
                {group.label}{" "}
                <span className="text-caption text-fg-muted tabular-nums">
                  {group.cases.length}
                </span>
              </h2>
              <CaseTable
                aria-label={`${group.label} 케이스`}
                cases={group.cases}
                onAddCase={() => addCase({ [groupColumn.id]: group.value })}
                {...tableProps}
              />
            </section>
          ))}
        </div>
      ) : (
        <CaseTable
          aria-label="케이스"
          cases={cases}
          onAddCase={() => addCase()}
          {...tableProps}
        />
      )}

      <CaseDialog
        columns={testSet.columns}
        testCase={testSet.cases.find((c) => c.id === openCaseId) ?? null}
        readOnly={readOnly}
        onOps={onOps}
        onClose={() => setOpenCaseId(null)}
      />
      <ColumnsSheet
        testSet={testSet}
        open={dialog === "columns"}
        onOpenChange={(open) => setDialog(open ? "columns" : null)}
      />
      <RenameTestSetDialog
        testSet={testSet}
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
      />
      <DeleteTestSetDialog
        testSet={testSet}
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        onDeleted={() => navigate({ to: "/test-sets" })}
      />
    </main>
  );
}

/** 이 테스트 세트의 항목만 바꾼다. 프로젝트 기본 양식은 그대로다. */
function ColumnsSheet({
  testSet,
  open,
  onOpenChange,
}: {
  testSet: TestSet;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content placement="side" size="lg">
        {open && (
          <ColumnsForm testSet={testSet} onDone={() => onOpenChange(false)} />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function ColumnsForm({
  testSet,
  onDone,
}: {
  testSet: TestSet;
  onDone: () => void;
}) {
  const save = useSaveColumns(testSet.id);
  const base = { revision: 1, columns: testSet.columns };
  const [draft, setDraft] = useState<TemplateDraft>(() =>
    toTemplateDraft(base),
  );
  const [selectedId, setSelectedId] = useState(testSet.columns[0]?.id ?? "");
  const [errors, setErrors] = useState<Record<string, ColumnErrors> | null>(
    null,
  );
  const dirty =
    JSON.stringify(fromTemplateDraft(draft).columns) !==
    JSON.stringify(testSet.columns);
  // 저장하면 값이 지워지는 항목: 지운 항목, 형식이나 선택 항목이 바뀌어 기존 값이 맞지 않는 항목
  const next = fromTemplateDraft(draft).columns;
  const losing = testSet.columns.filter((old) => {
    const changed = next.find((c) => c.id === old.id);
    return testSet.cases.some((c) => {
      const v = c.values[old.id];
      if (!cellText(old, v)) return false;
      if (!changed) return true;
      return (
        changed.type !== "text" &&
        JSON.stringify(readCell(changed, v)) !==
          JSON.stringify(readCell(old, v))
      );
    });
  });

  const submit = () => {
    const found = validateTemplateDraft(draft);
    setErrors(found);
    const first = draft.columns.find((c) => found[c.id]);
    if (first) {
      setSelectedId(first.id);
      return;
    }
    save.mutate(draft, { onSuccess: onDone });
  };

  return (
    <>
      <Dialog.Header title="테스트 세트 양식" />
      <Dialog.Body className="flex-1 overflow-auto">
        <ColumnsEditor
          value={draft}
          onChange={(next) => {
            setDraft(next);
            if (errors) setErrors(validateTemplateDraft(next));
          }}
          errors={errors ?? undefined}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </Dialog.Body>
      <Dialog.Footer>
        {losing.length > 0 && (
          <span className="flex-1 text-caption text-warning">
            저장하면 {losing.map((c) => c.name).join(", ")} 항목의 기존 값
            일부가 지워집니다
          </span>
        )}
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          variant="primary"
          disabled={!dirty}
          loading={save.isPending}
          onClick={submit}
        >
          저장
        </Button>
      </Dialog.Footer>
    </>
  );
}
