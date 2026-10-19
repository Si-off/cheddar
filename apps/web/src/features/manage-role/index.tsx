import {
  Badge,
  Button,
  Checkbox,
  Switch,
  TextField,
  useToast,
} from "@cheddar/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type SubmitEvent, useState } from "react";
import { type PermissionKey, permissionCatalog } from "@/entities/permission";
import type { Role } from "@/entities/role";
import { sdk, toApiFailure } from "@/shared/api";

interface RoleDraft {
  name: string;
  permissions: PermissionKey[];
  requiresExpiry: boolean;
  defaultExpiryDays: string;
}

const groups = ["테스트 세트", "작업 준비", "관리"] as const;

function useInvalidateRoles() {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const id = (query.queryKey[0] as { _id?: string } | undefined)?._id;
        // 내 계정에 할당된 역할이면 내 권한도 바뀐다
        return (
          id === "getMe" ||
          id === "listRoles" ||
          id === "getRole" ||
          id === "listAccounts" ||
          id === "getAccount"
        );
      },
    });
}

export interface RoleEditorProps {
  /** 없으면 새 역할 */
  role?: Role;
  onSaved: (roleId: string) => void;
  onCancel: () => void;
}

/** 역할 이름, 권한, 만료일 규칙을 편집한다. 고정 역할(링크 방문자)은 XLSX 내보내기만 바꿀 수 있다. */
export function RoleEditor({ role, onSaved, onCancel }: RoleEditorProps) {
  const toast = useToast();
  const invalidate = useInvalidateRoles();
  const [draft, setDraft] = useState<RoleDraft>({
    name: role?.name ?? "",
    permissions: role?.permissions ?? [],
    requiresExpiry: role?.requiresExpiry ?? false,
    defaultExpiryDays: role?.defaultExpiryDays
      ? String(role.defaultExpiryDays)
      : "90",
  });
  const [touched, setTouched] = useState(false);
  const fixed = role?.fixed ?? false;
  const days = Number(draft.defaultExpiryDays);
  const daysValid =
    !draft.requiresExpiry || (Number.isInteger(days) && days > 0);
  const nameValid = draft.name.trim().length > 0;

  const save = useMutation({
    mutationFn: async () => {
      const body = fixed
        ? { permissions: draft.permissions }
        : {
            name: draft.name.trim(),
            permissions: draft.permissions,
            requiresExpiry: draft.requiresExpiry,
            defaultExpiryDays: draft.requiresExpiry ? days : null,
          };
      if (role)
        return (
          await sdk.updateRole({
            path: { roleId: role.id },
            body,
            throwOnError: true,
          })
        ).data;
      return (
        await sdk.createRole({
          body: {
            name: draft.name.trim(),
            permissions: draft.permissions,
            requiresExpiry: draft.requiresExpiry,
            defaultExpiryDays: draft.requiresExpiry ? days : null,
          },
          throwOnError: true,
        })
      ).data;
    },
    onSuccess: async (saved) => {
      toast.show({ message: "저장했습니다", tone: "success" });
      await invalidate();
      onSaved(saved.id);
    },
    onError: (error) =>
      toast.show({
        message: toApiFailure(error, {
          unknownResult:
            "응답을 받지 못했습니다. 새로 고쳐 저장됐는지 확인하세요.",
        }).message,
        tone: "danger",
      }),
  });

  const toggle = (key: PermissionKey, on: boolean) =>
    setDraft({
      ...draft,
      permissions: on
        ? [...draft.permissions, key]
        : draft.permissions.filter((p) => p !== key),
    });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTouched(true);
    if (nameValid && daysValid) save.mutate();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 lg:col-span-2">
          <h2 className="m-0 text-title-sm text-fg">권한</h2>
          {groups.map((group) => (
            <div key={group} className="flex flex-col">
              <span className="text-overline text-fg-muted">{group}</span>
              {permissionCatalog
                .filter((p) => p.group === group)
                .map((p) => (
                  <div
                    key={p.key}
                    className="flex items-start gap-2 border-b border-line py-2.5 last:border-b-0"
                  >
                    <Checkbox
                      className="min-w-0 flex-1"
                      label={p.label}
                      description={p.description}
                      checked={draft.permissions.includes(p.key)}
                      disabled={fixed && p.key !== "test_set.export"}
                      onCheckedChange={(on) => toggle(p.key, on)}
                    />
                    {p.globalOnly && <Badge>전체만</Badge>}
                  </div>
                ))}
            </div>
          ))}
        </section>
        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
            <h2 className="m-0 text-title-sm text-fg">기본 정보</h2>
            <TextField
              label="역할 이름"
              required
              readOnly={fixed}
              value={draft.name}
              error={
                touched && !nameValid ? "역할 이름을 입력하세요" : undefined
              }
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </section>
          {!fixed && (
            <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
              <h2 className="m-0 text-title-sm text-fg">만료일</h2>
              <Switch
                label="만료일 필수"
                checked={draft.requiresExpiry}
                onCheckedChange={(on) =>
                  setDraft({ ...draft, requiresExpiry: on })
                }
              />
              <TextField
                label="기본 기간"
                type="number"
                min={1}
                trailing="일"
                className="w-40"
                disabled={!draft.requiresExpiry}
                value={draft.defaultExpiryDays}
                error={
                  touched && !daysValid ? "1일 이상 입력하세요" : undefined
                }
                onChange={(e) =>
                  setDraft({ ...draft, defaultExpiryDays: e.target.value })
                }
              />
            </section>
          )}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          저장
        </Button>
      </div>
    </form>
  );
}

/** 목록에서 쓰는 역할 작업 */
export function useRoleActions(onDuplicated: (roleId: string) => void) {
  const toast = useToast();
  const invalidate = useInvalidateRoles();
  const onError = (error: unknown) =>
    toast.show({
      message: toApiFailure(error, {
        unknownResult: "응답을 받지 못했습니다. 새로 고쳐 결과를 확인하세요.",
      }).message,
      tone: "danger",
    });
  const duplicate = useMutation({
    mutationFn: async (role: Pick<Role, "id" | "name">) =>
      (
        await sdk.duplicateRole({
          path: { roleId: role.id },
          body: { name: `${role.name} 복사본` },
          throwOnError: true,
        })
      ).data,
    onSuccess: async (role) => {
      await invalidate();
      onDuplicated(role.id);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (roleId: string) =>
      sdk.deleteRole({ path: { roleId }, throwOnError: true }),
    onSuccess: () => {
      toast.show({ message: "삭제했습니다", tone: "success" });
      return invalidate();
    },
    onError,
  });
  return { duplicate, remove };
}
