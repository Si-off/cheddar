import {
  Badge,
  Button,
  ConfirmDialog,
  DataGrid,
  type DataGridColumn,
  IconButton,
  LoadError,
  Menu,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Copy, MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { type Role, rolesQuery } from "@/entities/role";
import { useRoleActions } from "@/features/manage-role";

export function AdminRolesPage() {
  const navigate = useNavigate();
  const rolesResult = useQuery(rolesQuery());
  const roles = rolesResult.data ?? [];
  const { duplicate, remove } = useRoleActions((roleId) =>
    navigate({ to: "/admin/roles/$roleId", params: { roleId } }),
  );
  const [deleting, setDeleting] = useState<Role | null>(null);

  // 고정 역할(링크 방문자)은 맨 아래에 둔다
  const rows = [
    ...roles.filter((r) => !r.fixed),
    ...roles.filter((r) => r.fixed),
  ];

  const columns: DataGridColumn<Role>[] = [
    {
      id: "name",
      header: "역할",
      width: 320,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <Link
            to="/admin/roles/$roleId"
            params={{ roleId: r.id }}
            className="font-medium text-fg no-underline hover:text-accent-text hover:underline"
          >
            {r.name}
          </Link>
          {r.fixed && <Badge>고정</Badge>}
        </span>
      ),
    },
    {
      id: "permissions",
      header: "권한",
      width: 120,
      cell: (r) => `${r.permissions.length}개`,
    },
    {
      id: "expiry",
      header: "만료일",
      width: 140,
      cell: (r) =>
        r.requiresExpiry ? `필수, ${r.defaultExpiryDays ?? ""}일` : "",
    },
    {
      id: "actions",
      header: "",
      width: 64,
      cell: (r) =>
        r.fixed ? null : (
          <Menu.Root>
            <Menu.Trigger
              render={
                <IconButton
                  icon={MoreHorizontal}
                  label={`${r.name} 작업`}
                  size="sm"
                />
              }
            />
            <Menu.Popup align="end">
              <Menu.Item icon={Copy} onClick={() => duplicate.mutate(r)}>
                복제
              </Menu.Item>
              <Menu.Separator />
              <Menu.Item
                icon={Trash2}
                tone="danger"
                onClick={() => setDeleting(r)}
              >
                삭제
              </Menu.Item>
            </Menu.Popup>
          </Menu.Root>
        ),
    },
  ];

  return (
    <>
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={Plus}
          render={<Link to="/admin/roles/$roleId" params={{ roleId: "new" }} />}
          nativeButton={false}
        >
          역할 만들기
        </Button>
      </div>
      {rolesResult.isError ? (
        <LoadError
          title="역할을 불러오지 못했습니다"
          onRetry={() => rolesResult.refetch()}
        />
      ) : (
        <DataGrid
          aria-label="역할 목록"
          selection="none"
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
        />
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description="할당된 계정이 있으면 삭제할 수 없습니다."
        confirmLabel="삭제"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, { onSettled: () => setDeleting(null) })
        }
      />
    </>
  );
}
