import { Button, Input, Textarea } from "@cheddar/ui";
import { useState } from "react";
import type { Snapshot } from "@/entities/test-case";
import type { Flow } from "./canvas-session";

export const stepKinds = {
  start: "시작",
  screen: "화면",
  action: "행동",
  condition: "분기",
  end: "종료",
} as const;
export function CanvasInspector({
  flow,
  snapshot,
  stepId,
  edgeId,
  disabled,
  onChange,
  onClose,
  onConfirm,
}: {
  flow: Flow;
  snapshot: Snapshot;
  stepId?: string;
  edgeId?: string;
  disabled: boolean;
  onChange: (flow: Flow) => void;
  onClose: () => void;
  onConfirm: (title: string, description: string, action: () => void) => void;
}) {
  const [search, setSearch] = useState("");
  const step = flow.steps.find((s) => s.id === stepId);
  const edge = flow.edges.find((e) => e.id === edgeId);
  if (!step && !edge) return null;
  function updateStep(patch: Partial<Flow["steps"][number]>) {
    onChange({
      ...flow,
      steps: flow.steps.map((s) => (s.id === stepId ? { ...s, ...patch } : s)),
    });
  }
  function updateEdge(patch: Partial<Flow["edges"][number]>) {
    onChange({
      ...flow,
      edges: flow.edges.map((e) => (e.id === edgeId ? { ...e, ...patch } : e)),
    });
  }
  return (
    <aside
      className="canvas-inspector"
      aria-label={step ? "단계 편집" : "연결 편집"}
    >
      <header>
        <strong>{step ? "단계 편집" : "연결 편집"}</strong>
        <Button variant="ghost" onClick={onClose} aria-label="흐름 편집 닫기">
          닫기
        </Button>
      </header>
      {step ? (
        <fieldset disabled={disabled}>
          <label htmlFor="canvas-step-title">
            단계 이름
            <Input
              id="canvas-step-title"
              value={step.title}
              maxLength={255}
              onValueChange={(title) => updateStep({ title })}
            />
          </label>
          <label>
            유형
            <select
              value={step.kind}
              onChange={(e) =>
                updateStep({ kind: e.target.value as keyof typeof stepKinds })
              }
            >
              {Object.entries(stepKinds).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="canvas-step-description">
            설명
            <Textarea
              id="canvas-step-description"
              value={step.description}
              maxLength={10000}
              onChange={(e) => updateStep({ description: e.target.value })}
            />
          </label>
          <div className="canvas-case-connections">
            <strong>케이스 연결</strong>
            <Input
              aria-label="연결할 케이스 검색"
              placeholder="ID 또는 제목 검색"
              value={search}
              onValueChange={setSearch}
            />
            {snapshot.cases
              .filter((c) =>
                `${c.caseCode} ${c.title}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <label key={c.id}>
                  <input
                    type="checkbox"
                    checked={step.caseIds.includes(c.id)}
                    onChange={(e) =>
                      updateStep({
                        caseIds: e.target.checked
                          ? [...step.caseIds, c.id]
                          : step.caseIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  <span>
                    {c.caseCode} {c.title || "제목 없음"}
                  </span>
                </label>
              ))}
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const connections = flow.edges.filter(
                (e) => e.from === step.id || e.to === step.id,
              ).length;
              onConfirm(
                "단계 삭제",
                [
                  connections ? `흐름 연결 ${connections}개가 삭제됩니다.` : "",
                  step.caseIds.length
                    ? `테스트 케이스 ${step.caseIds.length}개의 연결이 해제됩니다. 테스트 케이스는 유지됩니다.`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" "),
                () => {
                  onChange({
                    steps: flow.steps.filter((s) => s.id !== step.id),
                    edges: flow.edges.filter(
                      (e) => e.from !== step.id && e.to !== step.id,
                    ),
                  });
                  onClose();
                },
              );
            }}
          >
            단계 삭제
          </Button>
        </fieldset>
      ) : (
        edge && (
          <fieldset disabled={disabled}>
            <label>
              출발 단계
              <select
                value={edge.from}
                onChange={(e) => updateEdge({ from: e.target.value })}
              >
                {flow.steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              도착 단계
              <select
                value={edge.to}
                onChange={(e) => updateEdge({ to: e.target.value })}
              >
                {flow.steps.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="canvas-form-field">
              <label htmlFor="canvas-edge-condition">조건</label>
              <Textarea
                id="canvas-edge-condition"
                value={edge.condition}
                maxLength={2000}
                onChange={(e) => updateEdge({ condition: e.target.value })}
              />
            </div>
            <Button
              variant="outline"
              onClick={() => {
                onChange({
                  ...flow,
                  edges: flow.edges.filter((e) => e.id !== edge.id),
                });
                onClose();
              }}
            >
              연결 삭제
            </Button>
          </fieldset>
        )
      )}
    </aside>
  );
}
