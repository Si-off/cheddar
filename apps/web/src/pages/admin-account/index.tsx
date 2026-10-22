import { Badge, Button, IconButton, LoadError, Menu } from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, MoreHorizontal } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import {
  type Account,
  accountQuery,
  accountStatusInfo,
} from "@/entities/account";
import {
  AccountForm,
  draftFromAccount,
  ResetPasswordDialog,
  useAccountActions,
  validateAccountDraft,
} from "@/features/manage-account";

export function AdminAccountPage({ accountId }: { accountId: string }) {
  const account = useQuery(accountQuery(accountId));
  if (account.isError) {
    return (
      <LoadError
        title="계정을 불러오지 못했습니다"
        onRetry={() => account.refetch()}
      />
    );
  }
  if (!account.data) return null;
  // 계정이 바뀌면 입력 상태를 새로 시작한다
  return <AccountDetail key={account.data.id} account={account.data} />;
}

function AccountDetail({ account }: { account: Account }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState(() => draftFromAccount(account));
  const [errors, setErrors] = useState<ReturnType<typeof validateAccountDraft>>(
    {},
  );
  const [resetting, setResetting] = useState(false);
  const actions = useAccountActions(account.id);
  const status = accountStatusInfo[account.status];

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateAccountDraft(draft, "edit");
    setErrors(found);
    if (Object.keys(found).length === 0) actions.update.mutate(draft);
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-title text-fg">{account.name}</h2>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <span className="flex-1" />
        <Button icon={KeyRound} onClick={() => setResetting(true)}>
          비밀번호 다시 정하기
        </Button>
        <Menu.Root>
          <Menu.Trigger
            render={
              <IconButton
                icon={MoreHorizontal}
                label="계정 작업"
                variant="solid"
              />
            }
          />
          <Menu.Popup align="end">
            {account.status === "inactive" ? (
              <Menu.Item onClick={() => actions.reactivate.mutate()}>
                다시 활성화
              </Menu.Item>
            ) : (
              <Menu.Item
                tone="danger"
                onClick={() => actions.deactivate.mutate()}
              >
                비활성화
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Root>
      </div>

      <section className="rounded-lg border border-line bg-surface p-5">
        <AccountForm
          mode="edit"
          value={draft}
          onChange={setDraft}
          errors={errors}
        />
      </section>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => navigate({ to: "/admin/accounts" })}
        >
          목록
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={actions.update.isPending}
        >
          저장
        </Button>
      </div>

      <ResetPasswordDialog
        open={resetting}
        onOpenChange={setResetting}
        pending={actions.resetPassword.isPending}
        onSubmit={(password, done) =>
          actions.resetPassword.mutate(password, { onSuccess: done })
        }
      />
    </form>
  );
}
