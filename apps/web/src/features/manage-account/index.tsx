import { Button, Dialog, Select, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import {
  type Account,
  type AccountRole,
  accountRoleOptions,
  passwordLengthError,
} from "@/entities/account";
import { sdk, toApiFailure } from "@/shared/api";

export interface AccountDraft {
  name: string;
  loginId: string;
  role: AccountRole;
  /** 만들 때만 정한다 */
  password: string;
}

export const emptyAccountDraft: AccountDraft = {
  name: "",
  loginId: "",
  role: "member",
  password: "",
};

export function draftFromAccount(account: Account): AccountDraft {
  return {
    name: account.name,
    loginId: account.loginId,
    role: account.role,
    password: "",
  };
}

type DraftErrors = Partial<Record<"name" | "loginId" | "password", string>>;

function validate(
  draft: AccountDraft,
  mode: "create" | "edit" = "create",
): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.name.trim()) errors.name = "이름을 입력하세요";
  // 아이디와 처음 비밀번호는 만들 때만 정한다. 이 형식 이전의 계정도 다른 정보를 고칠 수 있어야 한다.
  if (mode === "create") {
    if (!/^[a-z0-9._@-]{3,64}$/.test(draft.loginId.trim().toLowerCase()))
      errors.loginId = "영문, 숫자, ._-@로 3~64자를 입력하세요";
    const password = passwordLengthError(draft.password);
    if (password) errors.password = password;
  }
  return errors;
}

export interface AccountFormProps {
  value: AccountDraft;
  onChange: (next: AccountDraft) => void;
  /** 수정 화면에서는 로그인 아이디를 바꾸지 않고 비밀번호 칸이 없다 */
  mode: "create" | "edit";
  errors?: DraftErrors;
}

/** 이름, 아이디, 등급과 만들 때의 처음 비밀번호를 입력한다. */
export function AccountForm({
  value,
  onChange,
  mode,
  errors = {},
}: AccountFormProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField
        label="이름"
        required
        value={value.name}
        error={errors.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
      />
      <TextField
        label="아이디"
        required
        readOnly={mode === "edit"}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        value={value.loginId}
        error={errors.loginId}
        onChange={(e) => onChange({ ...value, loginId: e.target.value })}
      />
      <Select
        label="등급"
        required
        value={value.role}
        items={accountRoleOptions}
        onValueChange={(role) =>
          role && onChange({ ...value, role: role as AccountRole })
        }
      />
      {mode === "create" && (
        <TextField
          label="처음 비밀번호"
          type="password"
          required
          autoComplete="new-password"
          value={value.password}
          error={errors.password}
          onChange={(e) => onChange({ ...value, password: e.target.value })}
        />
      )}
    </div>
  );
}

/** 계정 목록과 상세를 함께 새로 고친다. */
function useInvalidateAccounts() {
  const queryClient = useQueryClient();
  return (accountId?: string) =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0] as { _id?: string } | undefined;
        // 내 계정의 등급이 바뀌었을 수 있으므로 내 정보도 다시 읽는다
        return (
          key?._id === "listAccounts" ||
          (accountId !== undefined &&
            (key?._id === "getAccount" || key?._id === "getMe"))
        );
      },
    });
}

/** 계정 하나에 대한 작업 */
export function useAccountActions(accountId: string) {
  const toast = useToast();
  const invalidate = useInvalidateAccounts();
  const onError = (error: unknown) =>
    toast.show({
      message: toApiFailure(error, {
        unknownResult:
          "응답을 받지 못했습니다. 새로 고쳐 저장됐는지 확인하세요.",
      }).message,
      tone: "danger",
    });
  const path = { path: { accountId }, throwOnError: true as const };

  const update = useMutation({
    mutationFn: (draft: AccountDraft) =>
      sdk.updateAccount({
        ...path,
        body: { name: draft.name.trim(), role: draft.role },
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
  const resetPassword = useMutation({
    mutationFn: (password: string) =>
      sdk.resetAccountPassword({ ...path, body: { password } }),
    onSuccess: () =>
      toast.show({ message: "비밀번호를 바꿨습니다", tone: "success" }),
    // 비밀번호는 화면에서 확인할 수 없으므로 실제 로그인으로 확인하게 한다
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 계정 사용자에게 새 비밀번호로 로그인되는지 확인해 달라고 하세요.",
        }).message,
        tone: "danger",
      }),
  });
  return { update, deactivate, reactivate, resetPassword };
}

export { validate as validateAccountDraft };

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAccountDialog({
  open,
  onOpenChange,
}: CreateAccountDialogProps) {
  const toast = useToast();
  const invalidate = useInvalidateAccounts();
  const [draft, setDraft] = useState<AccountDraft>(emptyAccountDraft);
  const [errors, setErrors] = useState<DraftErrors>({});
  const create = useMutation({
    mutationFn: () =>
      sdk.createAccount({
        body: {
          name: draft.name.trim(),
          loginId: draft.loginId.trim(),
          role: draft.role,
          password: draft.password,
        },
        throwOnError: true,
      }),
    onSuccess: () => {
      void invalidate();
      onOpenChange(false);
      setDraft(emptyAccountDraft);
      toast.show({ message: "계정을 만들었습니다", tone: "success" });
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
    const found = validate(draft);
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

export interface ResetPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onSubmit: (password: string, done: () => void) => void;
}

/** 관리자가 계정의 새 비밀번호를 정한다. 그 계정의 로그인은 모두 끊긴다. */
export function ResetPasswordDialog({
  open,
  onOpenChange,
  pending,
  onSubmit,
}: ResetPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const change = (next: boolean) => {
    if (!next) {
      setPassword("");
      setError(undefined);
    }
    onOpenChange(next);
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = passwordLengthError(password);
    setError(found);
    if (!found) onSubmit(password, () => change(false));
  };
  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Content size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <Dialog.Header title="비밀번호 다시 정하기" />
          <Dialog.Body>
            <TextField
              label="새 비밀번호"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              error={error}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={<Button variant="ghost" />}>
              취소
            </Dialog.Close>
            <Button type="submit" variant="primary" loading={pending}>
              저장
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
