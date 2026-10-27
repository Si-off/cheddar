import { Button, Dialog, Icon, TextField, useToast } from "@cheddar/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Frame } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import { figmaTokenQuery } from "@/entities/account";
import { isApiFailure, sdk, toApiFailure } from "@/shared/api";

export interface FigmaTokenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 등록한 토큰이 있어도 바로 새 토큰 입력으로 연다(토큰 만료) */
  replace?: boolean;
}

/** 내 Figma 개인 액세스 토큰을 등록, 바꾸기, 삭제한다. 등록하면 Figma 링크로 자료를 넣을 수 있다. */
export function FigmaTokenDialog({
  open,
  onOpenChange,
  replace = false,
}: FigmaTokenDialogProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const token = useQuery({ ...figmaTokenQuery(), enabled: open });
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const saved = token.data ?? null;
  const showForm = editing || replace || !saved;
  const change = (next: boolean) => {
    if (!next) {
      setEditing(false);
      setValue("");
      setError(undefined);
    }
    onOpenChange(next);
  };
  const save = useMutation({
    mutationFn: async () =>
      (
        await sdk.saveFigmaToken({
          body: { token: value.trim() },
          throwOnError: true,
        })
      ).data.token,
    onSuccess: (data) => {
      queryClient.setQueryData(figmaTokenQuery().queryKey, data ?? null);
      change(false);
      toast.show({ message: "Figma 토큰을 등록했습니다", tone: "success" });
    },
    onError: (failure) => {
      if (isApiFailure(failure, "FIGMA_TOKEN_INVALID"))
        setError("토큰을 확인하지 못했습니다");
      else
        toast.show({ message: toApiFailure(failure).message, tone: "danger" });
    },
  });
  const remove = useMutation({
    mutationFn: () => sdk.deleteFigmaToken({ throwOnError: true }),
    onSuccess: () => {
      queryClient.setQueryData(figmaTokenQuery().queryKey, null);
      change(false);
      toast.show({ message: "Figma 토큰을 삭제했습니다", tone: "success" });
    },
    onError: (failure) =>
      toast.show({ message: toApiFailure(failure).message, tone: "danger" }),
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (value.trim()) save.mutate();
  };

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Content size="sm">
        <form onSubmit={submit} noValidate className="contents">
          <Dialog.Header title="Figma 토큰" />
          <Dialog.Body>
            {showForm ? (
              <TextField
                label="개인 액세스 토큰"
                labelAction={
                  <Link
                    to="/guides/figma-token"
                    target="_blank"
                    className="font-medium text-accent-text no-underline hover:underline"
                  >
                    발급 방법
                  </Link>
                }
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="figd_로 시작하는 토큰"
                value={value}
                error={error}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(undefined);
                }}
              />
            ) : (
              saved && (
                <div className="flex items-center gap-3 rounded-md bg-secondary-soft px-3.5 py-3 text-secondary-text">
                  <Icon icon={Frame} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-body font-medium text-fg">
                      {saved.handle}
                    </span>
                    <span className="truncate text-caption text-fg-muted">
                      {saved.email}
                    </span>
                  </span>
                  <span className="ml-auto font-mono text-caption text-fg-muted">
                    figd_••••{saved.tokenSuffix}
                  </span>
                </div>
              )
            )}
          </Dialog.Body>
          <Dialog.Footer>
            {showForm ? (
              <>
                <Dialog.Close render={<Button variant="ghost" />}>
                  취소
                </Dialog.Close>
                <Button
                  type="submit"
                  variant="primary"
                  loading={save.isPending}
                  disabled={!value.trim()}
                >
                  등록
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  className="mr-auto text-danger"
                  loading={remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  삭제
                </Button>
                <Button onClick={() => setEditing(true)}>바꾸기</Button>
                <Dialog.Close render={<Button variant="primary" />}>
                  닫기
                </Dialog.Close>
              </>
            )}
          </Dialog.Footer>
        </form>
      </Dialog.Content>
    </Dialog.Root>
  );
}
