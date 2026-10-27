import { useMutation } from "@tanstack/react-query";
import { Button, Checkbox, cn, Dialog, SourceInput } from "@workspace/ui";
import { Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ScreenIdRuleDraft,
  type ScreenIdRuleInput,
  screenIdExampleParts,
  screenSourceAccept,
} from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";
import { InlineInput, isValidRule, RuleForm, RuleParts } from "./rule-dialog";

const readFailure = "자료를 읽지 못했습니다. 잠시 후 다시 시도하세요.";

type Draft = ScreenIdRuleDraft & { id: string };

export interface NewRuleDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 규칙 하나를 저장한다. 실패하면 거부한다. */
  onCreate: (input: ScreenIdRuleInput) => Promise<unknown>;
  pending?: boolean;
}

/** 규칙 추가. 자료를 넣으면 AI 초안을 고쳐 저장하고, 직접 만들기는 빈 편집기로 간다. */
export function NewRuleDialog({
  projectId,
  open,
  onOpenChange,
  onCreate,
  pending,
}: NewRuleDialogProps) {
  const [phase, setPhase] = useState<"source" | "drafts" | "manual">("source");
  return (
    <Dialog.Root
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(next) => !next && setPhase("source")}
    >
      <Dialog.Content size={phase === "source" ? "md" : "lg"}>
        {open && (
          <Flow
            projectId={projectId}
            phase={phase}
            onPhase={setPhase}
            onCreate={onCreate}
            pending={pending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </Dialog.Content>
    </Dialog.Root>
  );
}

function Flow({
  projectId,
  phase,
  onPhase,
  onCreate,
  pending,
  onDone,
}: {
  projectId: string;
  phase: "source" | "drafts" | "manual";
  onPhase: (phase: "source" | "drafts" | "manual") => void;
  onCreate: (input: ScreenIdRuleInput) => Promise<unknown>;
  pending?: boolean;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [unread, setUnread] = useState<string[]>([]);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 저장 중에 창을 닫으면 아직 시작하지 않은 규칙은 저장하지 않는다
  const closed = useRef(false);
  useEffect(() => {
    closed.current = false;
    return () => {
      closed.current = true;
    };
  }, []);

  const read = useMutation({
    mutationFn: async () =>
      (
        await sdk.draftProjectScreenIdRules({
          path: { projectId },
          body: { text, "files[]": files },
          throwOnError: true,
        })
      ).data,
    onSuccess: (data) => {
      const items = data.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));
      setDrafts(items);
      setUnread(data.unreadFiles);
      setOff(new Set());
      setSelected(items[0]?.id ?? "");
      onPhase("drafts");
    },
  });

  if (phase === "manual")
    return (
      <RuleForm
        rule={null}
        pending={pending}
        onSave={(input) => onCreate(input).then(onDone, () => {})}
      />
    );

  if (phase === "source")
    return (
      <>
        <Dialog.Header title="규칙 추가" />
        <Dialog.Body>
          <SourceInput
            label="화면 ID 자료"
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
          <Button disabled={read.isPending} onClick={() => onPhase("manual")}>
            직접 만들기
          </Button>
          <Button
            variant="ai"
            icon={Sparkles}
            loading={read.isPending}
            disabled={!text.trim() && files.length === 0}
            onClick={() => read.mutate()}
          >
            규칙 만들기
          </Button>
        </Dialog.Footer>
      </>
    );

  const chosen = drafts.filter((d) => !off.has(d.id));
  const current = drafts.find((d) => d.id === selected) ?? drafts[0];
  const update = (id: string, patch: Partial<ScreenIdRuleDraft>) =>
    setDrafts((list) =>
      list.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  // 하나씩 저장하고, 실패하면 저장한 것만 목록에서 빼고 멈춘다. 오류는 저장 쪽이 알린다.
  const save = async () => {
    setSaving(true);
    const saved = new Set<string>();
    try {
      for (const draft of chosen) {
        if (closed.current) return;
        await onCreate({
          name: draft.name.trim(),
          separator: draft.separator,
          parts: draft.parts,
        });
        saved.add(draft.id);
      }
      onDone();
    } catch {
      setDrafts((list) => list.filter((d) => !saved.has(d.id)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog.Header title="규칙 추가" />
      <Dialog.Body className="gap-6">
        {unread.length > 0 && (
          <p className="m-0 flex items-center gap-2 text-body-sm text-warning">
            <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
            {unread.join(", ")} 파일을 읽지 못했습니다.
          </p>
        )}
        <ul
          aria-label="찾은 규칙"
          className="m-0 flex list-none flex-col overflow-hidden rounded-lg border border-line p-0"
        >
          {drafts.map((draft) => {
            const on = draft.id === current?.id;
            const included = !off.has(draft.id);
            return (
              <li
                key={draft.id}
                className={cn(
                  "flex items-center gap-3 border-line px-3 py-2 transition-colors duration-fast not-first:border-t hover:bg-subtle",
                  on && "bg-selected hover:bg-selected",
                )}
              >
                <Checkbox
                  aria-label={`${draft.name} 추가`}
                  checked={included}
                  onCheckedChange={(checked) => {
                    const next = new Set(off);
                    if (checked) next.delete(draft.id);
                    else next.add(draft.id);
                    setOff(next);
                  }}
                />
                {renaming === draft.id ? (
                  <InlineInput
                    value={draft.name}
                    label="규칙 이름"
                    onCommit={(v) => {
                      if (v.trim()) update(draft.id, { name: v.trim() });
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                    className="w-40"
                  />
                ) : (
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(draft.id)}
                    onDoubleClick={() => setRenaming(draft.id)}
                    className="flex min-w-0 flex-1 items-center gap-4 border-0 bg-transparent py-1 text-left"
                  >
                    <span
                      className={cn(
                        "w-32 shrink-0 truncate font-medium text-body",
                        on
                          ? "text-accent-text"
                          : included
                            ? "text-fg"
                            : "text-fg-faint",
                      )}
                    >
                      {draft.name}
                    </span>
                    <span
                      className={cn(
                        "truncate font-mono text-mono",
                        included ? "text-fg-muted" : "text-fg-faint",
                      )}
                    >
                      {screenIdExampleParts(draft).join(draft.separator)}
                    </span>
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {current && (
          <RuleParts
            key={current.id}
            parts={current.parts}
            separator={current.separator}
            onPartsChange={(parts) => update(current.id, { parts })}
          />
        )}
      </Dialog.Body>
      <Dialog.Footer>
        <Dialog.Close render={<Button variant="ghost" />}>취소</Dialog.Close>
        <Button
          variant="primary"
          loading={saving}
          disabled={chosen.length === 0 || !chosen.every(isValidRule)}
          onClick={() => void save()}
        >
          {chosen.length > 0 ? `규칙 ${chosen.length}개 추가` : "규칙 추가"}
        </Button>
      </Dialog.Footer>
    </>
  );
}
