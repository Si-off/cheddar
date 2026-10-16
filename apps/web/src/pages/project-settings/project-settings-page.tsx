import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Surface,
  Tabs,
  TabsContent,
} from "@cheddar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  createIaItem,
  deleteIaItem,
  getProject,
  getProjectTemplate,
  type IaItemDto,
  type IaPageDto,
  listIaItems,
  type ProjectDto,
  type ProjectTemplateDto,
  updateIaItem,
  updateProject,
  updateProjectTemplate,
} from "@/shared/api/generated";
import { IaEditor } from "./ia-editor";
import {
  type FieldErrors,
  iaForm,
  isDirty,
  orderedIa,
  projectForm,
  type SaveIssue,
  type SettingsDraft,
  sameValue,
  saveIssue,
  templateForm,
  validateDraft,
} from "./model";
import { ProjectInfoEditor } from "./project-info-editor";
import { TemplateEditor } from "./template-editor";

type Tab = SettingsDraft["kind"];
type Confirmation =
  | { kind: "delete" }
  | { kind: "column"; id: string }
  | { kind: "reload" }
  | null;

function newestRevision<T extends { revision: number }>(
  current: T | undefined,
  incoming: T,
): T {
  return current && current.revision > incoming.revision ? current : incoming;
}

export function ProjectSettingsPage({ projectId }: { projectId: string }) {
  return <SettingsEditor key={projectId} projectId={projectId} />;
}

function SettingsEditor({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const key = (kind: Tab) => ["project-settings", projectId, kind];
  const path = { projectId };
  const project = useQuery({
    queryKey: key("project"),
    queryFn: async ({ signal }) => {
      const data = (await getProject({ path, signal, throwOnError: true }))
        .data;
      return newestRevision(
        queryClient.getQueryData<ProjectDto>(key("project")),
        data,
      );
    },
  });
  const ia = useQuery({
    queryKey: key("ia"),
    queryFn: async ({ signal }) => {
      const data = (await listIaItems({ path, signal, throwOnError: true }))
        .data;
      const current = queryClient.getQueryData<IaPageDto>(key("ia"));
      return {
        ...data,
        items: data.items.map((item) =>
          newestRevision(
            current?.items.find((entry) => entry.id === item.id),
            item,
          ),
        ),
      };
    },
  });
  const template = useQuery({
    queryKey: key("template"),
    queryFn: async ({ signal }) => {
      const data = (
        await getProjectTemplate({ path, signal, throwOnError: true })
      ).data;
      return newestRevision(
        queryClient.getQueryData<ProjectTemplateDto>(key("template")),
        data,
      );
    },
  });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [issue, setIssue] = useState<SaveIssue | null>(null);
  const [notice, setNotice] = useState("");
  const [latest, setLatest] = useState<{ draft: SettingsDraft | null } | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [lastAction, setLastAction] = useState<"save" | "delete">("save");
  const form = useRef<HTMLFormElement>(null);
  const dirty = isDirty(draft);
  const editingDisabled = saving || issue?.kind === "uncertain";
  const blocker = useBlocker({
    shouldBlockFn: () => dirty || saving,
    enableBeforeUnload: dirty || saving,
    withResolver: true,
  });

  useEffect(() => {
    if (!draft && project.data)
      setDraft({
        kind: "project",
        base: project.data,
        value: projectForm(project.data),
      });
  }, [draft, project.data]);

  useEffect(() => {
    if (
      !draft ||
      saving ||
      issue?.kind === "conflict" ||
      issue?.kind === "uncertain"
    )
      return;
    let next: SettingsDraft | null = null;
    if (draft.kind === "project" && project.data && !project.isError)
      next = {
        kind: "project",
        base: project.data,
        value: projectForm(project.data),
      };
    if (draft.kind === "template" && template.data && !template.isError)
      next = {
        kind: "template",
        base: template.data,
        value: templateForm(template.data),
      };
    if (draft.kind === "ia" && draft.base && ia.data && !ia.isError) {
      const item = ia.data.items.find((entry) => entry.id === draft.base?.id);
      if (!item) {
        setIssue(saveIssue({ error: { code: "NOT_FOUND" } }));
        return;
      }
      next = { kind: "ia", base: item, value: iaForm(item) };
    }
    if (!next || (next.base?.revision ?? 0) <= (draft.base?.revision ?? 0))
      return;
    if (dirty) setIssue(saveIssue({ error: { code: "REVISION_CONFLICT" } }));
    else setDraft(next);
  }, [
    draft,
    dirty,
    saving,
    issue,
    project.data,
    project.isError,
    template.data,
    template.isError,
    ia.data,
    ia.isError,
  ]);

  function replace(next: SettingsDraft) {
    setDraft(next);
    setErrors({});
    setIssue(null);
    setLatest(null);
    setNotice("");
  }
  function edit(next: SettingsDraft) {
    setDraft(next);
    setErrors({});
    setNotice("");
    if (issue?.kind === "validation" || issue?.kind === "reference")
      setIssue(null);
  }
  function chooseIa(item: IaItemDto | null) {
    const current = item
      ? (queryClient
          .getQueryData<IaPageDto>(key("ia"))
          ?.items.find((entry) => entry.id === item.id) ?? item)
      : null;
    replace({ kind: "ia", base: current, value: iaForm(current) });
  }
  function selectTab(tab: Tab) {
    const currentProject = queryClient.getQueryData<ProjectDto>(key("project"));
    const currentTemplate = queryClient.getQueryData<ProjectTemplateDto>(
      key("template"),
    );
    const currentIa = queryClient.getQueryData<IaPageDto>(key("ia"));
    if (tab === "project" && currentProject)
      replace({
        kind: "project",
        base: currentProject,
        value: projectForm(currentProject),
      });
    else if (tab === "template" && currentTemplate)
      replace({
        kind: "template",
        base: currentTemplate,
        value: templateForm(currentTemplate),
      });
    else if (tab === "ia")
      chooseIa(orderedIa(currentIa?.items ?? [])[0]?.item ?? null);
  }
  function transition(action: () => void) {
    if (saving) return;
    if (dirty) setPendingAction(() => action);
    else action();
  }
  function cancelTransition() {
    setPendingAction(null);
    if (blocker.status === "blocked") blocker.reset();
  }
  function finishTransition() {
    const action = pendingAction;
    setPendingAction(null);
    if (blocker.status === "blocked") blocker.proceed();
    else action?.();
  }
  async function acceptSaved(next: SettingsDraft) {
    await queryClient.cancelQueries({ queryKey: key(next.kind), exact: true });
    setDraft(next);
    setErrors({});
    setIssue(null);
    setLatest(null);
    setNotice("저장됨");
    if (next.kind === "project")
      queryClient.setQueryData<ProjectDto>(key("project"), (current) =>
        newestRevision(current, next.base),
      );
    if (next.kind === "template")
      queryClient.setQueryData<ProjectTemplateDto>(key("template"), (current) =>
        newestRevision(current, next.base),
      );
    if (next.kind === "ia" && next.base) {
      const item = next.base;
      queryClient.setQueryData<IaPageDto>(key("ia"), (current) => ({
        items: [
          ...(current?.items ?? []).filter((entry) => entry.id !== item.id),
          newestRevision(
            current?.items.find((entry) => entry.id === item.id),
            item,
          ),
        ],
      }));
      void queryClient.invalidateQueries({ queryKey: key("ia") });
    }
  }

  async function save(): Promise<boolean> {
    if (
      !draft ||
      saving ||
      issue?.kind === "conflict" ||
      issue?.kind === "uncertain"
    )
      return false;
    const invalid = validateDraft(draft);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      requestAnimationFrame(() =>
        form.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus(),
      );
      return false;
    }
    setSaving(true);
    setIssue(null);
    setLastAction("save");
    setLatest(null);
    try {
      if (draft.kind === "project") {
        const data = (
          await updateProject({
            path,
            body: {
              expectedRevision: draft.base.revision,
              name: draft.value.name.trim(),
              description: draft.value.description || null,
            },
            throwOnError: true,
          })
        ).data;
        await acceptSaved({
          kind: "project",
          base: data,
          value: projectForm(data),
        });
      } else if (draft.kind === "ia") {
        const body = {
          screenId: draft.value.screenId.trim(),
          name: draft.value.name.trim(),
          description: draft.value.description || null,
          parentId: draft.value.parentId || null,
          position: Number(draft.value.position),
        };
        const data = draft.base
          ? (
              await updateIaItem({
                path: { ...path, itemId: draft.base.id },
                body: { ...body, expectedRevision: draft.base.revision },
                throwOnError: true,
              })
            ).data
          : (await createIaItem({ path, body, throwOnError: true })).data;
        await acceptSaved({ kind: "ia", base: data, value: iaForm(data) });
      } else {
        const data = (
          await updateProjectTemplate({
            path,
            body: {
              expectedRevision: draft.base.revision,
              columns: draft.value.columns,
              view: draft.value.view.map((entry) => ({
                ...entry,
                width: Number(entry.width),
              })),
            },
            throwOnError: true,
          })
        ).data;
        await acceptSaved({
          kind: "template",
          base: data,
          value: templateForm(data),
        });
      }
      return true;
    } catch (error) {
      const problem = saveIssue(error);
      setIssue(problem);
      if (problem.field) {
        setErrors({ [problem.field]: problem.message });
        requestAnimationFrame(() =>
          form.current
            ?.querySelector<HTMLElement>('[aria-invalid="true"]')
            ?.focus(),
        );
      }
      if (problem.field === "parentId")
        void queryClient.invalidateQueries({ queryKey: key("ia") });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function removeIa() {
    if (draft?.kind !== "ia" || !draft.base || saving) return;
    const target = draft.base;
    setSaving(true);
    setLastAction("delete");
    setIssue(null);
    setLatest(null);
    try {
      await deleteIaItem({
        path: { ...path, itemId: target.id },
        query: { expectedRevision: target.revision },
        throwOnError: true,
      });
      await queryClient.cancelQueries({ queryKey: key("ia"), exact: true });
      chooseIa(null);
      setNotice("삭제됨");
      await queryClient.invalidateQueries({ queryKey: key("ia") });
    } catch (error) {
      setIssue(saveIssue(error));
    } finally {
      setSaving(false);
      setConfirmation(null);
    }
  }

  async function checkSaved() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      let next: SettingsDraft | null;
      if (draft.kind === "project") {
        const received = (await getProject({ path, throwOnError: true })).data;
        const data = newestRevision(
          queryClient.getQueryData<ProjectDto>(key("project")),
          received,
        );
        queryClient.setQueryData(key("project"), data);
        next = { kind: "project", base: data, value: projectForm(data) };
      } else if (draft.kind === "template") {
        const received = (
          await getProjectTemplate({ path, throwOnError: true })
        ).data;
        const data = newestRevision(
          queryClient.getQueryData<ProjectTemplateDto>(key("template")),
          received,
        );
        queryClient.setQueryData(key("template"), data);
        next = { kind: "template", base: data, value: templateForm(data) };
      } else {
        const data = (await listIaItems({ path, throwOnError: true })).data;
        queryClient.setQueryData(key("ia"), data);
        const saved = draft.base
          ? data.items.find((item) => item.id === draft.base?.id)
          : data.items.find(
              (item) => item.screenId === draft.value.screenId.trim(),
            );
        next = saved ? { kind: "ia", base: saved, value: iaForm(saved) } : null;
      }
      if (issue?.kind === "uncertain") {
        if (lastAction === "delete" && !next) {
          chooseIa(null);
          setNotice("삭제된 것을 확인했습니다.");
          return;
        }
        const expected =
          draft.kind === "template"
            ? {
                ...draft.value,
                columns: draft.value.columns.map((column) => ({
                  ...column,
                  name: column.name.trim(),
                })),
                view: draft.value.view.map((entry) => ({
                  ...entry,
                  width: String(Number(entry.width)),
                })),
              }
            : draft.kind === "project"
              ? { ...draft.value, name: draft.value.name.trim() }
              : {
                  ...draft.value,
                  name: draft.value.name.trim(),
                  screenId: draft.value.screenId.trim(),
                  position: String(Number(draft.value.position)),
                };
        if (lastAction === "save" && next && sameValue(expected, next.value)) {
          await acceptSaved(next);
          return;
        }
        if (
          (draft.kind === "ia" && !draft.base && !next) ||
          next?.base?.revision === draft.base?.revision
        ) {
          setIssue({
            kind: "validation",
            message:
              lastAction === "delete"
                ? "아직 삭제되지 않았습니다. 다시 삭제할 수 있습니다."
                : "입력한 내용이 저장되지 않았습니다. 다시 저장해주세요.",
          });
        } else
          setIssue({
            kind: "conflict",
            message:
              "저장 내용이 달라졌습니다. 입력은 유지됩니다. 최신 내용을 확인해주세요.",
          });
      }
      setLatest({ draft: next });
    } catch {
      setNotice("");
      setIssue({
        kind: "uncertain",
        message:
          "저장 내용을 불러오지 못했습니다. 연결을 확인한 뒤 다시 확인해주세요.",
      });
    } finally {
      setSaving(false);
    }
  }

  function discardAndReload() {
    if (latest?.draft) replace(latest.draft);
    else if (draft?.kind === "ia") chooseIa(null);
    setConfirmation(null);
  }

  const loading = project.isPending || ia.isPending || template.isPending;
  const failed =
    (project.isError && !project.data) ||
    (ia.isError && !ia.data) ||
    (template.isError && !template.data);
  if (failed)
    return (
      <Surface>
        <p role="alert">프로젝트 설정을 불러오지 못했습니다.</p>
        <Button
          variant="outline"
          onClick={() => {
            void project.refetch();
            void ia.refetch();
            void template.refetch();
          }}
        >
          다시 불러오기
        </Button>
      </Surface>
    );

  if (loading || !draft)
    return <p role="status">프로젝트 설정을 불러오는 중…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-label text-muted">{project.data?.name}</p>
        <h1 className="text-title font-heading">프로젝트 설정</h1>
      </div>
      {(project.isError || ia.isError || template.isError) && (
        <div className="space-y-3 rounded-panel border border-border bg-warning-subtle p-4">
          <p role="alert" className="text-label">
            설정을 갱신하지 못해 이전에 불러온 내용을 표시하고 있습니다.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void project.refetch();
              void ia.refetch();
              void template.refetch();
            }}
          >
            다시 불러오기
          </Button>
        </div>
      )}
      <Tabs
        value={draft.kind}
        onValueChange={(value) => transition(() => selectTab(value as Tab))}
      >
        <div className="workspace-settings-selector">
          <label htmlFor="settings-section" className="sr-only">
            설정 항목
          </label>
          <select
            id="settings-section"
            className="sheet-select"
            value={draft.kind}
            disabled={saving}
            onChange={(event) => {
              const next = event.target.value as Tab;
              transition(() => selectTab(next));
            }}
          >
            <option value="project">기본 정보</option>
            <option value="ia">IA 관리</option>
            <option value="template">기본 양식</option>
          </select>
        </div>
        <form
          ref={form}
          className="mt-6 space-y-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TabsContent value="project">
            <Surface>
              {draft.kind === "project" && (
                <ProjectInfoEditor
                  value={draft.value}
                  errors={errors}
                  disabled={editingDisabled}
                  onChange={(value) => edit({ ...draft, value })}
                />
              )}
            </Surface>
          </TabsContent>
          <TabsContent value="ia">
            {draft.kind === "ia" && (
              <IaEditor
                items={ia.data?.items ?? []}
                selected={draft.base}
                value={draft.value}
                onChange={(value) => edit({ ...draft, value })}
                onSelect={(item) => transition(() => chooseIa(item))}
                onDelete={() => setConfirmation({ kind: "delete" })}
                disabled={editingDisabled}
                errors={errors}
              />
            )}
          </TabsContent>
          <TabsContent value="template">
            <Surface>
              {draft.kind === "template" && (
                <TemplateEditor
                  value={draft.value}
                  errors={errors}
                  disabled={editingDisabled}
                  onChange={(value) => edit({ ...draft, value })}
                  onRemove={(id) => setConfirmation({ kind: "column", id })}
                />
              )}
            </Surface>
          </TabsContent>
          {issue && !Object.values(errors).includes(issue.message) && (
            <div className="space-y-3 rounded-panel border border-border bg-warning-subtle p-4">
              <p role="alert" className="text-label">
                {issue.message}
              </p>
              {(issue.kind === "conflict" || issue.kind === "uncertain") && (
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => void checkSaved()}
                >
                  {issue.kind === "conflict"
                    ? "최신 저장 내용 확인"
                    : "저장 결과 확인"}
                </Button>
              )}
            </div>
          )}
          {latest && (
            <Surface className="space-y-4">
              <h2 className="text-heading font-heading">최신 저장 내용</h2>
              <Snapshot draft={latest.draft} items={ia.data?.items ?? []} />
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => setConfirmation({ kind: "reload" })}
              >
                입력 버리고 불러오기
              </Button>
            </Surface>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <p role="status" className="mr-auto text-label text-muted">
              {saving
                ? "저장 중…"
                : dirty
                  ? "저장하지 않은 변경사항이 있습니다"
                  : notice ||
                    (draft.kind === "ia" && !draft.base ? "" : "저장됨")}
            </p>
            <Button
              variant="outline"
              disabled={!dirty || saving}
              onClick={() => transition(() => selectTab(draft.kind))}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={
                !dirty ||
                saving ||
                issue?.kind === "conflict" ||
                issue?.kind === "uncertain"
              }
            >
              저장
            </Button>
          </div>
        </form>
      </Tabs>
      <Dialog
        open={!!pendingAction || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) cancelTransition();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>변경사항을 저장할까요?</DialogTitle>
            <DialogDescription>
              저장하지 않고 이동하면 편집 중인 내용이 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={cancelTransition}
            >
              계속 편집
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={finishTransition}
            >
              버리고 이동
            </Button>
            <Button
              disabled={
                saving ||
                (!!issue &&
                  (issue.kind === "conflict" || issue.kind === "uncertain"))
              }
              onClick={async () => {
                if (await save()) finishTransition();
                else cancelTransition();
              }}
            >
              저장하고 이동
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !saving) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.kind === "delete"
                ? `${draft.kind === "ia" ? draft.base?.screenId : ""}을(를) 삭제할까요?`
                : confirmation?.kind === "column"
                  ? `‘${draft.kind === "template" ? draft.value.columns.find((column) => column.id === confirmation.id)?.name : ""}’ 열을 삭제할까요?`
                  : "편집 중인 내용을 버릴까요?"}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.kind === "delete"
                ? "IA 항목을 삭제합니다. 저장하지 않은 편집 내용도 사라집니다."
                : confirmation?.kind === "column"
                  ? "기본 양식에서 열을 삭제합니다. 기존 시트에는 영향을 주지 않습니다."
                  : "최신 저장 내용을 불러옵니다. 현재 입력은 사라집니다."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setConfirmation(null)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={saving}
              onClick={() => {
                if (confirmation?.kind === "delete") void removeIa();
                else if (
                  confirmation?.kind === "column" &&
                  draft.kind === "template"
                ) {
                  const id = confirmation.id;
                  edit({
                    ...draft,
                    value: {
                      columns: draft.value.columns.filter(
                        (column) => column.id !== id,
                      ),
                      view: draft.value.view.filter(
                        (entry) => entry.columnId !== id,
                      ),
                    },
                  });
                  setConfirmation(null);
                } else discardAndReload();
              }}
            >
              {confirmation?.kind === "reload" ? "버리고 불러오기" : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Snapshot({
  draft,
  items,
}: {
  draft: SettingsDraft | null;
  items: IaItemDto[];
}) {
  if (!draft)
    return <p className="text-label">해당 IA 항목을 찾을 수 없습니다.</p>;
  if (draft.kind === "template")
    return (
      <ol className="space-y-2 text-label">
        {draft.value.view.map((entry) => (
          <li key={entry.columnId}>
            {
              draft.value.columns.find((column) => column.id === entry.columnId)
                ?.name
            }{" "}
            · {entry.width}px
          </li>
        ))}
      </ol>
    );
  return (
    <dl className="space-y-2 text-label">
      {draft.kind === "ia" && (
        <>
          <dt className="text-muted">화면 ID</dt>
          <dd className="break-all">{draft.value.screenId}</dd>
        </>
      )}
      <dt className="text-muted">이름</dt>
      <dd className="break-all">{draft.value.name}</dd>
      <dt className="text-muted">설명</dt>
      <dd className="whitespace-pre-wrap break-words">
        {draft.value.description || "—"}
      </dd>
      {draft.kind === "ia" && (
        <>
          <dt className="text-muted">상위 항목</dt>
          <dd>
            {items.find((item) => item.id === draft.value.parentId)?.screenId ??
              "없음"}
          </dd>
          <dt className="text-muted">순서</dt>
          <dd>{draft.value.position}</dd>
        </>
      )}
    </dl>
  );
}
