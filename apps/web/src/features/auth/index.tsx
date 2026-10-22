import { Button, EmptyState, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Link2Off } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { currentAccountQuery } from "@/entities/account";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";

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

const MIN_PASSWORD = 12;
const MAX_PASSWORD = 128;

export interface PasswordSetupFormProps {
  /** 초대 수락 또는 관리자가 발급한 재설정 */
  kind: "invite" | "reset";
  token: string;
  onDone: (loginId: string) => void;
}

/** 링크의 토큰을 확인하고 비밀번호를 정한다. */
export function PasswordSetupForm({
  kind,
  token,
  onDone,
}: PasswordSetupFormProps) {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);
  const info = useQuery({
    queryKey: ["auth-token", kind, token],
    queryFn: async ({ signal }) => {
      const options = { query: { token }, signal, throwOnError: true as const };
      return kind === "invite"
        ? (await sdk.inspectInvitation(options)).data
        : (await sdk.inspectPasswordReset(options)).data;
    },
    retry: false,
    enabled: token.length > 0,
    // 쓸 수 없는 링크는 이 화면이 안내하므로 토스트를 띄우지 않는다
    meta: { quietCodes: ["INVALID_AUTH_TOKEN"] },
  });
  const save = useMutation({
    mutationFn: () => {
      const options = {
        body: { token, password },
        throwOnError: true as const,
      };
      return kind === "invite"
        ? sdk.acceptInvitation(options)
        : sdk.resetPassword(options);
    },
    onSuccess: () => onDone(info.data?.loginId ?? ""),
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 새 비밀번호로 로그인해 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });

  if (
    !token ||
    (info.isError && isApiFailure(info.error, "INVALID_AUTH_TOKEN"))
  ) {
    return (
      <EmptyState
        icon={Link2Off}
        title="링크를 사용할 수 없습니다"
        description="관리자에게 새 링크를 요청하세요."
      />
    );
  }
  if (info.isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="링크를 확인하지 못했습니다"
        description={toApiFailure(info.error).message}
        actions={<Button onClick={() => info.refetch()}>다시 시도</Button>}
      />
    );
  }

  const tooShort = password.length < MIN_PASSWORD;
  const tooLong = password.length > MAX_PASSWORD;
  const mismatch = confirm !== password;
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (!tooShort && !tooLong && !mismatch) save.mutate();
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4"
      aria-label="비밀번호 설정"
    >
      {info.data && (
        <span className="text-body-sm text-fg-muted">{info.data.name}</span>
      )}
      <TextField
        label="아이디"
        value={info.data?.loginId ?? ""}
        readOnly
        autoComplete="username"
      />
      <TextField
        label="비밀번호"
        type="password"
        required
        autoComplete="new-password"
        description="12자 이상"
        error={
          touched && tooShort
            ? "12자 이상 입력하세요"
            : touched && tooLong
              ? "128자 이하로 입력하세요"
              : undefined
        }
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <TextField
        label="비밀번호 확인"
        type="password"
        required
        autoComplete="new-password"
        error={
          touched && !tooShort && mismatch ? "비밀번호가 다릅니다" : undefined
        }
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={save.isPending}
        disabled={info.isPending}
      >
        {kind === "invite" ? "시작" : "비밀번호 변경"}
      </Button>
    </form>
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
