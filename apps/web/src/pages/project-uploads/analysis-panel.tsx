import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from "@cheddar/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { FrameReference, Snapshot } from "@/entities/test-case";
import type { AnalysisDto, AnalysisItemDto } from "@/shared/api/generated";
import { readAnalysis, writeAnalysis } from "./analysis-api";
import { SourceImage } from "./source-viewer";

type Tab = "sources" | "policies" | "requirements";
const kinds = {
  screen: "화면",
  state: "화면 상태",
  requirement: "요구사항",
  question: "정책",
  relation: "관계",
};
export function AnalysisPanel({
  open,
  onClose,
  snapshot,
  frames,
  onGenerate,
}: {
  open: boolean;
  onClose: () => void;
  snapshot: Snapshot;
  frames: FrameReference[];
  onGenerate: (ids: string[], description: string) => void;
}) {
  const projectId = snapshot.projectId;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["analysis", projectId],
    queryFn: () => readAnalysis(projectId),
    enabled: open,
  });
  const [draft, setDraft] = useState<AnalysisDto>();
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [tab, setTab] = useState<Tab>("sources");
  const [id, setId] = useState("");
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (query.data && !dirty) setDraft(structuredClone(query.data));
  }, [query.data, dirty]);
  const list =
    draft?.items.filter(
      (i) =>
        (tab === "policies"
          ? i.kind === "question"
          : tab === "requirements"
            ? i.kind === "requirement" || i.kind === "question"
            : true) &&
        (!search ||
          `${i.title} ${i.text}`
            .toLowerCase()
            .includes(search.toLowerCase())) &&
        (!missing ||
          tab !== "requirements" ||
          !draft.links.some(
            (l) =>
              l.requirementId === i.id &&
              l.testScenarioId === snapshot.id &&
              snapshot.cases.some((c) => c.id === l.caseId),
          )),
    ) ?? [];
  const item = list.find((i) => i.id === id) ?? list[0];
  const frame = frames.find((f) => f.id === item?.frameId);
  function edit(patch: Partial<AnalysisItemDto>) {
    if (!draft || !item) return;
    setDraft({
      ...draft,
      items: draft.items.map((i) =>
        i.id === item.id ? { ...i, ...patch } : i,
      ),
    });
    setDirty(true);
  }
  async function save() {
    if (!draft) return false;
    setBusy(true);
    setError(undefined);
    try {
      const next = await writeAnalysis(projectId, draft);
      setDraft(next);
      setDirty(false);
      client.setQueryData(["analysis", projectId], next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function close() {
    if (dirty && !(await save())) return;
    onClose();
  }
  function link(caseId: string, checked: boolean) {
    if (!draft || !item) return;
    setDraft({
      ...draft,
      links: checked
        ? [
            ...draft.links,
            { requirementId: item.id, testScenarioId: snapshot.id, caseId },
          ]
        : draft.links.filter(
            (l) =>
              !(
                l.requirementId === item.id &&
                l.testScenarioId === snapshot.id &&
                l.caseId === caseId
              ),
          ),
    });
    setDirty(true);
  }
  async function generate() {
    if (!item) return;
    if (dirty && !(await save())) return;
    onGenerate(
      [item.id],
      item.kind === "question"
        ? `다음 정책 답변으로 관련 검토 후보를 보완한다.\n질문: ${item.text}\n답변: ${item.answer ?? ""}`
        : item.text,
    );
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) void close();
      }}
    >
      <DialogContent className="analysis-dialog" aria-describedby={undefined}>
        <DialogTitle>분석 결과 편집</DialogTitle>
        <nav className="analysis-tabs" aria-label="분석 결과 보기">
          {(
            [
              ["sources", "자료"],
              ["policies", "정책 확인"],
              ["requirements", "요구사항 검토"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={tab === value ? "default" : "ghost"}
              onClick={() => setTab(value)}
            >
              {label}
            </Button>
          ))}
          <Button
            variant="outline"
            disabled={busy || !dirty}
            onClick={() => void save()}
          >
            저장
          </Button>
        </nav>
        {query.isPending && <p role="status">분석 결과 불러오는 중</p>}
        {query.isError && (
          <p role="alert">
            분석 결과를 불러오지 못했습니다.
            <Button variant="link" onClick={() => void query.refetch()}>
              다시 불러오기
            </Button>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <div className="analysis-workbench">
          <section className="analysis-list">
            <Input
              aria-label="분석 결과 검색"
              value={search}
              onValueChange={setSearch}
            />
            {tab === "requirements" && (
              <Label>
                <Checkbox checked={missing} onCheckedChange={setMissing} />
                테스트 케이스 연결 없음
              </Label>
            )}
            {list.map((i) => (
              <Button
                key={i.id}
                variant={item?.id === i.id ? "secondary" : "ghost"}
                onClick={() => setId(i.id)}
              >
                {i.title}
              </Button>
            ))}
            {draft && !list.length && <p>분석 결과가 없습니다.</p>}
          </section>
          {item && (
            <>
              <section className="analysis-source">
                <h3>{item.title}</h3>
                {frame && (
                  <SourceImage
                    projectId={projectId}
                    frame={frame}
                    region={
                      item.kind === "screen" || item.kind === "state"
                        ? item.region
                        : undefined
                    }
                  />
                )}
                <h3>
                  {item.kind === "question"
                    ? "확인 사유"
                    : item.kind === "relation"
                      ? "관계 설명"
                      : "원본 설명"}
                </h3>
                <p className="whitespace-pre-wrap">
                  {item.text || "원문 설명이 없습니다."}
                </p>
                {item.nodeId && frame && (
                  <a
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.figma.com/design/${encodeURIComponent(frame.figmaFileKey)}?node-id=${encodeURIComponent(item.nodeId)}`}
                  >
                    원본 열기
                  </a>
                )}
              </section>
              <section className="analysis-inspector">
                <Label htmlFor="analysis-title">이름</Label>
                <Input
                  id="analysis-title"
                  value={item.title}
                  onValueChange={(title) => edit({ title })}
                  maxLength={255}
                />
                {tab === "sources" && (
                  <>
                    <Label htmlFor="analysis-kind">유형</Label>
                    <select
                      className="test-scenario-select"
                      id="analysis-kind"
                      value={item.kind}
                      onChange={(e) =>
                        edit({
                          kind: e.target.value as AnalysisItemDto["kind"],
                        })
                      }
                    >
                      {Object.entries(kinds).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <Label htmlFor="analysis-parent">화면 연결</Label>
                    <select
                      id="analysis-parent"
                      className="test-scenario-select"
                      value={item.parentId ?? ""}
                      onChange={(e) =>
                        edit({ parentId: e.target.value || undefined })
                      }
                    >
                      <option value="">연결 없음</option>
                      {draft?.items
                        .filter(
                          (i) =>
                            i.id !== item.id &&
                            (i.kind === "screen" || i.kind === "state"),
                        )
                        .map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.title}
                          </option>
                        ))}
                    </select>
                    {item.region && (
                      <fieldset>
                        <legend>원본 영역</legend>
                        {(["x", "y", "width", "height"] as const).map(
                          (key, index) => (
                            <Label key={key}>
                              {
                                ["가로 위치", "세로 위치", "너비", "높이"][
                                  index
                                ]
                              }
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={
                                  Math.round(
                                    (item.region?.[key] ?? 0) * 10000,
                                  ) / 100
                                }
                                onValueChange={(value) =>
                                  edit({
                                    region: {
                                      ...(item.region ?? {
                                        x: 0,
                                        y: 0,
                                        width: 1,
                                        height: 1,
                                      }),
                                      [key]: Number(value) / 100,
                                    },
                                  })
                                }
                              />
                            </Label>
                          ),
                        )}
                      </fieldset>
                    )}
                    {item.kind === "relation" && (
                      <>
                        <Label htmlFor="analysis-relation">관계 유형</Label>
                        <select
                          id="analysis-relation"
                          className="test-scenario-select"
                          value={item.relation ?? "annotation"}
                          onChange={(e) =>
                            edit({
                              relation: e.target
                                .value as AnalysisItemDto["relation"],
                            })
                          }
                        >
                          <option value="transition">화면 이동</option>
                          <option value="state">상태 변화</option>
                          <option value="annotation">설명 연결</option>
                        </select>
                        {(["fromId", "toId"] as const).map((field, index) => (
                          <Label key={field}>
                            {index ? "도착" : "출발"}
                            <select
                              className="test-scenario-select"
                              value={item[field] ?? ""}
                              onChange={(e) =>
                                edit({ [field]: e.target.value || undefined })
                              }
                            >
                              <option value="">선택</option>
                              {draft?.items
                                .filter(
                                  (i) =>
                                    i.id !== item.id && i.kind !== "relation",
                                )
                                .map((i) => (
                                  <option key={i.id} value={i.id}>
                                    {i.title}
                                  </option>
                                ))}
                            </select>
                          </Label>
                        ))}
                      </>
                    )}
                  </>
                )}
                {item.kind === "question" && (
                  <>
                    <Label htmlFor="policy-answer">정책 답변</Label>
                    <Textarea
                      id="policy-answer"
                      value={item.answer ?? ""}
                      onChange={(e) => edit({ answer: e.target.value })}
                    />
                    <Label>
                      <Checkbox
                        checked={item.useAsRule ?? false}
                        onCheckedChange={(useAsRule) => edit({ useAsRule })}
                      />
                      프로젝트 규칙 저장
                    </Label>
                  </>
                )}
                {(item.kind === "requirement" || item.kind === "question") && (
                  <>
                    <h3>테스트 케이스 연결</h3>
                    {snapshot.cases.map((c) => (
                      <Label key={c.id}>
                        <Checkbox
                          checked={
                            draft?.links.some(
                              (l) =>
                                l.requirementId === item.id &&
                                l.testScenarioId === snapshot.id &&
                                l.caseId === c.id,
                            ) ?? false
                          }
                          onCheckedChange={(checked) => link(c.id, checked)}
                        />
                        {c.title || c.caseCode || "제목 없음"}
                      </Label>
                    ))}
                    <Button
                      disabled={
                        busy ||
                        (item.kind === "question" && !item.answer?.trim())
                      }
                      onClick={() => void generate()}
                    >
                      {item.kind === "question"
                        ? "검토 후보 보완"
                        : "테스트 케이스 생성"}
                    </Button>
                  </>
                )}
              </section>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
