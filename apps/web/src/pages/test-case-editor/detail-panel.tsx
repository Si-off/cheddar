import {
  Button,
  Checkbox,
  Input,
  Label,
  Textarea,
  WorkspaceIcon,
} from "@cheddar/ui";
import {
  type CaseDraft,
  displayValue,
  type FrameReference,
  type IaReference,
  type Snapshot,
  setValue,
} from "@/entities/test-case";

type Props = {
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
  return (
    <aside
      className="test-scenario-detail"
      aria-label="테스트 케이스 상세 편집"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-heading font-heading">
          {item.caseCode || "새 테스트 케이스"}
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="상세 닫기"
        >
          <WorkspaceIcon name="close" />
        </Button>
      </div>
      {columns
        .filter((c) => c.field !== "relatedFrames" && c.field !== "screens")
        .map((column) => {
          const inputId = `detail-${column.id}`;
          const value = displayValue(snapshot, item, column);
          return (
            <div className="mt-4" key={column.id}>
              <Label htmlFor={inputId}>{column.name}</Label>
              {column.field === "priority" ? (
                <select
                  className="test-scenario-select"
                  id={inputId}
                  disabled={disabled}
                  value={item.priority ?? ""}
                  onChange={(e) =>
                    onChange(setValue(item, column, e.target.value))
                  }
                >
                  <option value="">미지정</option>
                  <option value="high">높음</option>
                  <option value="medium">보통</option>
                  <option value="low">낮음</option>
                </select>
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
        <legend className="text-label font-label">
          {snapshot.columns.find((c) => c.field === "relatedFrames")?.name ??
            "관련 화면"}
        </legend>
        <Label htmlFor="frame-upload">업로드 묶음</Label>
        <select
          className="test-scenario-select"
          id="frame-upload"
          value={uploadId}
          onChange={(e) => onUpload(e.target.value)}
        >
          <option value="">선택</option>
          {uploads.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
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
        <legend className="text-label font-label">
          {snapshot.columns.find((c) => c.field === "screens")?.name ??
            "화면 ID"}
        </legend>
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
    </aside>
  );
}
