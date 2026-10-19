import {
  Button,
  Checkbox,
  Dialog,
  IconButton,
  Popover,
  RadioGroup,
  Select,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Copy, Info, Plus, Search, X } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { type Account, type Assignment, expiryToApi } from "@/entities/account";
import { affiliationsQuery } from "@/entities/affiliation";
import { permissionCatalog } from "@/entities/permission";
import { projectsQuery } from "@/entities/project";
import { expiryRequirement, type Role, rolesQuery } from "@/entities/role";
import { sdk, toApiFailure } from "@/shared/api";
import { appLinks } from "@/shared/config/links";

export interface AccountDraft {
  name: string;
  email: string;
  affiliationId: string;
  assignments: Assignment[];
  /** YYYY-MM-DD */
  expiresOn: string | null;
  /** 역할의 기본 기간으로 채운 값이면 true. 역할이 바뀌면 다시 계산한다. */
  expiryAuto: boolean;
}

export const emptyAccountDraft: AccountDraft = {
  name: "",
  email: "",
  affiliationId: "",
  assignments: [],
  expiresOn: null,
  expiryAuto: false,
};

export function draftFromAccount(account: Account): AccountDraft {
  return {
    name: account.name,
    email: account.email,
    affiliationId: account.affiliation.id,
    assignments: account.assignments.map((a) => ({
      ...a,
      projectIds: [...a.projectIds],
    })),
    expiresOn: account.expiresOn,
    expiryAuto: false,
  };
}

type DraftErrors = Partial<
  Record<"name" | "email" | "affiliationId" | "expiresOn", string>
>;

function validate(draft: AccountDraft, roles: readonly Role[]): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = "이름을 입력하세요";
  if (!/^\S+@\S+\.\S+$/.test(draft.email.trim()))
    errors.email = "이메일 형식이 아닙니다";
  if (!draft.affiliationId) errors.affiliationId = "소속을 고르세요";
  const roleIds = draft.assignments.map((a) => a.roleId);
  if (expiryRequirement(roles, roleIds) && !draft.expiresOn)
    errors.expiresOn = "만료일을 입력하세요";
  return errors;
}

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const globalOnlyLabels = new Map(
  permissionCatalog.filter((p) => p.globalOnly).map((p) => [p.key, p.label]),
);

export interface AccountFormProps {
  value: AccountDraft;
  onChange: (next: AccountDraft) => void;
  /** 수정 화면에서는 이메일(로그인 ID)을 바꾸지 않는다 */
  mode: "create" | "edit";
  errors?: DraftErrors;
}

/** 이름, 이메일, 소속, 만료일, 역할 할당을 입력한다. 할당된 역할이 만료일을 요구하면 만료일이 필수가 된다. */
export function AccountForm({
  value,
  onChange,
  mode,
  errors = {},
}: AccountFormProps) {
  const roles = useQuery(rolesQuery()).data ?? [];
  const affiliations = useQuery(affiliationsQuery()).data ?? [];
  const assignable = roles.filter((role) => !role.fixed);
  const requirement = expiryRequirement(
    roles,
    value.assignments.map((a) => a.roleId),
  );

  const setAssignments = (assignments: Assignment[]) => {
    const next = { ...value, assignments };
    const nextRequirement = expiryRequirement(
      roles,
      assignments.map((a) => a.roleId),
    );
    // 직접 고른 날짜는 그대로 두고, 비었거나 자동으로 채운 날짜만 현재 역할에 맞춘다
    if (!value.expiresOn || value.expiryAuto) {
      const days = nextRequirement?.defaultDays ?? null;
      next.expiresOn = days ? addDays(days) : null;
      next.expiryAuto = days !== null;
    }
    onChange(next);
  };
  const updateRow = (index: number, patch: Partial<Assignment>) =>
    setAssignments(
      value.assignments.map((a, i) => (i === index ? { ...a, ...patch } : a)),
    );

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label="이름"
          required
          value={value.name}
          error={errors.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
        <TextField
          label="이메일"
          type="email"
          required
          readOnly={mode === "edit"}
          value={value.email}
          error={errors.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
        <Select
          label="소속"
          required
          placeholder="소속 선택"
          value={value.affiliationId || null}
          error={errors.affiliationId}
          items={affiliations.map((a) => ({ value: a.id, label: a.name }))}
          onValueChange={(id) =>
            onChange({ ...value, affiliationId: id ?? "" })
          }
        />
        <TextField
          label="만료일"
          type="date"
          required={Boolean(requirement)}
          value={value.expiresOn ?? ""}
          error={errors.expiresOn}
          onChange={(e) =>
            onChange({
              ...value,
              expiresOn: e.target.value || null,
              expiryAuto: false,
            })
          }
        />
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className="mb-1.5 text-label text-fg">역할</legend>
        {value.assignments.map((assignment, index) => {
          const role = roles.find((r) => r.id === assignment.roleId);
          const skipped =
            assignment.scope === "projects" && role
              ? role.permissions
                  .filter((p) => globalOnlyLabels.has(p))
                  .map((p) => globalOnlyLabels.get(p))
              : [];
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: 같은 역할을 범위만 달리해 여러 번 할당할 수 있어 위치가 식별자다
            <div key={index} className="flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <Select
                  aria-label="역할"
                  className="min-w-0 flex-1"
                  value={assignment.roleId}
                  items={assignable.map((r) => ({
                    value: r.id,
                    label: r.name,
                  }))}
                  onValueChange={(roleId) =>
                    roleId && updateRow(index, { roleId })
                  }
                />
                <ScopePicker
                  scope={assignment.scope}
                  projectIds={assignment.projectIds}
                  onChange={(scope, projectIds) =>
                    updateRow(index, { scope, projectIds })
                  }
                />
                <IconButton
                  icon={X}
                  label="역할 할당 제거"
                  onClick={() =>
                    setAssignments(
                      value.assignments.filter((_, i) => i !== index),
                    )
                  }
                />
              </div>
              {skipped.length > 0 && (
                <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
                  <Info size={14} strokeWidth={1.75} aria-hidden />
                  적용 안 됨: {skipped.join(", ")}
                </span>
              )}
            </div>
          );
        })}
        <div>
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            disabled={assignable.length === 0}
            onClick={() =>
              setAssignments([
                ...value.assignments,
                {
                  roleId: assignable[0]?.id ?? "",
                  scope: "global",
                  projectIds: [],
                },
              ])
            }
          >
            역할 추가
          </Button>
        </div>
      </fieldset>
    </div>
  );
}

function toApiAssignments(assignments: readonly Assignment[]) {
  return assignments
    .filter((a) => a.roleId)
    .map((a) => ({
      roleId: a.roleId,
      scope: a.scope,
      projectIds: a.scope === "global" ? [] : a.projectIds,
    }));
}

/** 계정 목록과 상세를 함께 새로 고친다. */
function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return (accountId?: string) =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as { _id?: string } | undefined;
        // 내 계정의 역할 할당이 바뀌었을 수 있으므로 내 정보도 다시 읽는다
        return (
          key?._id === "listAccounts" ||
          (accountId !== undefined &&
            (key?._id === "getAccount" || key?._id === "getMe"))
        );
      },
    });
}

export interface IssuedLink {
  kind: "invite" | "reset";
  name: string;
  token: string;
}

/** 계정 하나에 대한 작업 */
export function useAccountActions(
  accountId: string,
  onLinkIssued: (link: IssuedLink) => void,
) {
  const toast = useToast();
  const invalidate = useInvalidateAccounts();
  const failed = (unknownResult: string) => (error: unknown) =>
    toast.show({
      message: toApiFailure(error, { unknownResult }).message,
      tone: "danger",
    });
  // 저장과 상태 변경은 새로 고치면 결과가 보인다. 링크는 서버에 남지 않으므로 다시 발급해야 한다.
  const onError = failed(
    "응답을 받지 못했습니다. 새로 고쳐 저장됐는지 확인하세요.",
  );
  const onLinkError = failed("응답을 받지 못했습니다. 링크를 다시 발급하세요.");
  const path = { path: { accountId }, throwOnError: true as const };

  const update = useMutation({
    mutationFn: ({
      draft,
      original,
    }: {
      draft: AccountDraft;
      original: Account;
    }) =>
      sdk.updateAccount({
        ...path,
        body: {
          name: draft.name.trim(),
          affiliationId: draft.affiliationId,
          assignments: toApiAssignments(draft.assignments),
          // 날짜 칸은 시각을 버리므로, 날짜를 바꾸지 않았으면 서버의 만료 시각을 그대로 둔다
          expiresAt:
            draft.expiresOn === original.expiresOn
              ? undefined
              : expiryToApi(draft.expiresOn),
        },
      }),
    onSuccess: () => {
      toast.show({ message: "저장했습니다", tone: "success" });
      return invalidate(accountId);
    },
    onError,
  });
  const deactivate = useMutation({
    mutationFn: () => sdk.deactivateAccount(path),
    onSuccess: () => invalidate(accountId),
    onError,
  });
  const reactivate = useMutation({
    mutationFn: () => sdk.reactivateAccount(path),
    onSuccess: () => invalidate(accountId),
    onError,
  });
  const reissueInvitation = useMutation({
    mutationFn: () => sdk.reissueInvitation(path),
    onSuccess: ({ data }) => {
      void invalidate(accountId);
      onLinkIssued({ kind: "invite", name: "", token: data.token });
    },
    onError: onLinkError,
  });
  const issuePasswordReset = useMutation({
    mutationFn: () => sdk.issuePasswordReset(path),
    onSuccess: ({ data }) =>
      onLinkIssued({ kind: "reset", name: "", token: data.token }),
    onError: onLinkError,
  });
  return {
    update,
    deactivate,
    reactivate,
    reissueInvitation,
    issuePasswordReset,
  };
}

export { validate as validateAccountDraft };

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (link: IssuedLink) => void;
}

export function CreateAccountDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateAccountDialogProps) {
  const toast = useToast();
  const invalidate = useInvalidateAccounts();
  const roles = useQuery(rolesQuery()).data ?? [];
  const [draft, setDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const create = useMutation({
    mutationFn: () =>
      sdk.createAccount({
        body: {
          name: draft.name.trim(),
          email: draft.email.trim(),
          affiliationId: draft.affiliationId,
          assignments: toApiAssignments(draft.assignments),
          expiresAt: expiryToApi(draft.expiresOn),
        },
        throwOnError: true,
      }),
    onSuccess: ({ data }) => {
      void invalidate();
      onOpenChange(false);
      setDraft(emptyAccountDraft);
      onCreated({ kind: "invite", name: data.account.name, token: data.token });
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 계정 목록에서 만들어졌는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validate(draft, roles);
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content>
        <form onSubmit={submit} noValidate className="contents">
          <Dialog.Header title="계정 만들기" />
          <Dialog.Body>
            <AccountForm
              mode="create"
              value={draft}
              onChange={setDraft}
              errors={errors}
            />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={<Button variant="ghost" />}>
              취소
            </Dialog.Close>
            <Button type="submit" variant="primary" loading={create.isPending}>
              만들기
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export interface IssuedLinkDialogProps {
  link: IssuedLink | null;
  onClose: () => void;
}

/** 발급한 초대 링크나 재설정 링크를 보여주고 복사한다. 메일은 보내지 않으므로 관리자가 전달한다. */
export function IssuedLinkDialog({ link, onClose }: IssuedLinkDialogProps) {
  const toast = useToast();
  const url = link
    ? link.kind === "invite"
      ? appLinks.invite(link.token)
      : appLinks.passwordReset(link.token)
    : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.show({ message: "링크를 복사했습니다", tone: "success" });
    } catch {
      toast.show({
        message: "복사하지 못했습니다. 링크를 직접 선택해 복사하세요.",
        tone: "danger",
      });
    }
  };
  const target = link?.name ? `${link.name}님에게` : "받을 사람에게";
  return (
    <Dialog.Root
      open={link !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      <Dialog.Content size="sm">
        <Dialog.Header
          title={link?.kind === "reset" ? "재설정 링크" : "초대 링크"}
          closable={false}
        />
        <Dialog.Body>
          <p className="m-0 text-body text-fg">
            {target} 이 링크를 전달하세요. 7일 동안 열 수 있습니다.
          </p>
          <div className="flex items-center gap-2">
            <TextField
              aria-label="링크"
              readOnly
              value={url}
              className="min-w-0 flex-1"
              onFocus={(e) => e.target.select()}
            />
            <Button icon={Copy} onClick={copy}>
              링크 복사
            </Button>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="primary" onClick={onClose}>
            완료
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** 역할을 적용할 범위. 전체 또는 지정한 프로젝트(하나 이상). */
function ScopePicker({
  scope,
  projectIds,
  onChange,
}: {
  scope: Assignment["scope"];
  projectIds: string[];
  onChange: (scope: Assignment["scope"], projectIds: string[]) => void;
}) {
  const projectsResult = useQuery(projectsQuery());
  const projects = projectsResult.data ?? [];
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(scope);
  const [picked, setPicked] = useState<string[]>(projectIds);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const nameOf = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? "알 수 없는 프로젝트";
  const label = scope === "global" ? "전체" : projectIds.map(nameOf).join(", ");
  const visible = query
    ? projects.filter((p) => p.name.toLowerCase().includes(query))
    : projects;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        // 열 때마다 지금 값에서 시작한다
        if (next) {
          setKind(scope);
          setPicked(projectIds);
          setSearch("");
        }
        setOpen(next);
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={`범위: ${label}`}
            className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-left text-body-sm text-fg outline-none transition-colors duration-fast hover:border-line-strong focus-visible:border-accent data-popup-open:border-accent"
          />
        }
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="shrink-0 text-fg-muted"
        />
      </Popover.Trigger>
      <Popover.Popup align="end" aria-label="적용 범위" className="w-80">
        <div className="flex flex-col gap-2.5 border-line border-b p-3">
          <RadioGroup
            aria-label="적용 범위"
            orientation="horizontal"
            value={kind}
            options={[
              { value: "global", label: "전체" },
              { value: "projects", label: "프로젝트 지정" },
            ]}
            onValueChange={(v) => setKind(v as Assignment["scope"])}
          />
          {kind === "projects" && (
            <TextField
              size="sm"
              icon={Search}
              placeholder="프로젝트 검색"
              aria-label="프로젝트 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          )}
        </div>
        {kind === "projects" && (
          <fieldset className="m-0 flex min-h-0 flex-1 flex-col gap-0.5 overflow-auto border-0 px-3 py-1.5">
            <legend className="sr-only">프로젝트</legend>
            {visible.map((p) => (
              <div key={p.id} className="py-1.5">
                <Checkbox
                  label={p.name}
                  checked={picked.includes(p.id)}
                  onCheckedChange={(checked) =>
                    setPicked(
                      checked
                        ? [...picked, p.id]
                        : picked.filter((id) => id !== p.id),
                    )
                  }
                />
              </div>
            ))}
            {projectsResult.isError ? (
              <div className="flex items-center gap-2 py-2">
                <span className="flex-1 text-caption text-fg-muted">
                  프로젝트를 불러오지 못했습니다
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={projectsResult.isFetching}
                  onClick={() => projectsResult.refetch()}
                >
                  다시 시도
                </Button>
              </div>
            ) : projectsResult.isPending ? (
              <span className="py-2 text-caption text-fg-muted">
                불러오는 중
              </span>
            ) : (
              visible.length === 0 && (
                <span className="py-2 text-caption text-fg-muted">
                  {query ? "찾는 프로젝트가 없습니다" : "프로젝트가 없습니다"}
                </span>
              )
            )}
          </fieldset>
        )}
        <footer className="flex items-center gap-2 border-line border-t px-3 py-2.5">
          <span className="flex-1 text-caption text-fg-muted">
            {kind === "projects" ? `${picked.length}개 선택` : ""}
          </span>
          <Button
            variant="primary"
            size="sm"
            disabled={kind === "projects" && picked.length === 0}
            onClick={() => {
              onChange(kind, kind === "global" ? [] : picked);
              setOpen(false);
            }}
          >
            완료
          </Button>
        </footer>
      </Popover.Popup>
    </Popover.Root>
  );
}
