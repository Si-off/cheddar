import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  WorkspaceIcon,
} from "@cheddar/ui";
import { useState } from "react";
import { type Column, displayValue, type Snapshot } from "@/entities/test-case";
export function SharedTestScenarioView({
  snapshot,
  hidden = new Set<string>(),
}: {
  snapshot: Snapshot;
  hidden?: Set<string>;
}) {
  const [detail, setDetail] = useState<string>();
  const columns = snapshot.view
    .map((v) => snapshot.columns.find((c) => c.id === v.columnId))
    .filter(
      (c): c is Column =>
        !!c && c.field !== "relatedFrames" && !hidden.has(c.id),
    );
  const item = snapshot.cases.find((c) => c.id === detail);
  return (
    <section
      className="workspace-shared-testScenario"
      aria-label="시나리오 미리보기"
    >
      <div className="workspace-page-heading">
        <h2>{snapshot.name}</h2>
        <span className="workspace-readonly">
          <WorkspaceIcon name="file" />
          읽기 전용
        </span>
      </div>
      <div className="test-scenario-table-scroll">
        <table className="test-scenario-table">
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.id}>{c.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot.cases.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => (
                  <td key={c.id}>
                    {c.field === "title" ? (
                      <button
                        type="button"
                        className="workspace-shared-title"
                        onClick={() => setDetail(row.id)}
                      >
                        {displayValue(snapshot, row, c) ||
                          "제목 없는 테스트 케이스"}
                      </button>
                    ) : (
                      <span className="test-scenario-cell-text">
                        {displayValue(snapshot, row, c)}
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!snapshot.cases.length && (
        <p className="workspace-empty">테스트 케이스가 없습니다</p>
      )}
      <span className="workspace-count">테스트 {snapshot.cases.length}개</span>
      <Dialog
        open={!!item}
        onOpenChange={(open) => {
          if (!open) setDetail(undefined);
        }}
      >
        <DialogContent
          className="workspace-detail-dialog"
          aria-describedby={undefined}
        >
          <DialogTitle>테스트 케이스 상세</DialogTitle>
          {item && (
            <dl className="workspace-readonly-fields">
              {columns.map((c) => (
                <div key={c.id}>
                  <dt>{c.name}</dt>
                  <dd>{displayValue(snapshot, item, c) || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function SharedTestCasesPage() {
  return (
    <div className="workspace-empty">
      <WorkspaceIcon name="file" />
      <h1>시나리오 미리보기가 없습니다</h1>
      <Button variant="outline" onClick={() => location.assign("/")}>
        프로젝트 목록
      </Button>
    </div>
  );
}
