import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Dialog, TextField, useToast } from "@workspace/ui";
import { type SubmitEvent, useState } from "react";
import { currentAccountQuery, passwordLengthError } from "@/entities/account";
import { sdk, toApiFailure } from "@/shared/api";

export interface LoginFormProps {
  defaultLoginId?: string;
  onLoggedIn: () => void;
}

export function LoginForm({ defaultLoginId = "", onLoggedIn }: LoginFormProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [loginId, setLoginId] = useState(defaultLoginId);
  const [password, setPassword] = useState("");
  const login = useMutation({
    mutationFn: () =>
      sdk.login({ body: { loginId, password }, throwOnError: true }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: currentAccountQuery().queryKey,
      });
      onLoggedIn();
    },
    onError: (error) =>
      toast.show({ message: toApiFailure(error).message, tone: "danger" }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    login.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label="로그인">
      <TextField
        label="아이디"
        required
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={loginId}
        onChange={(e) => setLoginId(e.target.value)}
      />
      <TextField
        label="비밀번호"
        type="password"
        required
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={login.isPending}
      >
        로그인
      </Button>
    </form>
  );
}

export interface ChangePasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 현재 비밀번호를 확인하고 새 비밀번호로 바꾼다. 지금 로그인은 유지하고 다른 곳의 로그인은 끊긴다. */
export function ChangePasswordDialog({
  open,
  onOpenChange,
}: ChangePasswordDialogProps) {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string>();
  const change = (value: boolean) => {
    if (!value) {
      setCurrent("");
      setNext("");
      setError(undefined);
    }
    onOpenChange(value);
  };
  const save = useMutation({
    mutationFn: () =>
      sdk.changeMyPassword({
        body: { currentPassword: current, newPassword: next },
        throwOnError: true,
      }),
    onSuccess: () => {
      change(false);
      toast.show({ message: "비밀번호를 바꿨습니다", tone: "success" });
    },
    // 바뀐 뒤 응답만 잃었으면 같은 현재 비밀번호로 다시 시도해도 실패하므로 로그인으로 확인하게 한다
    onError: (failure) =>
      toast.show({
        message: toApiFailure(failure, {
          unknownResult:
            "응답을 받지 못했습니다. 로그아웃한 뒤 새 비밀번호로 로그인해 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = passwordLengthError(next);
    setError(found);
    if (!found && current) save.mutate();
  };
  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Content size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <Dialog.Header title="비밀번호 바꾸기" />
          <Dialog.Body>
            <TextField
              label="현재 비밀번호"
              type="password"
              required
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <TextField
              label="새 비밀번호"
              type="password"
              required
              autoComplete="new-password"
              value={next}
              error={error}
              onChange={(e) => setNext(e.target.value)}
            />
          </Dialog.Body>
          <Dialog.Footer>
            <Dialog.Close render={<Button variant="ghost" />}>
              취소
            </Dialog.Close>
            <Button
              type="submit"
              variant="primary"
              loading={save.isPending}
              disabled={!current || !next}
            >
              바꾸기
            </Button>
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** 로그아웃하고 캐시를 비운다. 실패하면 세션이 남아 있을 수 있으므로 이동하지 않고 알린다. */
export function useLogout(onLoggedOut: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => sdk.logout({ throwOnError: true }),
    onSuccess: () => {
      queryClient.clear();
      onLoggedOut();
    },
    onError: (error) =>
      toast.show({ message: toApiFailure(error).message, tone: "danger" }),
  });
}
