import { Button, Checkbox, Input, Label, Textarea } from "@cheddar/ui";
import { useEffect, useState } from "react";
import type { Snapshot } from "@/entities/test-case";
import type {
  GenerationDto,
  GenerationResultItemDto,
  ReviewGenerationResultDto,
} from "@/shared/api/generated";

const fields = [
  ["preconditions", "사전 조건"],
  ["steps", "수행 절차"],
  ["expectedResult", "예상 결과"],
] as const;
export function similarCases(title: string, snapshot: Snapshot) {
  const words = new Set(
    title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 1),
  );
  return snapshot.cases
    .map((item) => ({
      item,
      score:
        item.title === title
          ? 1
          : item.title
              .toLowerCase()
              .split(/\s+/)
              .filter((w) => words.has(w)).length / Math.max(words.size, 1),
    }))
    .filter((x) => x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.item);
}
export function GenerationResults({
  jobs,
  snapshot,
  disabled,
  onReview,
  onAdd,
}: {
  jobs: GenerationDto[];
  snapshot: Snapshot;
  disabled: boolean;
  onReview: (
    job: GenerationDto,
    c: GenerationResultItemDto,
    action: ReviewGenerationResultDto["action"],
    content?: GenerationResultItemDto["content"],
    revision?: number,
  ) => Promise<void>;
  onAdd: (job: GenerationDto, ids: string[]) => Promise<void>;
}) {
  const [jobId, setJobId] = useState("");
  const [tab, setTab] = useState<"case" | "candidate">("case");
  const [id, setId] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<
    Record<
      string,
      { content: GenerationResultItemDto["content"]; revision: number }
    >
  >({});
  const [compareId, setCompareId] = useState("");
  const [excluded, setExcluded] = useState(false);
  const job =
    jobs.find((j) => j.id === jobId) ??
    jobs.find((j) => j.status === "succeeded");
  const hasGenerated = job?.results.some((c) => c.kind === "case") ?? false;
  useEffect(() => {
    setTab(hasGenerated ? "case" : "candidate");
  }, [hasGenerated]);
  const results =
    job?.results.filter(
      (c) =>
        (c.kind ?? "candidate") === tab &&
        (excluded || c.status !== "excluded"),
    ) ?? [];
  const item = results.find((c) => c.id === id) ?? results[0];
  const draft = item ? drafts[item.id] : undefined;
  const content = draft?.content ?? item?.content;
  const similar = content ? similarCases(content.title, snapshot) : [];
  const comparison = similar.find((c) => c.id === compareId) ?? similar[0];
  const selection =
    job?.results
      .filter((c) => chosen.has(c.id) && c.status === "pending")
      .map((c) => c.id) ?? [];
  const edit = (patch: Partial<GenerationResultItemDto["content"]>) => {
    if (!item || !job) return;
    setDrafts((old) => ({
      ...old,
      [item.id]: {
        content: { ...(old[item.id]?.content ?? item.content), ...patch },
        revision: old[item.id]?.revision ?? job.revision,
      },
    }));
  };
  async function save() {
    if (!job || !item || !draft) return;
    try {
      await onReview(job, item, "edit", draft.content, draft.revision);
      setDrafts((old) => {
        const next = { ...old };
        delete next[item.id];
        return next;
      });
    } catch {
      /* Parent retains the error and this draft. */
    }
  }
  return (
    <div className="generation-results">
      <div className="source-toolbar">
        <Label htmlFor="result-job">생성 기록</Label>
        <select
          id="result-job"
          className="test-scenario-select"
          value={job?.id ?? ""}
          onChange={(e) => {
            setJobId(e.target.value);
            setChosen(new Set());
          }}
        >
          {jobs
            .filter((j) => j.status === "succeeded")
            .map((j) => (
              <option key={j.id} value={j.id}>
                {new Date(j.createdAt).toLocaleString("ko-KR")}
              </option>
            ))}
        </select>
        <Button variant="outline" onClick={() => setTab("case")}>
          생성된 테스트 케이스
        </Button>
        <Button variant="outline" onClick={() => setTab("candidate")}>
          검토 후보
        </Button>
        <Label>
          <Checkbox checked={excluded} onCheckedChange={setExcluded} />
          제외 항목
        </Label>
      </div>
      <div className="result-workbench">
        <section className="result-list">
          {results.map((c) => (
            <div
              key={c.id}
              className={
                item?.id === c.id ? "result-item is-selected" : "result-item"
              }
            >
              <Checkbox
                aria-label={`${c.content.title} 선택`}
                disabled={disabled || c.status !== "pending"}
                checked={chosen.has(c.id)}
                onCheckedChange={(checked) =>
                  setChosen((old) => {
                    const next = new Set(old);
                    if (checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
              />
              <Button
                variant="ghost"
                onClick={() => {
                  setId(c.id);
                  setCompareId("");
                }}
              >
                {c.content.title}
              </Button>
              <small>
                {c.status === "added"
                  ? "추가됨"
                  : c.status === "excluded"
                    ? "제외됨"
                    : similarCases(c.content.title, snapshot).length
                      ? "유사 테스트 케이스 있음"
                      : ""}
              </small>
            </div>
          ))}
          {!results.length && (
            <p>
              {tab === "case"
                ? "생성된 테스트 케이스가 없습니다."
                : "검토 후보가 없습니다."}
            </p>
          )}
        </section>
        {item && content && job && (
          <section className="result-content">
            {item.reason && (
              <p className="workspace-candidate-reason">{item.reason}</p>
            )}
            <div className="source-toolbar">
              <h3>유사 테스트 케이스 비교</h3>
              {similar.length > 0 && (
                <select
                  aria-label="비교 테스트 케이스"
                  className="test-scenario-select"
                  value={comparison?.id ?? ""}
                  onChange={(e) => setCompareId(e.target.value)}
                >
                  {similar.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caseCode} {c.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="result-comparison">
              <section>
                <h4>기존 테스트 케이스</h4>
                {comparison ? (
                  <>
                    <strong>{comparison.title}</strong>
                    {fields.map(([field, label]) => (
                      <div key={field}>
                        <h5>{label}</h5>
                        <p className="whitespace-pre-wrap">
                          {comparison[field]}
                        </p>
                      </div>
                    ))}
                  </>
                ) : (
                  <p>유사 테스트 케이스가 없습니다.</p>
                )}
              </section>
              <section>
                <h4>새 테스트 케이스</h4>
                <Label htmlFor="result-title">테스트 항목</Label>
                <Input
                  id="result-title"
                  value={content.title}
                  disabled={disabled || item.status === "added"}
                  onValueChange={(title) => edit({ title })}
                />
                {fields.map(([field, label]) => (
                  <div
                    key={field}
                    className={
                      comparison && comparison[field] !== content[field]
                        ? "result-difference"
                        : ""
                    }
                  >
                    <Label htmlFor={`result-${field}`}>{label}</Label>
                    <Textarea
                      id={`result-${field}`}
                      value={content[field]}
                      disabled={disabled || item.status === "added"}
                      onChange={(e) => edit({ [field]: e.target.value })}
                    />
                  </div>
                ))}
              </section>
            </div>
            <Label htmlFor="result-priority">우선순위</Label>
            <select
              id="result-priority"
              className="test-scenario-select"
              disabled={disabled || item.status === "added"}
              value={content.priority ?? ""}
              onChange={(e) =>
                edit({
                  priority: (e.target.value ||
                    null) as GenerationResultItemDto["content"]["priority"],
                })
              }
            >
              <option value="">미지정</option>
              <option value="high">높음</option>
              <option value="medium">보통</option>
              <option value="low">낮음</option>
            </select>
            {snapshot.columns
              .filter((c) => c.kind === "custom")
              .map((column) => (
                <Label key={column.id}>
                  {column.name}
                  <Input
                    value={content.customValues[column.id] ?? ""}
                    disabled={disabled || item.status === "added"}
                    onValueChange={(value) =>
                      edit({
                        customValues: {
                          ...content.customValues,
                          [column.id]: value,
                        },
                      })
                    }
                  />
                </Label>
              ))}
            {item.status !== "added" && (
              <div className="source-toolbar">
                <Button
                  variant="outline"
                  disabled={disabled || !draft}
                  onClick={() => void save()}
                >
                  수정 저장
                </Button>
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    void onReview(
                      job,
                      item,
                      item.status === "excluded" ? "restore" : "exclude",
                    ).catch(() => {})
                  }
                >
                  {item.status === "excluded" ? "복원" : "제외"}
                </Button>
              </div>
            )}
          </section>
        )}
      </div>
      <footer className="source-toolbar">
        <Button
          disabled={
            disabled ||
            !job ||
            !selection.length ||
            selection.some((i) => !!drafts[i])
          }
          onClick={() => {
            if (job)
              void onAdd(job, selection)
                .then(() => setChosen(new Set()))
                .catch(() => {});
          }}
        >
          {selection.length
            ? `${selection.length}개 시나리오에 추가`
            : "시나리오에 추가"}
        </Button>
      </footer>
    </div>
  );
}
