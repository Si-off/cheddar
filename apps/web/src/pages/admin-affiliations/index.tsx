import {
  ConfirmDialog,
  DataGrid,
  type DataGridColumn,
  IconButton,
  LoadError,
  Menu,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { type Affiliation, affiliationsQuery } from "@/entities/affiliation";
import {
  AddAffiliationForm,
  RenameAffiliationDialog,
  useAffiliationActions,
} from "@/features/manage-affiliation";

export function AdminAffiliationsPage() {
  const affiliationsResult = useQuery(affiliationsQuery());
  const affiliations = affiliationsResult.data ?? [];
  const { remove } = useAffiliationActions();
  const [renaming, setRenaming] = useState<Affiliation | null>(null);
  const [deleting, setDeleting] = useState<Affiliation | null>(null);

  const columns: DataGridColumn<Affiliation>[] = [
    {
      id: "name",
      header: "소속",
      width: 400,
      cell: (a) => <span className="font-medium">{a.name}</span>,
    },
    {
      id: "actions",
      header: "",
      width: 64,
      cell: (a) => (
        <Menu.Root>
          <Menu.Trigger
            render={
              <IconButton
                icon={MoreHorizontal}
                label={`${a.name} 작업`}
                size="sm"
              />
            }
          />
          <Menu.Popup align="end">
            <Menu.Item onClick={() => setRenaming(a)}>이름 변경</Menu.Item>
            <Menu.Separator />
            <Menu.Item
              icon={Trash2}
              tone="danger"
              onClick={() => setDeleting(a)}
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
      <AddAffiliationForm />
      {affiliationsResult.isError ? (
        <LoadError
          title="소속을 불러오지 못했습니다"
          onRetry={() => affiliationsResult.refetch()}
        />
      ) : (
        <DataGrid
          aria-label="소속 목록"
          selection="none"
          className="max-w-xl"
          columns={columns}
          rows={affiliations}
          getRowId={(a) => a.id}
        />
      )}
      <RenameAffiliationDialog
        affiliation={renaming}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`${deleting?.name ?? ""} 삭제`}
        description="계정이 있는 소속은 삭제할 수 없습니다."
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
