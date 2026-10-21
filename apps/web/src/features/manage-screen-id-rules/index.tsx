import {
  Button,
  ConfirmDialog,
  cn,
  IconButton,
  Menu,
  SortableList,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  type ScreenIdRule,
  type ScreenIdRuleInput,
  screenIdExampleParts,
  screenIdRulesQuery,
  screensQuery,
} from "@/entities/project";
import { sdk, toApiFailure } from "@/shared/api";
import { ScreenIdRuleDialog } from "./rule-dialog";

const unknownResult = "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.";

function useRuleActions(projectId: string) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { queryKey } = screenIdRulesQuery(projectId);
  const onError = (error: unknown) => {
    toast.show({
      message: toApiFailure(error, { unknownResult }).message,
      tone: "danger",
    });
    return queryClient.invalidateQueries({ queryKey });
  };
  // 규칙 불일치는 화면 목록 응답이 계산하므로 함께 다시 읽는다
  const onSuccess = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({
        queryKey: screensQuery(projectId).queryKey,
      }),
    ]);
  const path = { projectId };

  const create = useMutation({
    mutationFn: (body: ScreenIdRuleInput) =>
      sdk.createProjectScreenIdRule({ path, body, throwOnError: true }),
    onSuccess,
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: ScreenIdRuleInput & { id: string }) =>
      sdk.updateProjectScreenIdRule({
        path: { ...path, ruleId: id },
        body,
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      sdk.deleteProjectScreenIdRule({
        path: { ...path, ruleId: id },
        throwOnError: true,
      }),
    onSuccess,
    onError,
  });
  const reorder = useMutation({
    mutationFn: (rules: ScreenIdRule[]) =>
      sdk.reorderProjectScreenIdRules({
        path,
        body: { ids: rules.map((r) => r.id) },
        throwOnError: true,
      }),
    onMutate: (rules) => {
      void queryClient.cancelQueries({ queryKey });
      queryClient.setQueryData(queryKey, rules);
    },
    onSuccess,
    onError,
  });
  return { create, update, remove, reorder };
}

export interface ScreenIdRulesEditorProps {
  projectId: string;
  rules: ScreenIdRule[];
  readOnly?: boolean;
}

/** 화면 ID 규칙 목록. 규칙마다 예시 ID를 부분으로 나눠 보여주고, 메뉴에서 고치거나 지운다. */
export function ScreenIdRulesEditor({
  projectId,
  rules,
  readOnly,
}: ScreenIdRulesEditorProps) {
  const actions = useRuleActions(projectId);
  const [editing, setEditing] = useState<ScreenIdRule | "new" | null>(null);
  const [deleting, setDeleting] = useState<ScreenIdRule | null>(null);
  const save = (input: ScreenIdRuleInput) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing === "new") actions.create.mutate(input, done);
    else if (editing) actions.update.mutate({ id: editing.id, ...input }, done);
  };

  return (
    <section
      aria-labelledby="screen-id-rules-title"
      className="flex flex-col gap-3"
    >
      <div className="flex min-h-8 items-center gap-2">
        <h2 id="screen-id-rules-title" className="m-0 text-title-sm text-fg">
          화면 ID 규칙
        </h2>
        <span className="flex-1" />
        {!readOnly && (
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={() => setEditing("new")}
          >
            규칙 추가
          </Button>
        )}
      </div>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <SortableList
          aria-label="화면 ID 규칙"
          items={rules}
          disabled={readOnly}
          getId={(r) => r.id}
          getHandleLabel={(r) => `${r.name} 순서 이동`}
          onReorder={(next) => actions.reorder.mutate(next)}
          divided
          renderItem={(rule, handle) => (
            <div className="flex items-center gap-3 px-4 py-2.5">
              {handle}
              <span className="w-40 shrink-0 truncate font-medium text-body text-fg">
                {rule.name}
              </span>
              <RuleExample rule={rule} className="min-w-0 flex-1" />
              {!readOnly && (
                <Menu.Root>
                  <Menu.Trigger
                    render={
                      <IconButton
                        icon={MoreHorizontal}
                        label={`${rule.name} 작업`}
                        size="sm"
                      />
                    }
                  />
                  <Menu.Popup align="end">
                    <Menu.Item onClick={() => setEditing(rule)}>편집</Menu.Item>
                    <Menu.Separator />
                    <Menu.Item
                      icon={Trash2}
                      tone="danger"
                      onClick={() => setDeleting(rule)}
                    >
                      삭제
                    </Menu.Item>
                  </Menu.Popup>
                </Menu.Root>
              )}
            </div>
          )}
        />
        {!readOnly && (
          <button
            type="button"
            aria-label="규칙 추가"
            onClick={() => setEditing("new")}
            className={cn(
              "grid min-h-10 w-full place-items-center border-0 bg-transparent text-fg-muted transition-colors duration-fast hover:bg-subtle hover:text-fg",
              rules.length > 0 && "border-line border-t",
            )}
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden />
          </button>
        )}
      </div>
      <ScreenIdRuleDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        rule={editing === "new" ? null : editing}
        pending={actions.create.isPending || actions.update.isPending}
        onSave={save}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description="이미 붙인 화면 ID는 그대로 남습니다."
        confirmLabel="삭제"
        tone="danger"
        pending={actions.remove.isPending}
        onConfirm={() =>
          deleting &&
          actions.remove.mutate(deleting.id, {
            onSettled: () => setDeleting(null),
          })
        }
      />
    </section>
  );
}

/** 예시 ID를 부분마다 한 덩어리로 보여준다. 부분 이름은 아래에 작게. */
function RuleExample({
  rule,
  className,
}: {
  rule: ScreenIdRule;
  className?: string;
}) {
  const values = screenIdExampleParts(rule);
  return (
    <span className={cn("flex flex-wrap items-end gap-x-0.5", className)}>
      {rule.parts.map((part, i) => (
        // 부분은 같은 이름이 있을 수 있고 순서가 곧 정체성이라 자리로 구분한다
        // biome-ignore lint/suspicious/noArrayIndexKey: 표시 전용 목록
        <span key={i} className="flex items-end gap-x-0.5">
          {i > 0 && (
            <span className="pb-3.5 font-mono text-fg-faint text-mono">
              {rule.separator}
            </span>
          )}
          <span className="flex flex-col items-center">
            <span className="font-mono text-fg text-mono">{values[i]}</span>
            <span className="text-caption text-fg-muted">{part.name}</span>
          </span>
        </span>
      ))}
    </span>
  );
}
