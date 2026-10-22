import {
  Avatars,
  Button,
  ConfirmDialog,
  Dialog,
  IconButton,
  LoadError,
  Select,
  Tag,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import {
  Copy,
  Globe,
  Lock,
  RotateCcw,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { useDeferredValue, useState } from "react";
import {
  type ShareAccess,
  type Sharing,
  sharingCandidatesQuery,
  sharingQuery,
  useSharingActions,
} from "@/features/share-test-set";
import { appLinks } from "@/shared/config/links";

const accessItems = [
  { value: "edit", label: "편집 가능" },
  { value: "view", label: "보기만 가능" },
];
const scopeItems = [
  {
    value: "private",
    label: "비공개",
    description: "초대한 사람만",
    icon: Lock,
  },
  {
    value: "public",
    label: "공개",
    description: "링크가 있는 누구나",
    icon: Globe,
  },
];

export interface ShareDialogProps {
  testSetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareDialog({
  testSetId,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const sharing = useQuery({ ...sharingQuery(testSetId), enabled: open });
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title="공유" />
        <Dialog.Body className="gap-5">
          {sharing.isError ? (
            <LoadError
              compact
              title="공유 설정을 불러오지 못했습니다"
              onRetry={() => sharing.refetch()}
            />
          ) : (
            sharing.data && (
              <>
                <LinkSection testSetId={testSetId} sharing={sharing.data} />
                <PeopleSection testSetId={testSetId} sharing={sharing.data} />
              </>
            )
          )}
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close render={<Button variant="primary" />}>
            완료
          </Dialog.Close>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function LinkSection({
  testSetId,
  sharing,
}: {
  testSetId: string;
  sharing: Sharing;
}) {
  const toast = useToast();
  const { update, replaceLink } = useSharingActions(testSetId);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [confirmPrivate, setConfirmPrivate] = useState(false);
  const locked = !sharing.canManageLink || update.isPending;
  const link = sharing.linkToken && appLinks.sharedTestSet(sharing.linkToken);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.show({ message: "링크를 복사했습니다", tone: "success" });
    } catch {
      toast.show({
        message: "복사하지 못했습니다. 링크를 직접 선택해 복사하세요.",
        tone: "danger",
      });
    }
  };
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="m-0 text-title-sm">링크</h3>
      <div className="flex flex-wrap gap-2">
        <Select
          aria-label="공개 범위"
          className="min-w-60 flex-1"
          items={scopeItems}
          value={sharing.visibility}
          disabled={locked}
          onValueChange={(v) => {
            if (v === "public") update.mutate({ visibility: "public" });
            // 비공개로 바꾸면 지금 링크가 사라지므로 한 번 묻는다
            else if (v === "private" && sharing.visibility === "public")
              setConfirmPrivate(true);
          }}
        />
        {sharing.visibility === "public" && (
          <Select
            aria-label="링크 권한"
            className="w-36"
            items={accessItems}
            value={sharing.linkAccess}
            disabled={locked}
            onValueChange={(v) =>
              v && update.mutate({ linkAccess: v as ShareAccess })
            }
          />
        )}
      </div>
      {sharing.visibility === "public" && link && (
        <>
          <div className="flex items-center gap-2">
            <TextField
              aria-label="공유 링크"
              readOnly
              value={link}
              className="min-w-0 flex-1"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button icon={Copy} onClick={() => void copy()}>
              링크 복사
            </Button>
          </div>
          {sharing.canManageLink && (
            <div>
              <Button
                variant="ghost"
                size="sm"
                icon={RotateCcw}
                loading={replaceLink.isPending}
                onClick={() => setConfirmReplace(true)}
              >
                링크 새로 만들기
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="링크 새로 만들기"
        description="이전 링크로는 더 열 수 없고, 그 링크로 열려 있던 화면은 닫힙니다."
        confirmLabel="새로 만들기"
        onConfirm={() => {
          setConfirmReplace(false);
          replaceLink.mutate(undefined);
        }}
      />
      <ConfirmDialog
        open={confirmPrivate}
        onOpenChange={setConfirmPrivate}
        title="비공개로 바꾸기"
        description="지금 링크를 사용할 수 없게 되며, 그 링크로 열린 화면이 닫힙니다. 다시 공개하면 새 링크가 생깁니다."
        confirmLabel="비공개로 바꾸기"
        onConfirm={() => {
          setConfirmPrivate(false);
          update.mutate({ visibility: "private" });
        }}
      />
    </section>
  );
}

function PeopleSection({
  testSetId,
  sharing,
}: {
  testSetId: string;
  sharing: Sharing;
}) {
  const { setMember, removeMember } = useSharingActions(testSetId);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(
    null,
  );
  const query = useDeferredValue(search.trim());
  const candidates = useQuery({
    ...sharingCandidatesQuery(testSetId, query),
    enabled: sharing.canInvite && query.length > 0 && !picked,
  });
  const invite = () => {
    if (!picked) return;
    setMember.mutate(
      { accountId: picked.id, access: "edit" },
      {
        onSuccess: () => {
          setPicked(null);
          setSearch("");
        },
      },
    );
  };
  const people = [
    { person: sharing.owner, access: null as ShareAccess | null },
    ...sharing.members,
  ];
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="m-0 text-title-sm">사람</h3>
      {sharing.canInvite && (
        <div className="flex flex-col gap-1 pt-1">
          <div className="flex items-center gap-2">
            <TextField
              icon={Search}
              aria-label="초대할 사람"
              placeholder="이름 또는 아이디"
              className="min-w-0 flex-1"
              value={picked ? picked.name : search}
              onChange={(e) => {
                setPicked(null);
                setSearch(e.target.value);
              }}
            />
            <Button
              icon={UserPlus}
              disabled={!picked}
              loading={setMember.isPending}
              onClick={invite}
            >
              초대
            </Button>
          </div>
          {!picked && query && candidates.data && (
            <ul
              aria-label="찾은 계정"
              className="m-0 flex list-none flex-col rounded-md border border-line p-1"
            >
              {candidates.data.length === 0 ? (
                <li className="px-2 py-1.5 text-body-sm text-fg-muted">
                  찾은 계정이 없습니다
                </li>
              ) : (
                candidates.data.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-subtle focus-visible:bg-subtle"
                      onClick={() => setPicked({ id: c.id, name: c.name })}
                    >
                      <span className="flex items-center gap-1.5 text-body-sm">
                        {c.name}
                        {c.affiliation && <Tag>{c.affiliation}</Tag>}
                      </span>
                      <span className="text-caption text-fg-muted">
                        {c.loginId}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
      <ul className="m-0 flex list-none flex-col p-0">
        {people.map(({ person, access }, index) => (
          <li
            key={person.id}
            className="flex items-center gap-2.5 border-line py-2.5 not-first:border-t"
          >
            <Avatars
              people={[
                {
                  id: person.id,
                  name: person.name,
                  color: ((index % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
                },
              ]}
              aria-label={person.name}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1.5 text-label">
                {person.name}
                {person.affiliation && <Tag>{person.affiliation}</Tag>}
              </span>
              <span className="truncate text-caption text-fg-muted">
                {person.loginId}
              </span>
            </div>
            {access === null ? (
              <span className="pr-2 text-body-sm text-fg-muted">소유자</span>
            ) : (
              <>
                <Select
                  size="sm"
                  className="w-36"
                  aria-label={`${person.name} 권한`}
                  items={accessItems}
                  value={access}
                  disabled={!sharing.canInvite}
                  onValueChange={(v) =>
                    v &&
                    setMember.mutate({
                      accountId: person.id,
                      access: v as ShareAccess,
                    })
                  }
                />
                {sharing.canInvite && (
                  <IconButton
                    size="sm"
                    icon={X}
                    label={`${person.name} 제거`}
                    onClick={() => removeMember.mutate(person.id)}
                  />
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
