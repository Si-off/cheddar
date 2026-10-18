import {
  Badge,
  Button,
  ConfirmDialog,
  IconButton,
  LoadError,
  Menu,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, MoreHorizontal } from "lucide-react";
import { type SubmitEvent, useState } from "react";
import {
  type Account,
  accountQuery,
  accountStatusInfo,
} from "@/entities/account";
import { rolesQuery } from "@/entities/role";
import {
  AccountForm,
  draftFromAccount,
  type IssuedLink,
  IssuedLinkDialog,
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

/** 새로 발급하면 같은 용도의 이전 링크는 바로 쓸 수 없게 된다 */
const reissueNotice = {
  invite: {
    title: "초대 링크 다시 발급",
    description: "이전 초대 링크는 사용할 수 없게 됩니다.",
  },
  reset: {
    title: "재설정 링크 발급",
    description: "이전에 발급한 재설정 링크는 사용할 수 없게 됩니다.",
  },
};

function AccountDetail({ account }: { account: Account }) {
  const navigate = useNavigate();
  const roles = useQuery(rolesQuery()).data ?? [];
  const [draft, setDraft] = useState(() => draftFromAccount(account));
  const [errors, setErrors] = useState<ReturnType<typeof validateAccountDraft>>(
    {},
  );
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [confirming, setConfirming] = useState<"invite" | "reset" | null>(null);
  const actions = useAccountActions(account.id, (link) =>
    setIssued({ ...link, name: account.name }),
  );
  const status = accountStatusInfo[account.status];
  const issuing =
    actions.reissueInvitation.isPending || actions.issuePasswordReset.isPending;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateAccountDraft(draft, roles);
    setErrors(found);
    if (Object.keys(found).length === 0) actions.update.mutate(draft);
  };

  const issue = () => {
    const done = { onSettled: () => setConfirming(null) };
    if (confirming === "invite")
      actions.reissueInvitation.mutate(undefined, done);
    if (confirming === "reset")
      actions.issuePasswordReset.mutate(undefined, done);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="m-0 text-title text-fg">{account.name}</h2>
        <Badge tone={status.tone} dot>
          {status.label}
        </Badge>
        <span className="flex-1" />
        {account.status === "active" && (
          <Button icon={KeyRound} onClick={() => setConfirming("reset")}>
            재설정 링크
          </Button>
        )}
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
            {account.status === "invited" && (
              <Menu.Item onClick={() => setConfirming("invite")}>
                초대 링크 다시 발급
              </Menu.Item>
            )}
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

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
        title={confirming ? reissueNotice[confirming].title : ""}
        description={confirming ? reissueNotice[confirming].description : ""}
        confirmLabel="발급"
        pending={issuing}
        onConfirm={issue}
      />
      <IssuedLinkDialog link={issued} onClose={() => setIssued(null)} />
    </form>
  );
}
