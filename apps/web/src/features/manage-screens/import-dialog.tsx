import {
  Badge,
  Button,
  CheckTable,
  type CheckTableColumn,
  type CheckTableGroup,
  Dialog,
  SourceInput,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import {
  type ScreenDraft,
  screenSourceAccept,
  screensQuery,
  screenTypeLabel,
} from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";

const readFailure = "자료를 읽지 못했습니다. 잠시 후 다시 시도하세요.";
const unknownResult = "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.";
const indent = ["pl-0", "pl-5", "pl-10", "pl-15", "pl-20"] as const;

export interface ImportScreensDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 자료를 넣으면 AI가 찾은 화면을 모듈별로 보여주고, 고른 화면만 한 번에 더한다. */
export function ImportScreensDialog({
  projectId,
  open,
  onOpenChange,
}: ImportScreensDialogProps) {
  const [reviewing, setReviewing] = useState(false);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => !next && setReviewing(false)}
    >
      <Dialog.Content size={reviewing ? "lg" : "md"}>
        {open && (
          <Flow
            projectId={projectId}
            onReview={() => setReviewing(true)}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Flow({
  projectId,
  onReview,
  onDone,
}: {
  projectId: string;
  onReview: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const read = useMutation({
    mutationFn: async () =>
      (
        await sdk.draftProjectScreens({
          path: { projectId },
          body: { text, "files[]": files },
          throwOnError: true,
        })
      ).data,
    onSuccess: (data) => {
      setSelected(
        new Set(data.items.filter((d) => !d.exists).map((d) => d.key)),
      );
      onReview();
    },
  });
  const drafts = read.data?.items ?? [];
  const byKey = new Map(drafts.map((d) => [d.key, d]));

  const add = useMutation({
    mutationFn: () =>
      sdk.createProjectScreens({
        path: { projectId },
        body: {
          items: drafts
            .filter((d) => !d.exists && selected.has(d.key))
            .map((d) => ({
              screenId: d.screenId,
              name: d.name,
              type: d.type,
              description: d.description,
              parentScreenId: nearestParent(d)?.screenId ?? null,
            })),
        },
        throwOnError: true,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: screensQuery(projectId).queryKey,
      });
      onDone();
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, { unknownResult }).message,
        tone: "danger",
      }),
  });

  // 고르지 않은 상위 화면은 건너뛰고 그 위에 잇는다. 이미 있는 화면에는 그대로 잇는다.
  function nearestParent(draft: ScreenDraft) {
    let parent = draft.parentKey ? byKey.get(draft.parentKey) : undefined;
    while (parent && !parent.exists && !selected.has(parent.key))
      parent = parent.parentKey ? byKey.get(parent.parentKey) : undefined;
    return parent;
  }
  // 들여쓰기와 상위 화면 열은 고른 상태로 실제 저장될 관계를 보여 준다
  const depthOf = (draft: ScreenDraft) => {
    let depth = 0;
    let parent = nearestParent(draft);
    while (parent && depth < drafts.length) {
      depth += 1;
      parent = nearestParent(parent);
    }
    return depth;
  };

  if (!read.isSuccess)
    return (
      <>
        <Dialog.Header title="화면 가져오기" />
        <Dialog.Body>
          <SourceInput
            label="화면 자료"
            placeholder="화면 ID 목록 붙여 넣기"
            accept={screenSourceAccept}
            text={text}
            onTextChange={setText}
            files={files}
            onFilesChange={setFiles}
            busy={read.isPending}
            error={
              read.isError
                ? toApiFailure(read.error, { unknownResult: readFailure })
                    .message
                : undefined
            }
          />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
          <Button
            variant="ai"
            icon={Sparkles}
            loading={read.isPending}
            disabled={!text.trim() && files.length === 0}
            onClick={() => read.mutate()}
          >
            가져오기
          </Button>
        </Dialog.Footer>
      </>
    );

  const groups: CheckTableGroup<ScreenDraft>[] = [];
  for (const draft of drafts) {
    const label = draft.group || "기타";
    const group = groups.find((g) => g.id === label);
    if (group) group.rows.push(draft);
    else groups.push({ id: label, label, rows: [draft] });
  }
  const columns: CheckTableColumn<ScreenDraft>[] = [
    {
      id: "screenId",
      header: "화면 ID",
      width: 240,
      mono: true,
      cell: (d) => (
        <span className="flex items-center gap-2">
          <span className="truncate">{d.screenId}</span>
          {d.exists && <Badge>있음</Badge>}
          {!d.exists && d.ruleMismatch && (
            <Badge tone="warning">규칙 불일치</Badge>
          )}
        </span>
      ),
    },
    {
      id: "name",
      header: "이름",
      width: 200,
      cell: (d) => (
        <span
          className={`block truncate ${indent[Math.min(depthOf(d), indent.length - 1)]}`}
        >
          {d.name}
        </span>
      ),
    },
    {
      id: "type",
      header: "유형",
      width: 72,
      cell: (d) => screenTypeLabel[d.type],
    },
    {
      id: "parent",
      header: "상위 화면",
      cell: (d) => nearestParent(d)?.name ?? "",
    },
  ];
  const count = drafts.filter((d) => !d.exists && selected.has(d.key)).length;
  const { skipped, unreadFiles } = read.data;

  return (
    <>
      <Dialog.Header title="화면 가져오기" />
      <Dialog.Body className="gap-3">
        {unreadFiles.length > 0 && (
          <p className="m-0 flex items-center gap-2 text-body-sm text-warning">
            <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
            {unreadFiles.join(", ")} 파일을 읽지 못했습니다.
          </p>
        )}
        <CheckTable
          aria-label="가져올 화면"
          columns={columns}
          groups={groups}
          getRowId={(d) => d.key}
          getRowLabel={(d) => `${d.name} 선택`}
          isRowDisabled={(d) => d.exists}
          selected={selected}
          onSelectedChange={setSelected}
        />
      </Dialog.Body>
      <Dialog.Footer>
        {skipped > 0 && (
          <span className="mr-auto text-body-sm text-fg-muted">
            ID 없는 화면 {skipped}개 제외
          </span>
        )}
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          variant="primary"
          loading={add.isPending}
          disabled={count === 0}
          onClick={() => add.mutate()}
        >
          {count > 0 ? `화면 ${count}개 추가` : "화면 추가"}
        </Button>
      </Dialog.Footer>
    </>
  );
}
