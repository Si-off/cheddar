import { useQuery } from "@tanstack/react-query";
import {
  Button,
  ConfirmDialog,
  Dialog,
  LoadError,
  Select,
  Switch,
  TextField,
  useToast,
} from "@workspace/ui";
import { Copy, RotateCcw } from "lucide-react";
import { useState } from "react";
import {
  type ShareAccess,
  type Sharing,
  sharingQuery,
  useSharingActions,
} from "@/features/share-test-set";
import { appLinks } from "@/shared/config/links";

const accessItems = [
  { value: "edit", label: "편집 가능" },
  { value: "view", label: "보기만 가능" },
];

export interface ShareDialogProps {
  testSetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 계정이 없는 사람에게 공개 링크로 테스트 세트를 연다. 로그인한 계정은 모두 이미 볼 수 있다. */
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
        <Dialog.Body>
          {sharing.isError ? (
            <LoadError
              compact
              title="공유 설정을 불러오지 못했습니다"
              onRetry={() => sharing.refetch()}
            />
          ) : (
            sharing.data && (
              <LinkSection testSetId={testSetId} sharing={sharing.data} />
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
  const [confirmOff, setConfirmOff] = useState(false);
  const on = sharing.visibility === "public";
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Switch
          label="공개 링크"
          className="flex-1"
          checked={on}
          disabled={update.isPending}
          onCheckedChange={(checked) => {
            if (checked) update.mutate({ visibility: "public" });
            // 끄면 지금 링크가 사라지므로 한 번 묻는다
            else setConfirmOff(true);
          }}
        />
        {on && (
          <Select
            aria-label="링크 권한"
            className="w-36"
            items={accessItems}
            value={sharing.linkPermission}
            disabled={update.isPending}
            onValueChange={(v) =>
              v && update.mutate({ linkPermission: v as ShareAccess })
            }
          />
        )}
      </div>
      {on && link && (
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
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="공개 링크 끄기"
        description="지금 링크를 사용할 수 없게 되며, 그 링크로 열린 화면이 닫힙니다. 다시 켜면 새 링크가 생깁니다."
        confirmLabel="끄기"
        onConfirm={() => {
          setConfirmOff(false);
          update.mutate({ visibility: "private" });
        }}
      />
    </section>
  );
}
