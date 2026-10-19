import {
  Button,
  ConfirmDialog,
  DataGrid,
  type DataGridColumn,
  EmptyState,
  Select,
  TextArea,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LayoutList, Plus, Search, Trash2 } from "lucide-react";
import { type SubmitEvent, useDeferredValue, useState } from "react";
import { type Screen, screensQuery } from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

interface TreeRow extends Screen {
  depth: number;
  childCount: number;
}

/** 서버가 준 트리 순서에 깊이와 하위 개수를 붙인다 */
function toTree(screens: readonly Screen[]): TreeRow[] {
  const byId = new Map(screens.map((s) => [s.id, s]));
  const depthOf = (s: Screen): number => {
    let depth = 0;
    let parent = s.parentId ? byId.get(s.parentId) : undefined;
    while (parent && depth < screens.length) {
      depth += 1;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return depth;
  };
  return screens.map((s) => ({
    ...s,
    depth: depthOf(s),
    childCount: screens.filter((c) => c.parentId === s.id).length,
  }));
}

/** 자기 자신과 하위 화면은 상위 화면으로 고를 수 없다 */
function descendantsOf(id: string, screens: readonly Screen[]) {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of screens) {
      if (s.parentId && found.has(s.parentId) && !found.has(s.id)) {
        found.add(s.id);
        grew = true;
      }
    }
  }
  return found;
}

const indent = ["pl-0", "pl-5", "pl-10", "pl-15", "pl-20"] as const;

function useScreenActions(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = screensQuery(projectId);
  const onSuccess = () => queryClient.invalidateQueries({ queryKey });
  const onError = (error: unknown) =>
    toast.show({
      message: toApiFailure(error, {
        unknownResult: "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.",
      }).message,
      tone: "danger",
    });
  const path = { projectId };
  const create = useMutation({
    mutationFn: (body: ScreenInput) =>
      sdk.createProjectScreen({ path, body, throwOnError: true }),
    onSuccess: () => {
      toast.show({ message: "추가했습니다", tone: "success" });
      return onSuccess();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: ScreenInput & { id: string }) =>
      sdk.updateProjectScreen({
        path: { ...path, itemId: id },
        body,
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.show({ message: "저장했습니다", tone: "success" });
      return onSuccess();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteProjectScreen({
        path: { ...path, itemId: id },
        throwOnError: true,
      }),
    onSuccess: () => {
      toast.show({ message: "삭제했습니다", tone: "success" });
      return onSuccess();
    },
    onError,
  });
  return { create, update, remove };
}

interface ScreenInput {
  screenId: string;
  name: string;
  parentId: string | null;
  description: string;
}

export interface ScreensEditorProps {
  projectId: string;
  screens: Screen[];
  readOnly?: boolean;
}

/** 화면 ID와 이름으로 찾고, 고른 화면을 오른쪽에서 고친다. */
export function ScreensEditor({
  projectId,
  screens,
  readOnly,
}: ScreensEditorProps) {
  const actions = useScreenActions(projectId);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  // "new"면 새 화면을 쓰는 중
  const [selected, setSelected] = useState<string | null>(
    screens[0]?.id ?? null,
  );
  const [deleting, setDeleting] = useState<TreeRow | null>(null);

  const tree = toTree(screens);
  const rows = query
    ? tree.filter(
        (s) =>
          s.screenId.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query),
      )
    : tree;
  const current =
    selected === "new" ? null : (tree.find((s) => s.id === selected) ?? null);

  const columns: DataGridColumn<TreeRow>[] = [
    {
      id: "screenId",
      header: "화면 ID",
      width: 160,
      mono: true,
      cell: (s) => s.screenId,
    },
    {
      id: "name",
      header: "이름",
      width: 240,
      cell: (s) => (
        <button
          type="button"
          onClick={() => setSelected(s.id)}
          aria-current={s.id === selected ? "true" : undefined}
          className={`flex w-full items-center gap-1.5 border-0 bg-transparent p-0 text-left font-medium text-body-sm text-fg outline-none hover:text-accent-text focus-visible:text-accent-text ${indent[Math.min(s.depth, indent.length - 1)]}`}
        >
          {s.childCount > 0 ? (
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              className="shrink-0 text-fg-muted"
              aria-hidden
            />
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          {s.name}
        </button>
      ),
    },
    {
      id: "description",
      header: "설명",
      width: 360,
      cell: (s) => <span className="text-fg-muted">{s.description}</span>,
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <TextField
          size="sm"
          icon={Search}
          placeholder="화면 ID나 이름 검색"
          aria-label="화면 검색"
          className="w-64 max-w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!readOnly && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setSelected("new")}
          >
            화면 추가
          </Button>
        )}
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          {screens.length === 0 ? (
            <EmptyState icon={LayoutList} title="화면이 없습니다" />
          ) : rows.length === 0 ? (
            <EmptyState icon={Search} title="찾는 화면이 없습니다" />
          ) : (
            <DataGrid
              aria-label="화면 구조"
              selection="none"
              columns={columns}
              rows={rows}
              getRowId={(s) => s.id}
              isRowHighlighted={(s) => s.id === selected}
            />
          )}
        </div>
        {(selected === "new" || current) && (
          <ScreenPanel
            key={current?.id ?? "new"}
            screen={current}
            screens={screens}
            readOnly={readOnly}
            pending={actions.create.isPending || actions.update.isPending}
            onSave={(input) =>
              current
                ? actions.update.mutate({ id: current.id, ...input })
                : actions.create.mutate(input, {
                    onSuccess: ({ data }) => setSelected(data.id),
                  })
            }
            onCancel={() => setSelected(screens[0]?.id ?? null)}
            onDelete={() => current && setDeleting(current)}
          />
        )}
      </div>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description="이미 만든 테스트 세트의 케이스는 그대로 남습니다."
        confirmLabel="삭제"
        tone="danger"
        pending={actions.remove.isPending}
        onConfirm={() =>
          deleting &&
          actions.remove.mutate(deleting.id, {
            onSuccess: () => setSelected(null),
            onSettled: () => setDeleting(null),
          })
        }
      />
    </>
  );
}

function ScreenPanel({
  screen,
  screens,
  readOnly,
  pending,
  onSave,
  onCancel,
  onDelete,
}: {
  /** 없으면 새 화면 */
  screen: TreeRow | null;
  screens: readonly Screen[];
  readOnly?: boolean;
  pending: boolean;
  onSave: (input: ScreenInput) => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = useState<ScreenInput>({
    screenId: screen?.screenId ?? "",
    name: screen?.name ?? "",
    parentId: screen?.parentId ?? null,
    description: screen?.description ?? "",
  });
  const [touched, setTouched] = useState(false);
  const blocked = screen ? descendantsOf(screen.id, screens) : new Set();
  const parents = [
    { value: "", label: "없음" },
    ...screens
      .filter((s) => !blocked.has(s.id))
      .map((s) => ({ value: s.id, label: `${s.name} (${s.screenId})` })),
  ];
  const errors = {
    screenId: draft.screenId.trim() ? undefined : "화면 ID를 입력하세요",
    name: draft.name.trim() ? undefined : "이름을 입력하세요",
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (errors.screenId || errors.name) return;
    onSave({
      screenId: draft.screenId.trim(),
      name: draft.name.trim(),
      parentId: draft.parentId,
      description: draft.description.trim(),
    });
  };

  return (
    <form
      onSubmit={submit}
      noValidate
      className="rounded-lg border border-line bg-surface"
    >
      <header className="border-line border-b px-5 py-3">
        <h2 className="m-0 truncate text-title-sm text-fg">
          {screen ? screen.name : "새 화면"}
        </h2>
      </header>
      <div className="flex flex-col gap-4 p-5">
        <TextField
          label="화면 ID"
          required
          readOnly={readOnly}
          maxLength={100}
          counter={`${draft.screenId.trim().length}/100`}
          error={touched ? errors.screenId : undefined}
          value={draft.screenId}
          onChange={(e) => setDraft({ ...draft, screenId: e.target.value })}
        />
        <TextField
          label="이름"
          required
          readOnly={readOnly}
          maxLength={200}
          counter={`${draft.name.trim().length}/200`}
          error={touched ? errors.name : undefined}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Select
          label="상위 화면"
          disabled={readOnly}
          value={draft.parentId ?? ""}
          items={parents}
          onValueChange={(id) => setDraft({ ...draft, parentId: id || null })}
        />
        <TextArea
          label="설명"
          rows={3}
          readOnly={readOnly}
          maxLength={2000}
          counter={`${draft.description.trim().length}/2000`}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </div>
      {!readOnly && (
        <footer className="flex flex-wrap items-center gap-2 border-line border-t px-5 py-3">
          <span className="flex-1 basis-40 text-caption text-fg-muted">
            {screen && screen.childCount > 0
              ? `하위 화면 ${screen.childCount}개가 있어 삭제할 수 없습니다`
              : ""}
          </span>
          {screen ? (
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              disabled={screen.childCount > 0}
              onClick={onDelete}
            >
              삭제
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              취소
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" loading={pending}>
            {screen ? "저장" : "추가"}
          </Button>
        </footer>
      )}
    </form>
  );
}
