import { ColumnSettings } from "@/widgets/test-case-table/column-settings";
import { type FieldErrors, MAX_COLUMN_WIDTH, type TemplateForm } from "./model";
export function TemplateEditor({
  value,
  onChange,
  onRemove,
  errors,
  disabled,
}: {
  value: TemplateForm;
  onChange: (value: TemplateForm) => void;
  onRemove: (id: string) => void;
  errors: FieldErrors;
  disabled: boolean;
}) {
  const resize = (id: string, width: number) =>
    onChange({
      ...value,
      view: value.view.map((entry) =>
        entry.columnId === id
          ? {
              ...entry,
              width: String(
                Math.max(1, Math.min(MAX_COLUMN_WIDTH, Math.round(width))),
              ),
            }
          : entry,
      ),
    });
  return (
    <div className="workspace-template-editor">
      <section
        className="template-section"
        aria-labelledby="template-columns-heading"
      >
        <header className="template-section-heading">
          <h2 id="template-columns-heading">열 구성</h2>
          <p>기본 양식은 새 시나리오에만 적용됩니다.</p>
        </header>
        <ColumnSettings
          appearance="template"
          columns={value.columns}
          view={value.view.map((v) => ({ ...v, width: Number(v.width) }))}
          disabled={disabled}
          onChange={(columns, view) =>
            onChange({
              columns,
              view: view.map((v) => ({ ...v, width: String(v.width) })),
            })
          }
          onRemove={onRemove}
        />
      </section>
      <section
        className="template-section template-preview-section"
        aria-labelledby="template-preview-heading"
      >
        <header className="template-section-heading">
          <h2 id="template-preview-heading">양식 미리보기</h2>
        </header>
        <div className="test-scenario-table-scroll workspace-template-preview">
          <table
            className="test-scenario-table"
            aria-label="양식 미리보기"
            style={{
              width: value.view.reduce((sum, v) => sum + Number(v.width), 0),
            }}
          >
            <thead>
              <tr>
                {value.view.map((entry) => {
                  const column = value.columns.find(
                    (c) => c.id === entry.columnId,
                  );
                  if (!column) return null;
                  return (
                    <th
                      key={column.id}
                      style={{
                        width: Number(entry.width),
                        minWidth: Number(entry.width),
                      }}
                    >
                      <span>{column.name}</span>
                      <button
                        type="button"
                        className="test-scenario-resize"
                        aria-label={`${column.name} 기본 너비 조절`}
                        disabled={disabled}
                        onKeyDown={(event) => {
                          if (
                            event.key !== "ArrowLeft" &&
                            event.key !== "ArrowRight"
                          )
                            return;
                          event.preventDefault();
                          resize(
                            column.id,
                            Number(entry.width) +
                              (event.key === "ArrowRight" ? 1 : -1) *
                                (event.shiftKey ? 10 : 1),
                          );
                        }}
                        onPointerDown={(event) => {
                          const start = event.clientX,
                            width = Number(entry.width),
                            el = event.currentTarget;
                          el.setPointerCapture(event.pointerId);
                          const move = (ev: PointerEvent) =>
                            resize(column.id, width + ev.clientX - start);
                          const end = () => {
                            el.removeEventListener("pointermove", move);
                            el.removeEventListener("pointerup", end);
                            el.removeEventListener("pointercancel", end);
                          };
                          el.addEventListener("pointermove", move);
                          el.addEventListener("pointerup", end);
                          el.addEventListener("pointercancel", end);
                        }}
                      />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td
                  colSpan={value.view.length}
                  className="template-preview-empty"
                >
                  테스트 케이스가 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
      {Object.values(errors).map((error) => (
        <p role="alert" key={error} className="text-danger">
          {error}
        </p>
      ))}
    </div>
  );
}
