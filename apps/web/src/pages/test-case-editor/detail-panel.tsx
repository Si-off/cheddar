import {
  Button,
  Checkbox,
  Input,
  Label,
  Textarea,
  WorkspaceIcon,
} from "@cheddar/ui/legacy";
import {
  type CaseDraft,
  displayValue,
  type FrameReference,
  type IaReference,
  type Snapshot,
  setValue,
} from "@/entities/test-case";
import { WorkspaceSelect } from "@/shared/ui/workspace";
import { ColumnValueEditor } from "@/widgets/test-case-table/column-value-editor";

type Props = {
  embedded?: boolean;
  snapshot: Snapshot;
  item: CaseDraft;
  disabled?: boolean;
  frames: FrameReference[];
  iaItems: IaReference[];
  uploads: { id: string; name: string }[];
  uploadId: string;
  onUpload: (id: string) => void;
  onChange: (item: CaseDraft) => void;
  onComposition: (value: boolean) => void;
  onClose: () => void;
};
export function DetailPanel({
  embedded = false,
  snapshot,
  item,
  disabled,
  frames,
  iaItems,
  uploads,
  uploadId,
  onUpload,
  onChange,
  onComposition,
  onClose,
}: Props) {
  const columns = snapshot.view
    .map((v) => snapshot.columns.find((c) => c.id === v.columnId))
    .filter((c) => !!c);
  const Container = embedded ? "section" : "aside";
  return (
    <Container
      className={`test-scenario-detail${embedded ? " is-embedded" : ""}`}
      aria-label="테스트 케이스 상세 편집"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading font-heading">
          {item.caseCode || "새 테스트 케이스"}
        </h2>
        {!embedded && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="상세 닫기"
          >
            <WorkspaceIcon name="close" />
          </Button>
        )}
      </div>
      {columns
        .filter((c) => !!c)
        .map((column) => {
          const inputId = `detail-${column.id}`;
          const value = displayValue(snapshot, item, column);
          return (
            <div className="mt-4" key={column.id}>
              <Label htmlFor={inputId}>{column.name}</Label>
              {column.kind === "custom" ? (
                <ColumnValueEditor
                  id={inputId}
                  column={column}
                  value={item.customValues[column.id]}
                  disabled={disabled}
                  onComposition={onComposition}
                  onChange={(value) =>
                    onChange({
                      ...item,
                      customValues: {
                        ...item.customValues,
                        [column.id]: value,
                      },
                    })
                  }
                />
              ) : column.field === "caseCode" || column.field === "title" ? (
                <Input
                  id={inputId}
                  disabled={disabled}
                  value={value}
                  onCompositionStart={() => onComposition(true)}
                  onCompositionEnd={() => onComposition(false)}
                  onValueChange={(value) =>
                    onChange(setValue(item, column, value))
                  }
                  onBlur={() => onComposition(false)}
                />
              ) : (
                <Textarea
                  id={inputId}
                  disabled={disabled}
                  value={value}
                  onCompositionStart={() => onComposition(true)}
                  onCompositionEnd={() => onComposition(false)}
                  onChange={(e) =>
                    onChange(setValue(item, column, e.target.value))
                  }
                  onBlur={() => onComposition(false)}
                />
              )}
            </div>
          );
        })}
      <fieldset className="mt-5" disabled={disabled}>
        <legend className="text-label font-label">관련 화면</legend>
        <Label htmlFor="frame-upload">Figma 자료</Label>
        <WorkspaceSelect
          id="frame-upload"
          value={uploadId}
          disabled={disabled}
          onValueChange={onUpload}
          options={[
            { value: "", label: "자료 선택" },
            ...uploads.map((u) => ({ value: u.id, label: u.name })),
          ]}
        />
        <div className="mt-3 flex flex-col gap-2">
          {frames.map((f) => (
            <Label key={f.id}>
              <Checkbox
                checked={item.relatedFrameIds.includes(f.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...item,
                    relatedFrameIds: checked
                      ? [...item.relatedFrameIds, f.id]
                      : item.relatedFrameIds.filter((id) => id !== f.id),
                  })
                }
              />
              {f.name}{" "}
              <span className="text-caption text-muted">{f.figmaNodeId}</span>
            </Label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-5" disabled={disabled}>
        <legend className="text-label font-label">화면 ID</legend>
        <div className="mt-2 flex flex-col gap-2">
          {iaItems.map((i) => (
            <Label key={i.id}>
              <Checkbox
                checked={item.screenIds.includes(i.id)}
                onCheckedChange={(checked) =>
                  onChange({
                    ...item,
                    screenIds: checked
                      ? [...item.screenIds, i.id]
                      : item.screenIds.filter((id) => id !== i.id),
                  })
                }
              />
              {i.screenId} {i.name}
            </Label>
          ))}
        </div>
      </fieldset>
    </Container>
  );
}
