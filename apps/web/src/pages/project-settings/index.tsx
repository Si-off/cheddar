import {
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { Banner, Button, LoadError, SaveStatus } from "@workspace/ui";
import { type ReactNode, useState } from "react";
import {
  featureGroupsQuery,
  fromTemplateDraft,
  memoQuery,
  type Project,
  projectQuery,
  screenIdRulesQuery,
  screensQuery,
  type Template,
  type TemplateDraft,
  templateQuery,
  toTemplateDraft,
} from "@/entities/project";
import { MemoEditor } from "@/features/edit-project-memo";
import { FeatureGroupsEditor } from "@/features/manage-feature-groups";
import { ScreenIdRulesEditor } from "@/features/manage-screen-id-rules";
import { ScreensEditor } from "@/features/manage-screens";
import { useSaveTemplate } from "@/features/manage-template-columns";
import { ColumnPicker } from "@/widgets/column-picker";
import { ProjectShell } from "@/widgets/project-shell";

/** 프로젝트와 탭 내용을 함께 불러온다. 둘 중 하나라도 실패하면 다시 시도를 보여준다. */
function SettingsFrame<T>({
  projectId,
  content,
  title,
  children,
}: {
  projectId: string;
  content: UseQueryResult<T>;
  /** 불러오지 못했을 때 */
  title: string;
  children: (project: Project, data: T) => ReactNode;
}) {
  const project = useQuery(projectQuery(projectId));
  if (project.isError)
    return (
      <main className="mx-auto w-full max-w-7xl px-8 py-6">
        <LoadError
          title="프로젝트를 불러오지 못했습니다"
          onRetry={() => project.refetch()}
        />
      </main>
    );
  if (!project.data) return null;
  if (content.isError)
    return (
      <ProjectShell project={project.data}>
        <LoadError title={title} onRetry={() => content.refetch()} />
      </ProjectShell>
    );
  if (content.data === undefined)
    return <ProjectShell project={project.data}>{null}</ProjectShell>;
  return children(project.data, content.data);
}

export function ProjectTemplatePage({ projectId }: { projectId: string }) {
  const template = useQuery(templateQuery(projectId));
  return (
    <SettingsFrame
      projectId={projectId}
      content={template}
      title="양식을 불러오지 못했습니다"
    >
      {(project, data) => (
        <TemplateSettings project={project} template={data} />
      )}
    </SettingsFrame>
  );
}

const sameColumns = (draft: TemplateDraft, template: Template) =>
  JSON.stringify(fromTemplateDraft(draft).columns) ===
  JSON.stringify(template.columns);

function TemplateSettings({
  project,
  template,
}: {
  project: Project;
  /** 서버의 최신 양식 */
  template: Template;
}) {
  const queryClient = useQueryClient();
  // 편집을 시작한 양식. 입력 중에는 서버 양식이 바뀌어도 입력을 바꾸지 않는다.
  const [base, setBase] = useState(template);
  const [draft, setDraft] = useState(() => toTemplateDraft(template));
  const [outdated, setOutdated] = useState(false);
  const save = useSaveTemplate(project.id, {
    // 저장하는 동안 더 고친 내용은 남긴다
    onSaved: (saved) => {
      setBase(saved);
      setDraft((current) => ({ ...current, revision: saved.revision }));
    },
    onConflict: () => setOutdated(true),
  });
  const readOnly = !project.canManage;
  const dirty = !sameColumns(draft, base);

  if (template.revision !== base.revision && !save.isPending) {
    if (!dirty) {
      setBase(template);
      setDraft(toTemplateDraft(template));
    } else if (template.revision > base.revision && !outdated) {
      setOutdated(true);
    }
  }

  useBlocker({
    shouldBlockFn: () =>
      dirty &&
      !save.isPending &&
      !window.confirm("저장하지 않은 변경이 있습니다. 이 화면을 나갈까요?"),
    enableBeforeUnload: () => dirty,
  });

  const reset = (next: Template) => {
    setBase(next);
    setDraft(toTemplateDraft(next));
    setOutdated(false);
  };
  const loadLatest = () =>
    queryClient
      .fetchQuery({ ...templateQuery(project.id), staleTime: 0 })
      .then(reset)
      .catch(() => undefined);

  const submit = () => save.mutate(draft);

  const actions = !readOnly && (
    <>
      <SaveStatus
        state={save.isPending ? "saving" : dirty ? "dirty" : "saved"}
      />
      <Button
        variant="ghost"
        disabled={!dirty || save.isPending}
        onClick={() => reset(base)}
      >
        변경 취소
      </Button>
      <Button
        variant="primary"
        disabled={!dirty}
        loading={save.isPending}
        onClick={submit}
      >
        저장
      </Button>
    </>
  );

  return (
    <ProjectShell project={project} actions={actions || undefined}>
      {outdated && (
        <Banner
          tone="warning"
          title="저장된 양식이 바뀌었습니다"
          actions={
            <Button size="sm" onClick={loadLatest}>
              최신 양식 불러오기
            </Button>
          }
        >
          최신 양식을 불러오면 지금 입력한 내용은 사라집니다.
        </Banner>
      )}
      <ColumnPicker
        value={draft}
        onChange={setDraft}
        readOnly={readOnly}
        className="max-w-4xl"
      />
    </ProjectShell>
  );
}

export function ProjectFeatureGroupsPage({ projectId }: { projectId: string }) {
  const groups = useQuery(featureGroupsQuery(projectId));
  return (
    <SettingsFrame
      projectId={projectId}
      content={groups}
      title="기능 그룹을 불러오지 못했습니다"
    >
      {(project, data) => (
        <ProjectShell project={project}>
          <FeatureGroupsEditor
            projectId={projectId}
            groups={data}
            readOnly={!project.canManage}
          />
        </ProjectShell>
      )}
    </SettingsFrame>
  );
}

export function ProjectScreensPage({ projectId }: { projectId: string }) {
  const screens = useQuery(screensQuery(projectId));
  const rules = useQuery(screenIdRulesQuery(projectId));
  return (
    <SettingsFrame
      projectId={projectId}
      content={screens}
      title="화면 구조를 불러오지 못했습니다"
    >
      {(project, data) => (
        <ProjectShell project={project}>
          <div className="flex flex-col gap-8">
            <ScreenIdRulesEditor
              projectId={projectId}
              rules={rules.data ?? []}
              readOnly={!project.canManage}
            />
            <ScreensEditor
              projectId={projectId}
              screens={data}
              rules={rules.data}
              readOnly={!project.canManage}
            />
          </div>
        </ProjectShell>
      )}
    </SettingsFrame>
  );
}

export function ProjectMemoPage({ projectId }: { projectId: string }) {
  const memo = useQuery(memoQuery(projectId));
  return (
    <SettingsFrame
      projectId={projectId}
      content={memo}
      title="메모를 불러오지 못했습니다"
    >
      {(project, data) => (
        <ProjectShell project={project}>
          <MemoEditor
            projectId={projectId}
            memo={data}
            readOnly={!project.canManage}
          />
        </ProjectShell>
      )}
    </SettingsFrame>
  );
}
