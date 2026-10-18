import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@cheddar/ui/legacy";
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
  question: "확인 질문",
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
    if (!draft || busy) return false;
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
    if (busy) return;
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
        ? `다음 확인 질문 답변으로 테스트 케이스를 보완한다.\n질문: ${item.text}\n답변: ${item.answer ?? ""}`
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
        <DialogTitle>화면 분석</DialogTitle>
        <nav className="analysis-tabs" aria-label="분석 항목">
          {(
            [
              ["sources", "화면 분석"],
              ["policies", "확인 질문"],
              ["requirements", "요구사항 연결"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              variant={tab === value ? "default" : "ghost"}
              aria-pressed={tab === value}
              disabled={busy}
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
        {query.isPending && <p role="status">분석 결과 조회 중</p>}
        {query.isError && (
          <p role="alert">
            분석 결과를 불러오지 못했습니다.
            <Button variant="link" onClick={() => void query.refetch()}>
              다시 불러오기
            </Button>
          </p>
        )}
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={busy} className="analysis-workbench">
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
            {draft && !list.length && (
              <p>
                {search
                  ? "검색 결과가 없습니다."
                  : tab === "policies"
                    ? "확인 질문이 없습니다."
                    : tab === "requirements"
                      ? missing
                        ? "미연결 요구사항이 없습니다."
                        : "요구사항이 없습니다."
                      : "분석 결과가 없습니다."}
              </p>
            )}
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
                  {item.text || "원본 설명이 없습니다."}
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
                    <AnalysisSelect
                      id="analysis-kind"
                      label="유형"
                      value={item.kind}
                      items={Object.entries(kinds).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                      onValueChange={(kind) =>
                        edit({ kind: kind as AnalysisItemDto["kind"] })
                      }
                    />
                    <AnalysisSelect
                      id="analysis-parent"
                      label="화면 연결"
                      value={item.parentId ?? ""}
                      items={[
                        { value: "", label: "연결 없음" },
                        ...(draft?.items ?? [])
                          .filter(
                            (i) =>
                              i.id !== item.id &&
                              (i.kind === "screen" || i.kind === "state"),
                          )
                          .map((i) => ({ value: i.id, label: i.title })),
                      ]}
                      onValueChange={(parentId) =>
                        edit({ parentId: parentId || undefined })
                      }
                    />
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
                        <AnalysisSelect
                          id="analysis-relation"
                          label="관계 유형"
                          value={item.relation ?? "annotation"}
                          items={[
                            { value: "transition", label: "화면 이동" },
                            { value: "state", label: "상태 변화" },
                            { value: "annotation", label: "설명 연결" },
                          ]}
                          onValueChange={(relation) =>
                            edit({
                              relation: relation as AnalysisItemDto["relation"],
                            })
                          }
                        />
                        {(["fromId", "toId"] as const).map((field, index) => (
                          <AnalysisSelect
                            key={field}
                            id={`analysis-${field}`}
                            label={index ? "도착" : "출발"}
                            value={item[field] ?? ""}
                            items={[
                              { value: "", label: "선택" },
                              ...(draft?.items ?? [])
                                .filter(
                                  (i) =>
                                    i.id !== item.id && i.kind !== "relation",
                                )
                                .map((i) => ({ value: i.id, label: i.title })),
                            ]}
                            onValueChange={(value) =>
                              edit({ [field]: value || undefined })
                            }
                          />
                        ))}
                      </>
                    )}
                  </>
                )}
                {item.kind === "question" && (
                  <>
                    <Label htmlFor="policy-answer">답변</Label>
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
                      프로젝트 규칙으로 저장
                    </Label>
                  </>
                )}
                {(item.kind === "requirement" || item.kind === "question") && (
                  <>
                    <h3>테스트 케이스 연결</h3>
                    {snapshot.cases.length === 0 && (
                      <p>테스트 케이스가 없습니다.</p>
                    )}
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
                        ? "답변으로 생성"
                        : "테스트 케이스 생성"}
                    </Button>
                  </>
                )}
              </section>
            </>
          )}
        </fieldset>
      </DialogContent>
    </Dialog>
  );
}

function AnalysisSelect({
  id,
  label,
  value,
  items,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onValueChange: (value: string) => void;
}) {
  return (
    <>
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(value) => onValueChange(value ?? "")}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
