import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@cheddar/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/entities/test-case";
import { readAnalysis } from "@/pages/project-uploads/analysis-api";
import { SourceImage } from "@/pages/project-uploads/source-viewer";
import type {
  GenerationDto,
  GenerationResultItemDto,
  ReviewGenerationResultDto,
} from "@/shared/api/generated";
import {
  type ResultDraft,
  type ResultDrafts,
  readResultDrafts,
  resultDraftId,
  writeResultDrafts,
} from "./generation-drafts";

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
      .filter((word) => word.length > 1),
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
              .filter((word) => words.has(word)).length /
            Math.max(words.size, 1),
    }))
    .filter((entry) => entry.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
export function GenerationResults({
  jobs,
  snapshot,
  disabled,
  onReview,
  onDraftSafety,
}: {
  jobs: GenerationDto[];
  snapshot: Snapshot;
  disabled: boolean;
  onReview: (
    job: GenerationDto,
    item: GenerationResultItemDto,
    action: ReviewGenerationResultDto["action"],
    content?: GenerationResultItemDto["content"],
    revision?: number,
    question?: ReviewGenerationResultDto["question"],
  ) => Promise<void>;
  onDraftSafety: (safe: boolean) => void;
}) {
  const [selected, setSelected] = useState("");
  const [excluded, setExcluded] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [safe, setSafe] = useState(true);
  const [readFailed, setReadFailed] = useState(false);
  const [drafts, setDrafts] = useState<ResultDrafts>(() => {
    try {
      return readResultDrafts(snapshot.projectId, snapshot.id);
    } catch {
      return {};
    }
  });
  const draftsRef = useRef(drafts);
  useEffect(() => {
    try {
      const saved = readResultDrafts(snapshot.projectId, snapshot.id);
      setDrafts(saved);
      draftsRef.current = saved;
    } catch {
      setReadFailed(true);
      setError(
        "확인 항목의 초안을 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요.",
      );
    }
  }, [snapshot.projectId, snapshot.id]);
  useEffect(() => {
    onDraftSafety(safe);
    return () => onDraftSafety(true);
  }, [safe, onDraftSafety]);
  useEffect(() => {
    if (safe) return;
    const preventLoss = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => window.removeEventListener("beforeunload", preventLoss);
  }, [safe]);
  const analysis = useQuery({
    queryKey: ["analysis", snapshot.projectId],
    queryFn: () => readAnalysis(snapshot.projectId),
    retry: false,
  });
  const entries = jobs
    .filter((job) => job.status === "succeeded")
    .flatMap((job) =>
      job.results
        .filter(
          (item) =>
            item.status === "pending" ||
            (excluded && item.status === "excluded"),
        )
        .map((item) => ({ job, item, key: resultDraftId(job.id, item.id) })),
    );
  const entry =
    entries.find((candidate) => candidate.key === selected) ?? entries[0];
  const { job, item, key } = entry ?? {};
  const draft = key ? drafts[key] : undefined;
  const content = draft?.content ?? item?.content;
  const question = analysis.data?.items.find(
    (source) => source.id === item?.id && source.kind === "question",
  );
  const questionDraft = draft?.question;
  const similar = content ? similarCases(content.title, snapshot) : [];
  const comparison =
    similar.find((candidate) => candidate.id === compareId) ?? similar[0];
  const stale =
    !!draft &&
    !!job &&
    (draft.revision !== job.revision ||
      (!!draft.question &&
        draft.question.expectedRevision !== analysis.data?.revision));
  const sources =
    analysis.data?.items.filter((source) =>
      item?.requirementIds?.includes(source.id),
    ) ?? [];
  const frameIds = [
    ...new Set([
      ...(content?.relatedFrameIds ?? []),
      ...sources.flatMap((source) => (source.frameId ? [source.frameId] : [])),
      ...(question?.frameId ? [question.frameId] : []),
    ]),
  ];
  const locked = disabled || busy || readFailed;
  function persist(next: ResultDrafts) {
    draftsRef.current = next;
    setDrafts(next);
    try {
      writeResultDrafts(snapshot.projectId, snapshot.id, next);
      setSafe(true);
    } catch {
      setSafe(false);
    }
  }
  function edit(
    patch: Partial<ResultDraft["content"]>,
    answerPatch?: Partial<NonNullable<ResultDraft["question"]>>,
  ) {
    if (!key || !job || !item) return;
    const existing = draftsRef.current[key];
    persist({
      ...draftsRef.current,
      [key]: {
        ...existing,
        content: { ...(existing?.content ?? item.content), ...patch },
        revision: existing?.revision ?? job.revision,
        ...(answerPatch && question && analysis.data
          ? {
              question: {
                answer: question.answer ?? "",
                useAsRule: question.useAsRule ?? false,
                expectedRevision: analysis.data.revision,
                ...existing?.question,
                ...answerPatch,
              },
            }
          : {}),
      },
    });
  }
  async function act(action: ReviewGenerationResultDto["action"]) {
    if (!job || !item || !key || !content) return;
    setBusy(true);
    setError(undefined);
    try {
      await onReview(
        job,
        item,
        action,
        action === "add" ? content : undefined,
        draft?.revision ?? job.revision,
        action === "add" ? draft?.question : undefined,
      );
      if (action === "add") {
        const next = { ...draftsRef.current };
        delete next[key];
        persist(next);
      }
    } catch (cause) {
      void analysis.refetch();
      setError(
        cause instanceof Error
          ? cause.message
          : "확인 항목을 반영하지 못했습니다. 다시 시도해주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="generation-results">
      <div className="source-toolbar confirmation-toolbar">
        <span>{entries.length}개</span>
        <Label>
          <Checkbox
            checked={excluded}
            onCheckedChange={(value) => setExcluded(value === true)}
          />
          제외 항목
        </Label>
      </div>
      {(error || !safe || readFailed) && (
        <div className="confirmation-error" role="alert">
          {readFailed
            ? "확인 항목의 초안을 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요."
            : !safe
              ? "초안을 보관하지 못했습니다. 이 창을 닫기 전에 초안 보관을 다시 시도해주세요."
              : error}
          {readFailed && (
            <Button
              variant="outline"
              onClick={() => {
                try {
                  const saved = readResultDrafts(
                    snapshot.projectId,
                    snapshot.id,
                  );
                  draftsRef.current = saved;
                  setDrafts(saved);
                  setReadFailed(false);
                  setError(undefined);
                } catch {
                  setError(
                    "확인 항목의 초안을 읽지 못했습니다. 브라우저 저장 공간을 확인해주세요.",
                  );
                }
              }}
            >
              초안 다시 불러오기
            </Button>
          )}
          {!safe && (
            <Button
              variant="outline"
              onClick={() => persist(draftsRef.current)}
            >
              초안 보관 다시 시도
            </Button>
          )}
        </div>
      )}
      {analysis.isError && (
        <p role="alert">
          확인 질문을 불러오지 못했습니다.{" "}
          <Button variant="link" onClick={() => void analysis.refetch()}>
            다시 불러오기
          </Button>
        </p>
      )}
      <div className="result-workbench">
        <section className="result-list" aria-label="확인 항목 목록">
          {entries.map((candidate) => (
            <div
              key={candidate.key}
              className={
                candidate.key === entry?.key
                  ? "result-item is-selected"
                  : "result-item"
              }
            >
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(candidate.key);
                  setCompareId("");
                  setError(undefined);
                }}
              >
                <span>
                  {drafts[candidate.key]?.content.title ??
                    candidate.item.content.title}
                </span>
                <small>
                  {candidate.item.status === "excluded"
                    ? "제외"
                    : candidate.item.kind === "case"
                      ? "추가 대기"
                      : "확인 대기"}
                </small>
              </Button>
              <time dateTime={candidate.job.createdAt}>
                {new Date(candidate.job.createdAt).toLocaleDateString("ko-KR")}
              </time>
            </div>
          ))}
          {!entries.length && (
            <p className="confirmation-empty">확인 항목이 없습니다.</p>
          )}
        </section>
        {item && content && job && (
          <section className="result-content">
            <div className="confirmation-scroll">
              <header className="confirmation-header">
                <h3>{content.title || "테스트 항목"}</h3>
                {item.reason && (
                  <p className="workspace-candidate-reason">{item.reason}</p>
                )}
              </header>
              {stale && (
                <div className="confirmation-conflict" role="alert">
                  <p>
                    확인 항목이나 질문이 변경되었습니다. 최신 내용과 초안을 비교
                    후 반영해주세요.
                  </p>
                  <details>
                    <summary>최신 내용 비교</summary>
                    <h4>{item.content.title}</h4>
                    {fields.map(([field, label]) => (
                      <div key={field}>
                        <strong>{label}</strong>
                        <p>{item.content[field]}</p>
                      </div>
                    ))}
                    <p>
                      우선순위:{" "}
                      {
                        {
                          high: "높음",
                          medium: "보통",
                          low: "낮음",
                          none: "미지정",
                        }[item.content.priority ?? "none"]
                      }
                    </p>
                    {snapshot.columns
                      .filter((column) => column.kind === "custom")
                      .map((column) => (
                        <div key={column.id}>
                          <strong>{column.name}</strong>
                          <p>
                            {item.content.customValues[column.id] || "미입력"}
                          </p>
                        </div>
                      ))}
                    {question && (
                      <>
                        <p>확인 답변: {question.answer || "미입력"}</p>
                        <p>
                          프로젝트 규칙:{" "}
                          {question.useAsRule ? "사용" : "미사용"}
                        </p>
                      </>
                    )}
                  </details>
                  <Button
                    variant="ghost"
                    disabled={locked}
                    onClick={() => {
                      if (key) {
                        const next = { ...draftsRef.current };
                        delete next[key];
                        persist(next);
                      }
                    }}
                  >
                    최신 내용 사용
                  </Button>
                  <Button
                    variant="outline"
                    disabled={locked || (!!draft?.question && !analysis.data)}
                    onClick={() => {
                      if (key && draft)
                        persist({
                          ...draftsRef.current,
                          [key]: {
                            ...draft,
                            revision: job.revision,
                            ...(draft.question && analysis.data
                              ? {
                                  question: {
                                    ...draft.question,
                                    expectedRevision: analysis.data.revision,
                                  },
                                }
                              : {}),
                          },
                        });
                    }}
                  >
                    최신 내용 확인 후 초안 유지
                  </Button>
                </div>
              )}
              {question && (
                <section className="confirmation-question">
                  <h4>확인 질문</h4>
                  <p>{question.text}</p>
                  <Label htmlFor="confirmation-answer">확인 답변</Label>
                  <Textarea
                    id="confirmation-answer"
                    maxLength={20000}
                    value={questionDraft?.answer ?? question.answer ?? ""}
                    disabled={locked}
                    onChange={(event) =>
                      edit({}, { answer: event.target.value })
                    }
                  />
                  <Label>
                    <Checkbox
                      checked={
                        questionDraft?.useAsRule ?? question.useAsRule ?? false
                      }
                      disabled={locked}
                      onCheckedChange={(value) =>
                        edit({}, { useAsRule: value === true })
                      }
                    />
                    프로젝트 규칙으로 저장
                  </Label>
                </section>
              )}
              <div className="confirmation-fields">
                <div>
                  <Label htmlFor="result-title">테스트 항목</Label>
                  <Input
                    id="result-title"
                    value={content.title}
                    disabled={locked}
                    maxLength={1000}
                    onValueChange={(title) => edit({ title })}
                  />
                </div>
                {fields.map(([field, label]) => (
                  <div key={field}>
                    <Label htmlFor={`result-${field}`}>
                      {snapshot.columns.find((column) => column.field === field)
                        ?.name ?? label}
                    </Label>
                    <Textarea
                      id={`result-${field}`}
                      value={content[field]}
                      disabled={locked}
                      onChange={(event) =>
                        edit({ [field]: event.target.value })
                      }
                    />
                  </div>
                ))}
              </div>
              <Label htmlFor="result-priority">우선순위</Label>
              <Select
                value={content.priority ?? "none"}
                disabled={locked}
                onValueChange={(value) =>
                  edit({
                    priority:
                      value === "none"
                        ? null
                        : (value as ResultDraft["content"]["priority"]),
                  })
                }
              >
                <SelectTrigger id="result-priority">
                  <SelectValue>
                    {
                      {
                        high: "높음",
                        medium: "보통",
                        low: "낮음",
                        none: "미지정",
                      }[content.priority ?? "none"]
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">미지정</SelectItem>
                  <SelectItem value="high">높음</SelectItem>
                  <SelectItem value="medium">보통</SelectItem>
                  <SelectItem value="low">낮음</SelectItem>
                </SelectContent>
              </Select>
              {snapshot.columns
                .filter((column) => column.kind === "custom")
                .map((column) => (
                  <Label key={column.id}>
                    {column.name}
                    <Input
                      value={content.customValues[column.id] ?? ""}
                      disabled={locked}
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
              <details className="confirmation-evidence">
                <summary>근거 자료</summary>
                {sources.map((source) => (
                  <div key={source.id}>
                    <h4>{source.title}</h4>
                    <p>{source.text}</p>
                  </div>
                ))}
                {snapshot.references.frames
                  .filter((frame) => frameIds.includes(frame.id))
                  .map((frame) => (
                    <figure key={frame.id}>
                      <SourceImage
                        projectId={snapshot.projectId}
                        frame={frame}
                      />
                      <figcaption>{frame.name}</figcaption>
                    </figure>
                  ))}
                {!sources.length && !frameIds.length && (
                  <p>근거 자료가 없습니다.</p>
                )}
              </details>
              {similar.length > 0 && (
                <details className="confirmation-comparison">
                  <summary>유사 테스트 케이스 {similar.length}개</summary>
                  <Select
                    value={comparison?.id ?? ""}
                    onValueChange={(value) => setCompareId(value ?? "")}
                  >
                    <SelectTrigger aria-label="비교 테스트 케이스">
                      <SelectValue>
                        {comparison?.caseCode} {comparison?.title}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {similar.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.caseCode} {candidate.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {comparison && (
                    <div className="result-comparison">
                      {fields.map(([field, label]) => (
                        <div key={field}>
                          <h4>{label}</h4>
                          <p className="whitespace-pre-wrap">
                            {comparison[field]}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              )}
            </div>
            <footer className="source-toolbar confirmation-actions">
              <Button
                disabled={
                  locked ||
                  stale ||
                  analysis.isPending ||
                  analysis.isError ||
                  item.status === "excluded"
                }
                onClick={() => void act("add")}
              >
                시나리오에 추가
              </Button>
              <Button
                variant="ghost"
                disabled={locked || stale}
                onClick={() =>
                  void act(item.status === "excluded" ? "restore" : "exclude")
                }
              >
                {item.status === "excluded" ? "복원" : "제외"}
              </Button>
            </footer>
          </section>
        )}
      </div>
    </div>
  );
}
