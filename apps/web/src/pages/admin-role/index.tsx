import { LoadError } from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { roleQuery } from "@/entities/role";
import { RoleEditor } from "@/features/manage-role";

/** roleId가 "new"이면 새 역할을 만든다. */
export function AdminRolePage({ roleId }: { roleId: string }) {
  const navigate = useNavigate();
  const isNew = roleId === "new";
  const role = useQuery({ ...roleQuery(roleId), enabled: !isNew });
  if (!isNew && role.isError) {
    return (
      <LoadError
        title="역할을 불러오지 못했습니다"
        onRetry={() => role.refetch()}
      />
    );
  }
  if (!isNew && !role.data) return null;
  return (
    <div className="flex flex-col gap-5">
      <h2 className="m-0 text-title text-fg">
        {isNew ? "새 역할" : role.data?.name}
      </h2>
      <RoleEditor
        key={roleId}
        role={isNew ? undefined : role.data}
        onSaved={(id) =>
          isNew &&
          navigate({
            to: "/admin/roles/$roleId",
            params: { roleId: id },
            replace: true,
          })
        }
        onCancel={() => navigate({ to: "/admin/roles" })}
      />
    </div>
  );
}
