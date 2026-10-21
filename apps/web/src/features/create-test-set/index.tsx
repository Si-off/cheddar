import {
  Button,
  cn,
  FrameCard,
  RadioGroup,
  Select,
  Tag,
  TextArea,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { type SubmitEvent, useRef, useState } from "react";
import { tempUploadQuery } from "@/entities/generation";
import { can, type PermissionGrant } from "@/entities/permission";
import {
  fromTemplateDraft,
  projectsQuery,
  recentTemplateQuery,
  type TemplateDraft,
  templateQuery,
  toTemplateDraft,
} from "@/entities/project";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";
import { env } from "@/shared/config/env";
import { ColumnModal } from "./column-modal";

type TemplateKind = "project" | "recent" | "custom";

export interface CreateTestSetFormProps {
  /** 내 권한. 테스트 세트를 만들 수 있는 프로젝트만 고르게 한다. */
  permissions: readonly PermissionGrant[];
  /** Figma 플러그인에서 올린 프레임 묶음 */
  uploadId?: string;
  /** 플러그인에서 고른 프로젝트. 고를 수 없는 프로젝트면 무시한다. */
  initialProjectId?: string;
  /** 직접 작성이면 테스트 세트로, 생성이면 생성 진행 화면으로 간다 */
  /** confirmStart: 생성 시작 응답을 받지 못해 시작됐는지 확인이 필요하다 */
  onCreated: (
    testSetId: string,
    generating: boolean,
    confirmStart?: boolean,
  ) => void;
}

const thumbnail = (uploadId: string, frameId: string) =>
  `${env.apiBaseUrl}/api/v1/temp-uploads/${uploadId}/frames/${frameId}/thumbnail`;

/** 이름, 프로젝트, 프레임, 메모로 테스트 세트를 만든다. 프로젝트는 만든 뒤 바꿀 수 없다. */
export function CreateTestSetForm({
  permissions,
  uploadId,
  initialProjectId,
  onCreated,
}: CreateTestSetFormProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const projects = (useQuery(projectsQuery()).data ?? []).filter((p) =>
    can(permissions, "test_set.create", p.id),
  );
  const upload = useQuery({
    ...tempUploadQuery(uploadId ?? ""),
    enabled: Boolean(uploadId),
    meta: { quietCodes: ["NOT_FOUND"] },
  });
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [touched, setTouched] = useState(false);
  const [kind, setKind] = useState<TemplateKind>("project");
  // 직접 고른 열. 프로젝트를 바꾸면 그 프로젝트 양식에서 다시 시작한다.
  const [custom, setCustom] = useState<{
    projectId: string;
    draft: TemplateDraft;
  } | null>(null);
  const [picking, setPicking] = useState(false);
  // 올린 프레임은 모두 고른 상태에서 시작하고, 눌러서 뺀다
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const formRef = useRef<HTMLFormElement>(null);
  const chosen =
    projectId ??
    projects.find((p) => p.id === initialProjectId)?.id ??
    (projects.length === 1 ? projects[0]?.id : null);
  const frames = upload.data?.frames ?? [];
  const selectedFrames = frames.filter((f) => !excluded.has(f.id));
  const template = useQuery({
    ...templateQuery(chosen ?? ""),
    enabled: Boolean(chosen),
  }).data;
  const projectDraft = template ? toTemplateDraft(template) : null;
  const recent = useQuery({
    ...recentTemplateQuery(chosen ?? ""),
    enabled: Boolean(chosen),
  }).data;
  const customDraft =
    custom && custom.projectId === chosen ? custom.draft : projectDraft;
  const enabledNames = (draft: TemplateDraft | null) =>
    draft?.columns.filter((c) => c.enabled).map((c) => c.name) ?? [];
  const templateBody = () =>
    kind === "custom" && customDraft
      ? {
          kind: "custom" as const,
          columns: fromTemplateDraft(customDraft).columns,
        }
      : { kind: kind === "custom" ? ("project" as const) : kind };

  const create = useMutation({
    mutationFn: async (generate: boolean) => {
      const { data } = await sdk.createTestSet({
        body: {
          name: name.trim(),
          projectId: chosen ?? "",
          memo: memo.trim(),
          template: templateBody(),
        },
        throwOnError: true,
      });
      if (!generate)
        return { id: data.id, generating: false, confirmStart: false };
      try {
        await sdk.createGeneration({
          path: { testSetId: data.id },
          body: {
            kind: "initial",
            uploadId,
            // 전부 골랐으면 비워 서버 기본(전체)을 쓴다
            frameIds:
              excluded.size > 0 ? selectedFrames.map((f) => f.id) : undefined,
            memo: memo.trim(),
          },
          throwOnError: true,
        });
        return { id: data.id, generating: true, confirmStart: false };
      } catch (error) {
        // 응답을 받지 못했으면 시작됐을 수 있으니 진행 화면에서 확인한다(작업이 없으면 테스트 세트로 돌아간다)
        if (isApiFailure(error, "NETWORK")) {
          toast.show({
            message:
              "테스트 세트는 만들었습니다. 생성이 시작됐는지 진행 상황을 확인하세요.",
            tone: "danger",
          });
          return { id: data.id, generating: true, confirmStart: true };
        }
        toast.show({
          message: `테스트 세트는 만들었지만 생성을 시작하지 못했습니다. ${toApiFailure(error).message}`,
          tone: "danger",
        });
        return { id: data.id, generating: false, confirmStart: false };
      }
    },
    onSuccess: ({ id, generating, confirmStart }) => {
      void queryClient.invalidateQueries({
        predicate: (q) =>
          (q.queryKey[0] as { _id?: string } | undefined)?._id ===
          "listTestSets",
      });
      onCreated(id, generating, confirmStart);
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 테스트 세트 목록에서 만들어졌는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });

  const errors = {
    name: name.trim() ? undefined : "테스트 세트 이름을 입력하세요",
    project: chosen ? undefined : "프로젝트를 고르세요",
  };
  // 처음 생성은 고른 프레임이 있어야 한다. 설명만으로는 만든 뒤 케이스 추가 생성을 쓴다.
  const canGenerate = selectedFrames.length > 0;
  const submit = (generate: boolean) => {
    setTouched(true);
    if (!errors.name && !errors.project) {
      create.mutate(generate);
      return;
    }
    // 아래쪽 버튼을 누르면 위의 오류가 보이지 않으므로 첫 오류 칸으로 옮긴다
    requestAnimationFrame(() =>
      formRef.current
        ?.querySelector<HTMLElement>(
          "input[data-invalid]:not([aria-hidden]), button[data-invalid]",
        )
        ?.focus(),
    );
  };

  return (
    <form
      ref={formRef}
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        submit(canGenerate);
      }}
      noValidate
      className="flex flex-col gap-5"
    >
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <TextField
          label="테스트 세트 이름"
          required
          maxLength={100}
          counter={`${name.trim().length}/100`}
          error={touched ? errors.name : undefined}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          label="프로젝트"
          required
          placeholder="프로젝트 선택"
          description="만든 뒤에는 바꿀 수 없습니다"
          error={touched ? errors.project : undefined}
          value={chosen ?? null}
          items={projects.map((p) => ({ value: p.id, label: p.name }))}
          onValueChange={setProjectId}
        />
      </section>
      <section
        aria-labelledby="template-title"
        className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5"
      >
        <h2 id="template-title" className="m-0 text-title-sm text-fg">
          양식
        </h2>
        <RadioGroup
          aria-label="양식"
          value={kind}
          onValueChange={(v) => setKind(v as TemplateKind)}
          options={[
            {
              value: "project",
              label: "프로젝트 양식",
              description: <ColumnChips names={enabledNames(projectDraft)} />,
            },
            {
              value: "recent",
              label: recent?.testSet
                ? `최근 테스트 세트와 같게 · ${recent.testSet.name}`
                : "최근 테스트 세트와 같게",
              description: (
                <ColumnChips names={recent?.columns.map((c) => c.name) ?? []} />
              ),
            },
            {
              value: "custom",
              label: (
                <span className="flex flex-wrap items-center gap-3">
                  <span>직접 고르기</span>
                  {kind === "custom" && customDraft && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setPicking(true);
                      }}
                    >
                      열 고르기
                    </Button>
                  )}
                </span>
              ),
              description:
                kind === "custom" ? (
                  <ColumnChips names={enabledNames(customDraft)} />
                ) : undefined,
            },
          ]}
        />
      </section>
      <section
        aria-labelledby="frames-title"
        className="flex flex-col gap-3.5 rounded-lg border border-line bg-surface p-5"
      >
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 id="frames-title" className="m-0 text-title-sm text-fg">
            Figma 프레임
          </h2>
          {frames.length > 0 && (
            <>
              <span className="text-body-sm text-fg-muted tabular-nums">
                {frames.length}개 중 {selectedFrames.length}개 선택
              </span>
              <span className="flex-1" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setExcluded(
                    excluded.size === 0
                      ? new Set(frames.map((f) => f.id))
                      : new Set(),
                  )
                }
              >
                {excluded.size === 0 ? "전체 해제" : "전체 선택"}
              </Button>
            </>
          )}
        </div>
        {!uploadId ? (
          <p className="m-0 text-body-sm text-fg-muted">
            Figma 플러그인에서 프레임을 올리면 여기에 보입니다
          </p>
        ) : upload.isError && isApiFailure(upload.error, "NOT_FOUND") ? (
          <p className="m-0 text-body-sm text-fg-muted">
            올린 프레임을 찾을 수 없습니다. 플러그인에서 다시 올리세요.
          </p>
        ) : upload.isError ? (
          <div className="flex items-center gap-2">
            <p className="m-0 flex-1 text-body-sm text-fg-muted">
              프레임을 불러오지 못했습니다
            </p>
            <Button
              size="sm"
              loading={upload.isFetching}
              onClick={() => upload.refetch()}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          <ul className="m-0 grid list-none grid-cols-3 gap-x-2.5 gap-y-3 p-0 sm:grid-cols-5">
            {frames.map((f) => {
              const on = !excluded.has(f.id);
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setExcluded((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(f.id);
                        else next.delete(f.id);
                        return next;
                      })
                    }
                    className={cn(
                      "block w-full rounded-md border-0 bg-transparent p-0 text-left transition-opacity duration-fast",
                      !on && "opacity-45",
                    )}
                  >
                    <FrameCard
                      name={f.name}
                      selected={on}
                      imageSrc={
                        f.imageCount > 0 && uploadId
                          ? thumbnail(uploadId, f.id)
                          : undefined
                      }
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
        <TextArea
          label="메모"
          rows={4}
          maxLength={5000}
          placeholder="이번 배포에서 바뀐 점, 꼭 확인할 부분"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
      </section>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          loading={create.isPending && create.variables === false}
          disabled={create.isPending}
          onClick={() => submit(false)}
        >
          직접 작성
        </Button>
        <Button
          type="submit"
          variant="ai"
          icon={Sparkles}
          disabled={!canGenerate || create.isPending}
          loading={create.isPending && create.variables === true}
        >
          케이스 생성
        </Button>
      </div>
      {customDraft && chosen && (
        <ColumnModal
          open={picking}
          onOpenChange={setPicking}
          value={customDraft}
          onApply={(draft) => setCustom({ projectId: chosen, draft })}
        />
      )}
    </form>
  );
}

function ColumnChips({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1 pt-1">
      {names.map((n) => (
        <Tag key={n}>{n}</Tag>
      ))}
    </span>
  );
}
