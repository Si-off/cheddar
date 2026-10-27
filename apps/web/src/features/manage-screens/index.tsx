import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataGrid,
  type DataGridColumn,
  Dialog,
  EmptyState,
  IconButton,
  Menu,
  Select,
  TextArea,
  TextField,
  useToast,
} from "@workspace/ui";
import {
  ChevronDown,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type SubmitEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type Screen,
  type ScreenIdRule,
  type ScreenType,
  screenIdExampleParts,
  screensQuery,
  screenTypeLabel,
} from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";
import { ImportScreensDialog } from "./import-dialog";

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

const typeItems = (Object.keys(screenTypeLabel) as ScreenType[]).map((t) => ({
  value: t,
  label: screenTypeLabel[t],
}));

const unknownResult = "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.";

function useScreenActions(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = screensQuery(projectId);
  const onSuccess = () => queryClient.invalidateQueries({ queryKey });
  const onError = (error: unknown) =>
    toast.show({
      message: toApiFailure(error, { unknownResult }).message,
      tone: "danger",
    });
  const path = { projectId };
  const create = useMutation({
    mutationFn: (body: ScreenInput) =>
      sdk.createProjectScreen({ path, body, throwOnError: true }),
    onSuccess,
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: ScreenInput & { id: string }) =>
      sdk.updateProjectScreen({
        path: { ...path, itemId: id },
        body,
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteProjectScreen({
        path: { ...path, itemId: id },
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  return { create, update, remove };
}

interface ScreenInput {
  screenId: string;
  name: string;
  type: ScreenType;
  parentId: string | null;
  description: string;
}

export interface ScreensEditorProps {
  projectId: string;
  screens: Screen[];
  /** 프로젝트의 화면 ID 규칙. 새 화면의 ID를 채우는 데 쓴다. */
  rules?: ScreenIdRule[];
  readOnly?: boolean;
}

/** 화면 ID와 이름으로 찾고, 행 메뉴에서 고치거나 지운다. 자료에서 한꺼번에 가져올 수 있다. */
export function ScreensEditor({
  projectId,
  screens,
  rules = [],
  readOnly,
}: ScreensEditorProps) {
  const actions = useScreenActions(projectId);
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search.trim().toLowerCase());
  const [editing, setEditing] = useState<TreeRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<TreeRow | null>(null);
  const [importing, setImporting] = useState(false);

  const tree = toTree(screens);
  const rows = query
    ? tree.filter(
        (s) =>
          s.screenId.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query),
      )
    : tree;

  const columns: DataGridColumn<TreeRow>[] = [
    {
      id: "screenId",
      header: "화면 ID",
      width: 200,
      mono: true,
      cell: (s) => (
        <span className="flex items-center gap-2">
          <span>{s.screenId}</span>
          {s.ruleMismatch && <Badge tone="warning">규칙 불일치</Badge>}
        </span>
      ),
    },
    {
      id: "name",
      header: "이름",
      width: 240,
      cell: (s) => (
        <span
          className={`flex items-center gap-1.5 font-medium text-body-sm text-fg ${indent[Math.min(s.depth, indent.length - 1)]}`}
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
        </span>
      ),
    },
    {
      id: "type",
      header: "유형",
      width: 100,
      cell: (s) => (
        <span className="text-fg-muted">{screenTypeLabel[s.type]}</span>
      ),
    },
    {
      id: "description",
      header: "설명",
      width: 320,
      cell: (s) => <span className="text-fg-muted">{s.description}</span>,
    },
    ...(readOnly
      ? []
      : [
          {
            id: "actions",
            header: "",
            width: 48,
            cell: (s: TreeRow) => (
              <Menu.Root>
                <Menu.Trigger
                  render={
                    <IconButton
                      icon={MoreHorizontal}
                      label={`${s.name} 작업`}
                      size="sm"
                    />
                  }
                />
                <Menu.Popup align="end">
                  <Menu.Item onClick={() => setEditing(s)}>편집</Menu.Item>
                  <Menu.Separator />
                  <Menu.Item
                    icon={Trash2}
                    tone="danger"
                    disabled={s.childCount > 0}
                    onClick={() => setDeleting(s)}
                  >
                    삭제
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Root>
            ),
          },
        ]),
  ];

  return (
    <section aria-labelledby="screens-title" className="flex flex-col gap-3">
      <div className="flex min-h-8 flex-wrap items-center gap-2">
        <h2 id="screens-title" className="m-0 text-title-sm text-fg">
          화면
        </h2>
        <TextField
          size="sm"
          icon={Search}
          placeholder="화면 ID나 이름 검색"
          aria-label="화면 검색"
          className="w-64 max-w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="flex-1" />
        {!readOnly && (
          <>
            <Button size="sm" icon={Upload} onClick={() => setImporting(true)}>
              가져오기
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => setEditing("new")}
            >
              화면 추가
            </Button>
          </>
        )}
      </div>
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
          footer={
            !readOnly && (
              <IconButton
                icon={Plus}
                label="화면 추가"
                size="sm"
                onClick={() => setEditing("new")}
              />
            )
          }
        />
      )}
      <Dialog.Root
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <Dialog.Content size="sm">
          {editing && (
            <ScreenForm
              key={editing === "new" ? "new" : editing.id}
              projectId={projectId}
              screen={editing === "new" ? null : editing}
              screens={screens}
              rules={rules}
              pending={actions.create.isPending || actions.update.isPending}
              onSave={(input) => {
                const done = { onSuccess: () => setEditing(null) };
                if (editing === "new") actions.create.mutate(input, done);
                else actions.update.mutate({ id: editing.id, ...input }, done);
              }}
            />
          )}
        </Dialog.Content>
      </Dialog.Root>
      <ImportScreensDialog
        projectId={projectId}
        open={importing}
        onOpenChange={setImporting}
      />
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
            onSettled: () => setDeleting(null),
          })
        }
      />
    </section>
  );
}

function ScreenForm({
  projectId,
  screen,
  screens,
  rules,
  pending,
  onSave,
}: {
  projectId: string;
  /** 없으면 새 화면 */
  screen: TreeRow | null;
  screens: readonly Screen[];
  rules: ScreenIdRule[];
  pending: boolean;
  onSave: (input: ScreenInput) => void;
}) {
  const [draft, setDraft] = useState<ScreenInput>({
    screenId: screen?.screenId ?? "",
    name: screen?.name ?? "",
    type: screen?.type ?? "page",
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
      ...draft,
      screenId: draft.screenId.trim(),
      name: draft.name.trim(),
      description: draft.description.trim(),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="contents">
      <Dialog.Header title={screen ? screen.name : "새 화면"} />
      <Dialog.Body className="gap-4">
        {!screen && rules.length > 0 && (
          <NextIdPicker
            projectId={projectId}
            rules={rules}
            onNext={(screenId) => setDraft((d) => ({ ...d, screenId }))}
          />
        )}
        <TextField
          label="화면 ID"
          required
          maxLength={100}
          error={touched ? errors.screenId : undefined}
          value={draft.screenId}
          onChange={(e) => setDraft({ ...draft, screenId: e.target.value })}
        />
        <TextField
          label="이름"
          required
          autoFocus
          maxLength={200}
          error={touched ? errors.name : undefined}
          value={draft.name}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        />
        <Select
          label="유형"
          value={draft.type}
          items={typeItems}
          onValueChange={(t) =>
            setDraft({ ...draft, type: (t as ScreenType) ?? "page" })
          }
        />
        <Select
          label="상위 화면"
          value={draft.parentId ?? ""}
          items={parents}
          onValueChange={(id) => setDraft({ ...draft, parentId: id || null })}
        />
        <TextArea
          label="설명"
          rows={3}
          maxLength={2000}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button type="submit" variant="primary" loading={pending}>
          {screen ? "저장" : "추가"}
        </Button>
      </Dialog.Footer>
    </form>
  );
}

/**
 * 규칙과 앞부분 코드를 고르면 서버가 다음 번호를 붙인 ID를 돌려준다.
 * 번호 부분 앞의 코드 목록만 고르고, 고정값은 그대로다.
 */
function NextIdPicker({
  projectId,
  rules,
  onNext,
}: {
  projectId: string;
  rules: ScreenIdRule[];
  onNext: (screenId: string) => void;
}) {
  const [ruleId, setRuleId] = useState(rules[0]?.id ?? "");
  const rule = rules.find((r) => r.id === ruleId) ?? rules[0];
  const numberAt = rule ? rule.parts.findIndex((p) => p.kind === "number") : -1;
  const prefixParts = rule
    ? rule.parts.slice(0, numberAt < 0 ? rule.parts.length : numberAt)
    : [];
  const defaults = rule ? screenIdExampleParts(rule) : [];
  const [picked, setPicked] = useState<Record<string, string>>({});
  const prefix = prefixParts.map(
    (_p, i) => picked[`${rule?.id}:${i}`] ?? defaults[i] ?? "",
  );
  const next = useQuery({
    queryKey: ["next-screen-id", projectId, rule?.id, prefix],
    enabled: Boolean(rule) && numberAt >= 0,
    queryFn: async ({ signal }) =>
      (
        await sdk.getProjectNextScreenId({
          path: { projectId, ruleId: rule?.id ?? "" },
          query: { prefix: prefix.join(",") },
          signal,
          throwOnError: true,
        })
      ).data.screenId,
  });
  // 번호 부분이 없는 규칙은 고른 값을 이어 붙인 ID가 곧 제안이다
  const suggested =
    numberAt < 0
      ? prefix.join(rule?.separator ?? "")
      : (next.data ?? undefined);
  // 제안이 바뀔 때만 채운다. 같은 값을 다시 넣으면 입력 칸을 고치던 손을 덮는다.
  const last = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (suggested && suggested !== last.current) {
      last.current = suggested;
      onNext(suggested);
    }
  }, [suggested, onNext]);

  return (
    <div className="flex flex-wrap items-end gap-2">
      {rules.length > 1 && (
        <Select
          label="규칙"
          size="sm"
          className="w-40"
          value={ruleId}
          items={rules.map((r) => ({ value: r.id, label: r.name }))}
          onValueChange={(id) => {
            setRuleId(id ?? "");
            setPicked({});
          }}
        />
      )}
      {prefixParts.map((part, i) =>
        part.kind === "list" ? (
          <Select
            // 부분은 순서가 정체성이다. 규칙이 바뀌면 key도 바뀐다.
            // biome-ignore lint/suspicious/noArrayIndexKey: 부분에 식별자가 없다
            key={`${rule?.id}:${i}`}
            label={part.name}
            size="sm"
            className="w-36"
            value={prefix[i]}
            items={part.codes.map((c) => ({
              value: c.code,
              label: c.meaning ? `${c.code} ${c.meaning}` : c.code,
            }))}
            onValueChange={(code) =>
              setPicked({ ...picked, [`${rule?.id}:${i}`]: code ?? "" })
            }
          />
        ) : null,
      )}
    </div>
  );
}
